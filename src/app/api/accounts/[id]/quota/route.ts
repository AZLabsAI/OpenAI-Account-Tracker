/**
 * POST /api/accounts/[id]/quota
 *
 * Fetches live quota data from the Codex app-server and persists it.
 * The account must already be logged in (codexHomePath must have a valid auth.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount } from "@/lib/db";
import { fetchQuota } from "@/lib/codex-appserver";
import { logInfo, logSuccess, logError } from "@/lib/logger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now();

  try {
    const { id } = await params;

    const account = getAccount(id);
    if (!account) {
      logError("quota", `Quota fetch failed — account not found: ${id}`, { accountId: id });
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!account.codexHomePath) {
      logError("quota", `Quota fetch failed — no codexHomePath: ${account.email}`, {
        accountId: id,
        accountEmail: account.email,
      });
      return NextResponse.json(
        { error: "No codexHomePath set — sign in first" },
        { status: 400 },
      );
    }

    logInfo("quota", `Fetching quota for ${account.email}…`, {
      accountId: id,
      accountEmail: account.email,
      detail: { codexHomePath: account.codexHomePath },
    });

    const quotaData = await fetchQuota(account.codexHomePath);

    updateAccount(id, {
      quotaData,
      lastChecked: new Date().toISOString(),
    });

    const durationMs = Date.now() - t0;
    const primaryLeft = quotaData.primary ? `${100 - quotaData.primary.usedPercent}%` : "n/a";
    const weeklyLeft = quotaData.secondary ? `${100 - quotaData.secondary.usedPercent}%` : "n/a";

    logSuccess("quota", `Quota fetched for ${account.email} — 5h: ${primaryLeft} left, weekly: ${weeklyLeft} left`, {
      accountId: id,
      accountEmail: account.email,
      durationMs,
      detail: {
        planType: quotaData.planType,
        primary: quotaData.primary,
        secondary: quotaData.secondary,
        email: quotaData.email,
      },
    });

    return NextResponse.json(quotaData);

  } catch (err) {
    const durationMs = Date.now() - t0;
    const { id } = await params;
    const account = getAccount(id);

    logError("quota", `Quota fetch failed for ${account?.email ?? id}: ${err instanceof Error ? err.message : String(err)}`, {
      accountId: id,
      accountEmail: account?.email,
      durationMs,
      detail: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quota fetch failed" },
      { status: 500 },
    );
  }
}
