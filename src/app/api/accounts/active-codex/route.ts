/**
 * GET /api/accounts/active-codex
 *
 * Reads ~/.codex/auth.json (the LIVE Codex home directory) to determine
 * which account is currently logged in. Matches by email (decoded from
 * the JWT id_token) against accounts in the database and marks the
 * matching account as `inUse = true`, clearing `inUse` on all others.
 *
 * Fires an account_switch notification when the active account changes.
 *
 * Returns:
 *   { activeEmail, matchedAccountId, matchedAccountName } on success
 *   { activeEmail: null }                                  if no auth.json
 *   { error }                                              on failure
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { getAllAccounts, getSetting, setSetting } from "@/lib/db";
import { getLiveAuthPath } from "@/lib/codex-paths";
import { notifyAccountSwitch } from "@/lib/notifications";

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (payload.length % 4 !== 0) payload += "=";
  return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
}

export async function GET() {
  try {
    const liveAuthPath = getLiveAuthPath();

    // 1. Check if live auth.json exists
    if (!existsSync(liveAuthPath)) {
      return NextResponse.json({
        activeEmail: null,
        message: `No auth.json found at ${liveAuthPath} — no active Codex session`,
      });
    }

    // 2. Read and decode the email from the id_token
    const raw = readFileSync(liveAuthPath, "utf-8");
    const authData = JSON.parse(raw) as {
      tokens?: { id_token?: string; account_id?: string };
    };

    const idToken = authData.tokens?.id_token;
    if (!idToken) {
      return NextResponse.json({
        activeEmail: null,
        message: "auth.json exists but has no id_token",
      });
    }

    const claims = decodeJwtPayload(idToken);
    const activeEmail = (claims.email as string) ?? null;

    if (!activeEmail) {
      return NextResponse.json({
        activeEmail: null,
        message: "id_token has no email claim",
      });
    }

    // 3. Match against DB accounts. IMPORTANT: do NOT overwrite the manual
    // `inUse` flag here — users can have multiple accounts marked in use.
    const accounts = getAllAccounts();
    const matched = accounts.find(
      (a) => a.email.toLowerCase() === activeEmail.toLowerCase(),
    );

    const previousMatchedId = getSetting("active_codex_matched_account_id");
    const previousActiveEmail = getSetting("active_codex_email");
    const previousTrackedAccount = previousMatchedId
      ? accounts.find((account) => account.id === previousMatchedId)
      : undefined;

    let switched = false;

    if (matched) {
      switched = previousMatchedId !== matched.id || previousActiveEmail?.toLowerCase() !== activeEmail.toLowerCase();
      if (switched) {
        await notifyAccountSwitch(matched, previousTrackedAccount?.name);
      }
      setSetting("active_codex_matched_account_id", matched.id);
      setSetting("active_codex_email", activeEmail);

      return NextResponse.json({
        activeEmail,
        matchedAccountId: matched.id,
        matchedAccountName: matched.name,
        switched,
        message: `${matched.name} (${activeEmail}) is the active Codex account`,
      });
    }

    // Unmatched live Codex accounts should not clear any manual UI state.
    switched = previousActiveEmail?.toLowerCase() !== activeEmail.toLowerCase() || Boolean(previousMatchedId);
    setSetting("active_codex_matched_account_id", "");
    setSetting("active_codex_email", activeEmail);

    return NextResponse.json({
      activeEmail,
      matchedAccountId: null,
      matchedAccountName: null,
      switched,
      message: `${activeEmail} is logged in via ${liveAuthPath} but doesn't match any tracked account`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to read active Codex account",
      },
      { status: 500 },
    );
  }
}
