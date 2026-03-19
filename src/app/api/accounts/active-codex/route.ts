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
import { getAllAccounts, updateAccount } from "@/lib/db";
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

    // 3. Match against DB accounts and update inUse flags
    const accounts = getAllAccounts();
    const matched = accounts.find(
      (a) => a.email.toLowerCase() === activeEmail.toLowerCase(),
    );

    // Find the previously active account
    const previouslyActive = accounts.find((a) => a.inUse && a.id !== matched?.id);

    // Clear inUse on all accounts, then set on the matched one
    for (const acc of accounts) {
      if (acc.inUse && acc.id !== matched?.id) {
        updateAccount(acc.id, { inUse: false });
      }
    }

    let switched = false;
    if (matched && !matched.inUse) {
      updateAccount(matched.id, { inUse: true });
      switched = true;

      // Fire account switch notification
      if (previouslyActive) {
        await notifyAccountSwitch(matched, previouslyActive.name);
      }
    }

    return NextResponse.json({
      activeEmail,
      matchedAccountId: matched?.id ?? null,
      matchedAccountName: matched?.name ?? null,
      switched,
      message: matched
        ? `${matched.name} (${activeEmail}) is the active Codex account`
        : `${activeEmail} is logged in via ${liveAuthPath} but doesn't match any tracked account`,
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
