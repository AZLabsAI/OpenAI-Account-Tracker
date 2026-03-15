/**
 * POST /api/accounts/[id]/login
 *
 * Starts the Codex OAuth browser login flow for one account.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount } from "@/lib/db";
import { loginAccount, fetchQuota } from "@/lib/codex-appserver";
import { logInfo, logSuccess, logWarn, logError } from "@/lib/logger";
import { homedir } from "os";
import { mkdirSync } from "fs";
import path from "path";

export const maxDuration = 310;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now();

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { codexHomePath?: string };

    const account = getAccount(id);
    if (!account) {
      logError("login", `Login failed — account not found: ${id}`, { accountId: id });
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let codexHomePath = body.codexHomePath ?? account.codexHomePath;

    if (!codexHomePath) {
      codexHomePath = path.join(homedir(), ".codex-accounts", id);
    }

    mkdirSync(codexHomePath, { recursive: true });
    updateAccount(id, { codexHomePath });

    logInfo("login", `OAuth login started for ${account.email} — waiting for browser…`, {
      accountId: id,
      accountEmail: account.email,
      detail: { codexHomePath },
    });

    const result = await loginAccount(codexHomePath, 5 * 60 * 1000);

    if (!result.success) {
      logError("login", `OAuth login failed for ${account.email}: ${result.error}`, {
        accountId: id,
        accountEmail: account.email,
        durationMs: Date.now() - t0,
        detail: result.error,
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    logSuccess("login", `OAuth login succeeded for ${account.email}`, {
      accountId: id,
      accountEmail: account.email,
      durationMs: Date.now() - t0,
    });

    // Immediately fetch quota
    let quotaData;
    try {
      logInfo("quota", `Post-login quota fetch for ${account.email}…`, {
        accountId: id,
        accountEmail: account.email,
      });

      quotaData = await fetchQuota(codexHomePath);
      updateAccount(id, {
        quotaData,
        lastChecked: new Date().toISOString(),
      });

      const primaryLeft = quotaData.primary ? `${100 - quotaData.primary.usedPercent}%` : "n/a";
      const weeklyLeft = quotaData.secondary ? `${100 - quotaData.secondary.usedPercent}%` : "n/a";

      logSuccess("quota", `Post-login quota for ${account.email} — 5h: ${primaryLeft}, weekly: ${weeklyLeft}`, {
        accountId: id,
        accountEmail: account.email,
        detail: { planType: quotaData.planType, primary: quotaData.primary, secondary: quotaData.secondary },
      });
    } catch (qErr) {
      logWarn("quota", `Post-login quota fetch failed for ${account.email} (non-fatal): ${qErr instanceof Error ? qErr.message : String(qErr)}`, {
        accountId: id,
        accountEmail: account.email,
        detail: qErr instanceof Error ? qErr.stack : String(qErr),
      });
    }

    return NextResponse.json({
      success: true,
      codexHomePath,
      email: quotaData?.email,
      planType: quotaData?.planType,
      quotaData,
    });

  } catch (err) {
    const { id } = await params;
    const account = getAccount(id);
    logError("login", `Login crashed for ${account?.email ?? id}: ${err instanceof Error ? err.message : String(err)}`, {
      accountId: id,
      accountEmail: account?.email,
      durationMs: Date.now() - t0,
      detail: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 },
    );
  }
}
