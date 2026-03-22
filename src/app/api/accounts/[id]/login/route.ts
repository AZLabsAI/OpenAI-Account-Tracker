/**
 * POST /api/accounts/[id]/login
 *
 * Starts the Codex OAuth browser login flow for one account.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount } from "@/lib/db";
import { getAccountCodexHome } from "@/lib/codex-paths";
import { detectTransitions, processTransitions } from "@/lib/notifications";
import { getNotificationSettings } from "@/lib/notify-settings";
import { logInfo, logSuccess, logWarn, logError } from "@/lib/logger";
import { mkdirSync } from "fs";

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

    const codexHomePath = getAccountCodexHome(id, body.codexHomePath ?? account.codexHomePath);
    const settings = getNotificationSettings();

    mkdirSync(codexHomePath, { recursive: true });
    updateAccount(id, { codexHomePath });

    logInfo("login", `OAuth login started for ${account.email} — waiting for browser…`, {
      accountId: id,
      accountEmail: account.email,
      detail: { codexHomePath },
    });

    const { loginAccount, fetchQuota } = await import("@/lib/codex-appserver");
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
    let notificationEvents: Awaited<ReturnType<typeof processTransitions>> | undefined;
    try {
      logInfo("quota", `Post-login quota fetch for ${account.email}…`, {
        accountId: id,
        accountEmail: account.email,
      });

      quotaData = await fetchQuota(codexHomePath);
      const transitions = detectTransitions(
        account,
        account.quotaData,
        quotaData,
        settings.defaultThresholds,
        settings.exhaustedReminderMins,
      );
      notificationEvents = await processTransitions(account, transitions);

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
      notifications: settings.webEnabled && notificationEvents?.length ? notificationEvents : undefined,
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
