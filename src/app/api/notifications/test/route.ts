/**
 * POST /api/notifications/test?channel=telegram|native|web|all
 *
 * Fires a realistic test notification through the specified channel(s).
 * Shows both quota windows, just like real notifications do.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllAccounts } from "@/lib/db";
import { getTelegramCredentials } from "@/lib/notify-settings";
import { getNativeCapability } from "@/lib/notify-native-capability";
import { sendTelegram } from "@/lib/notify-telegram";
import { sendNative } from "@/lib/notify-native";
import { logInfo, logSuccess, logWarn } from "@/lib/logger";
import {
  buildWebNotificationPayload,
  type NotificationPreview,
  renderNativeNotification,
  renderTelegramNotification,
} from "@/lib/notification-presentation";
import type { NotificationEventType, QuotaData } from "@/types";

function buildTestContext(eventType: NotificationEventType, accountName: string, accountEmail: string) {
  const quota: QuotaData = {
    fetchedAt: new Date().toISOString(),
    email: accountEmail,
    planType: "plus",
    primary: { usedPercent: 95, resetsAt: Math.floor(Date.now() / 1000) + 8040, windowDurationSecs: 18_000 },
    secondary: { usedPercent: 42, resetsAt: Math.floor(Date.now() / 1000) + 604_800, windowDurationSecs: 604_800 },
  };

  if (eventType === "quota_exhausted") {
    quota.primary = { usedPercent: 100, resetsAt: Math.floor(Date.now() / 1000) + 8040, windowDurationSecs: 18_000 };
  }
  if (eventType === "quota_reset") {
    quota.primary = { usedPercent: 0, resetsAt: Math.floor(Date.now() / 1000) + 8040, windowDurationSecs: 18_000 };
    quota.secondary = { usedPercent: 0, resetsAt: Math.floor(Date.now() / 1000) + 604_800, windowDurationSecs: 604_800 };
  }

  return {
    eventType,
    accountName,
    accountEmail,
    triggerWindow: eventType === "account_switch" ? null : "primary",
    remainingPercent: eventType === "quota_exhausted" ? 0 : eventType === "quota_reset" ? 100 : 5,
    quota,
    previousName: eventType === "account_switch" ? "Previous Account" : undefined,
  } as const;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "all";
  const eventType = (url.searchParams.get("eventType") ?? "quota_critical") as NotificationEventType;

  const results: Record<string, unknown> = {};

  // Pick a real account for realistic test content
  const accounts = getAllAccounts();
  const testAccount = accounts[0];
  const accountName = testAccount?.name ?? "Vibe Code AI";
  const accountEmail = testAccount?.email ?? "vibecodeai@gmail.com";

  const context = buildTestContext(eventType, accountName, accountEmail);
  const webPreview: NotificationPreview = {
    eventType,
    message: renderNativeNotification(context).message.replace(/\n/g, " "),
  };

  logInfo("notification", `Manual notification test requested for ${channel}`, {
    accountEmail,
    detail: { channel, eventType, accountName, accountEmail },
  });

  // ── Telegram ────────────────────────────────────────────────────────────
  if (channel === "telegram" || channel === "all") {
    const creds = getTelegramCredentials();
    if (creds) {
      logInfo("notification", "Manual Telegram test started", {
        accountEmail,
        detail: { channel: "telegram", configured: true, eventType, accountName, accountEmail, outcome: "attempt" },
      });
      const text = `${renderTelegramNotification(context)}

_This is a test notification._`;

      const result = await sendTelegram(creds.botToken, creds.chatId, text, { timeoutMs: 8_000, maxRetries: 1 });
      results.telegram = result;
      if (result.success) {
        logSuccess("notification", "Manual Telegram test delivered", {
          accountEmail,
          detail: { channel: "telegram", messageId: result.messageId ?? null, eventType, accountName, accountEmail, outcome: "success", attempts: result.attempts, statusCode: result.statusCode },
        });
      } else {
        logWarn("notification", "Manual Telegram test failed", {
          accountEmail,
          detail: { channel: "telegram", error: result.error ?? "Telegram API returned failure", eventType, accountName, accountEmail, outcome: "failure", attempts: result.attempts, statusCode: result.statusCode },
        });
      }
    } else {
      results.telegram = { success: false, error: "Telegram not configured — add bot token and chat ID in settings" };
      logWarn("notification", "Manual Telegram test skipped — Telegram not configured", {
        accountEmail,
        detail: { channel: "telegram", configured: false, accountName, accountEmail },
      });
    }
  }

  // ── Native macOS ────────────────────────────────────────────────────────
  if (channel === "native" || channel === "all") {
    const cap = getNativeCapability();
    if (cap.available) {
      logInfo("notification", "Manual native macOS test started", {
        accountEmail,
        detail: { channel: "native", method: cap.method, eventType, accountName, accountEmail, outcome: "attempt" },
      });
      const nativeContent = renderNativeNotification(context);
      const result = sendNative({
        title: nativeContent.title,
        subtitle: accountEmail,
        message: nativeContent.message,
        sound: "Glass",
        group: "oat-test",
        openUrl: "http://localhost:3000",
      });
      results.native = result;
      if (result.success) {
        logSuccess("notification", "Manual native macOS test delivered", {
          accountEmail,
          detail: { channel: "native", method: result.method, eventType, accountName, accountEmail, outcome: "success" },
        });
      } else {
        logWarn("notification", "Manual native macOS test failed", {
          accountEmail,
          detail: { channel: "native", method: result.method, error: result.error ?? "Unknown native notification failure", eventType, accountName, accountEmail, outcome: "failure" },
        });
      }
    } else {
      results.native = { success: false, error: "Native notifications not available on this platform" };
      logWarn("notification", "Manual native macOS test skipped — not available", {
        accountEmail,
        detail: { channel: "native", accountName, accountEmail },
      });
    }
  }

  // ── Web (delivery happens client-side; return the payload for the client to fire) ──
  if (channel === "web" || channel === "all") {
    const webPayload = buildWebNotificationPayload(webPreview);
    results.web = {
      success: true,
      title: webPayload.title,
      body: webPayload.body,
    };
    logInfo("notification", "Manual web test payload generated", {
      accountEmail,
      detail: { channel: "web", eventType, accountName, accountEmail, outcome: "success" },
    });
  }

  const anySuccess = Object.values(results).some((r) => (r as { success: boolean }).success);

  return NextResponse.json({ success: anySuccess, results });
}
