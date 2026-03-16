/**
 * POST /api/notifications/test?channel=telegram|native|web|all
 *
 * Fires a realistic test notification through the specified channel(s).
 * Shows both quota windows, just like real notifications do.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllAccounts } from "@/lib/db";
import { getTelegramCredentials } from "@/lib/notify-settings";
import { sendTelegram } from "@/lib/notify-telegram";
import { sendNative, getNativeCapability } from "@/lib/notify-native";
import { logInfo, logSuccess, logWarn } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "all";

  const results: Record<string, unknown> = {};

  // Pick a real account for realistic test content
  const accounts = getAllAccounts();
  const testAccount = accounts[0];
  const accountName = testAccount?.name ?? "Vibe Code AI";
  const accountEmail = testAccount?.email ?? "vibecodeai@gmail.com";

  // Realistic test data — simulating a critical alert
  const fiveHourUsed = 95;
  const fiveHourLeft = 5;
  const weeklyUsed = 42;
  const weeklyLeft = 58;
  const resetsIn = "2h 14m";

  const now = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  logInfo("notification", `Manual notification test requested for ${channel}`, {
    accountEmail,
    detail: { channel, accountName, accountEmail },
  });

  // ── Telegram ────────────────────────────────────────────────────────────
  if (channel === "telegram" || channel === "all") {
    const creds = getTelegramCredentials();
    if (creds) {
      logInfo("notification", "Manual Telegram test started", {
        accountEmail,
        detail: { channel: "telegram", configured: true, accountName, accountEmail },
      });
      const text = `🔴 *CRITICAL — ${accountName}*
━━━━━━━━━━━━━━━━
${fiveHourLeft}% 5-hour remaining

📊 5-hour: ${fiveHourUsed}% used (${fiveHourLeft}% left)
📊 Weekly: ${weeklyUsed}% used (${weeklyLeft}% left)
⏱ Resets in ${resetsIn}

📧 ${accountEmail}
🕐 ${now}

_This is a test notification._`;

      const result = await sendTelegram(creds.botToken, creds.chatId, text);
      results.telegram = result;
      if (result.success) {
        logSuccess("notification", "Manual Telegram test delivered", {
          accountEmail,
          detail: { channel: "telegram", messageId: result.messageId ?? null, accountName, accountEmail },
        });
      } else {
        logWarn("notification", "Manual Telegram test failed", {
          accountEmail,
          detail: { channel: "telegram", error: result.error ?? "Telegram API returned failure", accountName, accountEmail },
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
        detail: { channel: "native", method: cap.method, accountName, accountEmail },
      });
      const result = sendNative({
        title: `🔴 Critical — ${accountName}`,
        subtitle: accountEmail,
        message: `5-hour: ${fiveHourUsed}% used (${fiveHourLeft}% left) · Weekly: ${weeklyUsed}% used (${weeklyLeft}% left)\nResets in ${resetsIn}`,
        sound: "Glass",
        group: "oat-test",
        openUrl: "http://localhost:3000",
      });
      results.native = result;
      if (result.success) {
        logSuccess("notification", "Manual native macOS test delivered", {
          accountEmail,
          detail: { channel: "native", method: result.method, accountName, accountEmail },
        });
      } else {
        logWarn("notification", "Manual native macOS test failed", {
          accountEmail,
          detail: { channel: "native", method: result.method, error: result.error ?? "Unknown native notification failure", accountName, accountEmail },
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
    results.web = {
      success: true,
      title: `🔴 Critical — ${accountName}`,
      body: `5-hour: ${fiveHourUsed}% used (${fiveHourLeft}% left) · Weekly: ${weeklyUsed}% used (${weeklyLeft}% left)\nResets in ${resetsIn}`,
    };
    logInfo("notification", "Manual web test payload generated", {
      accountEmail,
      detail: { channel: "web", accountName, accountEmail },
    });
  }

  const anySuccess = Object.values(results).some((r) => (r as { success: boolean }).success);

  return NextResponse.json({ success: anySuccess, results });
}
