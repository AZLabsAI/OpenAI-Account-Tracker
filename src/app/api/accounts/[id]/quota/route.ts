/**
 * POST /api/accounts/[id]/quota
 *
 * Fetches live quota data from the Codex app-server and persists it.
 * Detects quota state transitions and fires notifications.
 * The account must already be logged in (codexHomePath must have a valid auth.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount, insertQuotaSnapshot } from "@/lib/db";
import { logInfo, logSuccess, logError } from "@/lib/logger";
import { detectTransitions, processTransitions } from "@/lib/notifications";
import { getNotificationSettings } from "@/lib/notify-settings";

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

    const { fetchQuota } = await import("@/lib/codex-appserver");
    const quotaData = await fetchQuota(account.codexHomePath);

    // ── Detect transitions BEFORE saving (old vs new comparison) ──────────
    const settings = getNotificationSettings();
    const transitions = detectTransitions(
      account,
      account.quotaData,
      quotaData,
      settings.defaultThresholds,
      settings.exhaustedReminderMins,
    );

    // Process notifications (dedup + deliver)
    const notificationEvents = await processTransitions(account, transitions);

    // ── Detect quota depletion → auto-demote the account ────────────────
    const depleted =
      (quotaData.primary?.usedPercent ?? 0) >= 100 ||
      (quotaData.secondary?.usedPercent ?? 0) >= 100;

    const wasDemoted =
      depleted && (account.inUse || account.pinned || account.starred);

    const accountPatch: Record<string, unknown> = {
      quotaData,
      lastChecked: new Date().toISOString(),
    };

    if (wasDemoted) {
      accountPatch.inUse = false;
      accountPatch.pinned = false;
      accountPatch.pinOrder = 0;
      accountPatch.starred = false;
    }

    updateAccount(id, accountPatch);

    insertQuotaSnapshot(
      id,
      quotaData.fetchedAt,
      quotaData.primary ? 100 - quotaData.primary.usedPercent : null,
      quotaData.secondary ? 100 - quotaData.secondary.usedPercent : null,
    );

    if (wasDemoted) {
      logInfo("account", `Auto-demoted ${account.email} — quota depleted, cleared in-use/pinned/starred`, {
        accountId: id,
        accountEmail: account.email,
      });
    }

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

    return NextResponse.json({
      ...quotaData,
      notifications: settings.webEnabled && notificationEvents.length > 0 ? notificationEvents : undefined,
      ...(wasDemoted ? { demoted: true } : {}),
    });

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
