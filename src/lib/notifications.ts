/**
 * notifications.ts
 *
 * Core notification engine: detects quota state transitions,
 * creates notification events, and delivers via all enabled channels.
 *
 * Thresholds are defined as REMAINING percentages (15%, 10%, 5%, 0%).
 * Every notification shows BOTH quota windows (5-hour + Weekly) for full context.
 * Exhausted (0% remaining) fires with alarm sound and urgent formatting.
 */

import {
  insertNotificationEvent,
  getLatestUnresolvedEvent,
  hasUnresolvedEvent,
  markNotificationDelivered,
} from "./db";
import { getNotificationSettings, isQuietHours, getTelegramCredentials } from "./notify-settings";
import { sendTelegram } from "./notify-telegram";
import { sendNative } from "./notify-native";
import { logInfo, logSuccess, logWarn } from "./logger";
import type { Account, QuotaData, QuotaWindow, NotificationEvent, NotificationEventType } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface QuotaTransition {
  eventType: NotificationEventType;
  /** Which window triggered the alert */
  triggerWindow: "primary" | "secondary";
  /** Full quota snapshot for both windows */
  quota: QuotaData;
  /** The remaining % that triggered (e.g. 5) */
  remainingPercent: number;
  /** Pre-built message for bell dropdown / DB */
  message: string;
  /** Reminder transitions bypass the normal unresolved-event dedup path */
  isReminder?: boolean;
}

function formatTimeUntil(resetsAtUnix: number | null): string {
  if (!resetsAtUnix) return "unknown";
  const ms = resetsAtUnix * 1000 - Date.now();
  if (ms <= 0) return "any moment";
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remainMins}m`;
  return `${mins}m`;
}

function windowLabel(w: "primary" | "secondary"): string {
  return w === "primary" ? "5-hour" : "Weekly";
}

/** Format one window's status like "5-hour: 95% used (5% left)" */
function fmtWindow(label: string, w: QuotaWindow | null): string {
  if (!w) return `${label}: no data`;
  const used = Math.round(w.usedPercent);
  const left = Math.round(100 - w.usedPercent);
  if (used >= 100) return `${label}: DEPLETED`;
  return `${label}: ${used}% used (${left}% left)`;
}

/** Both windows on one line, separated by · */
function bothWindowsSummary(quota: QuotaData): string {
  return `${fmtWindow("5-hour", quota.primary)} · ${fmtWindow("Weekly", quota.secondary)}`;
}

function logNotificationDelivery(
  level: "info" | "success" | "warn",
  message: string,
  account: Account,
  detail: Record<string, unknown>,
): void {
  const logger = level === "success" ? logSuccess : level === "warn" ? logWarn : logInfo;
  logger("notification", message, {
    accountId: account.id,
    accountEmail: account.email,
    detail,
  });
}

// ─── Threshold detection ─────────────────────────────────────────────────────

/**
 * Thresholds are REMAINING percentages: [15, 10, 5, 0].
 * Internally we convert to USED: remaining 15% → used 85%.
 *
 * Compare old and new quota data to detect meaningful state transitions.
 * Returns transitions that include BOTH windows' status.
 */
export function detectTransitions(
  account: Account,
  oldQuota: QuotaData | undefined | null,
  newQuota: QuotaData,
  remainingThresholds: number[] = [15, 10, 5, 0],
  exhaustedReminderMins = 0,
): QuotaTransition[] {
  const transitions: QuotaTransition[] = [];

  // Convert remaining thresholds to used thresholds (ascending used = descending remaining)
  // remaining 15% → used 85%, remaining 5% → used 95%, remaining 0% → used 100%
  const usedThresholds = remainingThresholds.map((r) => 100 - r).sort((a, b) => b - a);

  for (const windowKey of ["primary", "secondary"] as const) {
    const oldWindow = oldQuota?.[windowKey];
    const newWindow = newQuota[windowKey];

    if (!newWindow) continue;

    const oldUsed = oldWindow?.usedPercent ?? 0;
    const newUsed = newWindow.usedPercent;
    const newRemaining = Math.round(100 - newUsed);
    const resetsIn = formatTimeUntil(newWindow.resetsAt);

    // ── Reset detection: big drop from high usage ──
    if (oldUsed >= 90 && newUsed < 50) {
      transitions.push({
        eventType: "quota_reset",
        triggerWindow: windowKey,
        quota: newQuota,
        remainingPercent: newRemaining,
        message: `✅ ${account.name} — ${windowLabel(windowKey)} quota replenished. ${newRemaining}% remaining. ${bothWindowsSummary(newQuota)}`,
      });
      continue;
    }

    // ── Downward remaining crossings (upward used crossings) ──
    for (const usedThreshold of usedThresholds) {
      if (newUsed >= usedThreshold && oldUsed < usedThreshold) {
        const remainingThreshold = 100 - usedThreshold;

        let eventType: NotificationEventType;
        let emoji: string;

        if (remainingThreshold <= 0) {
          eventType = "quota_exhausted";
          emoji = "🚨";
        } else if (remainingThreshold <= 5) {
          eventType = "quota_critical";
          emoji = "🔴";
        } else {
          eventType = "quota_warning";
          emoji = "⚠️";
        }

        let message: string;
        if (eventType === "quota_exhausted") {
          message = `${emoji} ${account.name} — ${windowLabel(windowKey)} DEPLETED! ${bothWindowsSummary(newQuota)}. Resets in ${resetsIn}.`;
        } else {
          message = `${emoji} ${account.name} — ${newRemaining}% ${windowLabel(windowKey)} remaining. ${bothWindowsSummary(newQuota)}. Resets in ${resetsIn}.`;
        }

        transitions.push({
          eventType,
          triggerWindow: windowKey,
          quota: newQuota,
          remainingPercent: newRemaining,
          message,
        });
        break; // Only fire the highest-severity threshold per window
      }
    }
  }

  if (exhaustedReminderMins > 0) {
    transitions.push(...detectExhaustedReminderTransitions(account, newQuota, exhaustedReminderMins));
  }

  return transitions;
}

function detectExhaustedReminderTransitions(
  account: Account,
  newQuota: QuotaData,
  exhaustedReminderMins: number,
): QuotaTransition[] {
  const transitions: QuotaTransition[] = [];
  const cooldownMs = exhaustedReminderMins * 60_000;

  for (const windowKey of ["primary", "secondary"] as const) {
    const newWindow = newQuota[windowKey];
    if (!newWindow || newWindow.usedPercent < 100) continue;

    const unresolved = getLatestUnresolvedEvent(account.id, "quota_exhausted", windowKey);
    if (!unresolved) continue;

    const lastCreatedAt = Date.parse(unresolved.createdAt);
    if (Number.isNaN(lastCreatedAt) || Date.now() - lastCreatedAt < cooldownMs) continue;

    const resetsIn = formatTimeUntil(newWindow.resetsAt);
    transitions.push({
      eventType: "quota_exhausted",
      triggerWindow: windowKey,
      quota: newQuota,
      remainingPercent: 0,
      message: `🚨 ${account.name} — ${windowLabel(windowKey)} still DEPLETED! ${bothWindowsSummary(newQuota)}. Resets in ${resetsIn}.`,
      isReminder: true,
    });
  }

  return transitions;
}

// ─── Delivery orchestrator ───────────────────────────────────────────────────

/**
 * Process detected transitions: dedup, create events, deliver to all channels.
 * Returns the created notification events (for sending back to the client).
 */
export async function processTransitions(
  account: Account,
  transitions: QuotaTransition[],
): Promise<NotificationEvent[]> {
  const settings = getNotificationSettings();

  if (!settings.notificationsEnabled) return [];

  const quiet = isQuietHours();
  const events: NotificationEvent[] = [];

  for (const t of transitions) {
    // Dedup check
    if (!t.isReminder && hasUnresolvedEvent(account.id, t.eventType, t.triggerWindow)) {
      logInfo("system", `Notification deduped: ${t.eventType} for ${account.email} (${t.triggerWindow})`, {
        accountId: account.id,
        accountEmail: account.email,
      });
      continue;
    }

    // Create event in DB
    const event = insertNotificationEvent({
      accountId: account.id,
      eventType: t.eventType,
      window: t.triggerWindow,
      usedPercent: 100 - t.remainingPercent,
      message: t.message,
    });

    logSuccess("system", `Notification created: ${t.message}`, {
      accountId: account.id,
      accountEmail: account.email,
      detail: { eventType: t.eventType, window: t.triggerWindow, remainingPercent: t.remainingPercent },
    });

    // Deliver via channels (unless quiet hours — still record event, just don't ping)
    if (!quiet) {
      const isExhausted = t.eventType === "quota_exhausted";

      // ── Native macOS ──
      if (settings.nativeEnabled) {
        logNotificationDelivery("info", `Delivering ${t.eventType} via native macOS`, account, {
          channel: "native",
          eventType: t.eventType,
          window: t.triggerWindow,
          notificationEventId: event.id,
        });
        try {
          const result = sendNative({
            title: nativeTitle(t, account),
            subtitle: account.email,
            message: nativeMessage(t),
            sound: isExhausted ? "Sosumi" : "Glass",
            group: `oat-${account.id}-${t.triggerWindow}-${t.eventType}`,
            openUrl: "http://localhost:3000",
          });
          if (result.success) {
            markNotificationDelivered(event.id, "native");
            logNotificationDelivery("success", `Delivered ${t.eventType} via native macOS`, account, {
              channel: "native",
              eventType: t.eventType,
              window: t.triggerWindow,
              notificationEventId: event.id,
              method: result.method,
            });
          } else {
            logNotificationDelivery("warn", `Native macOS delivery failed for ${t.eventType}`, account, {
              channel: "native",
              eventType: t.eventType,
              window: t.triggerWindow,
              notificationEventId: event.id,
              error: result.error ?? "Unknown native notification failure",
              method: result.method,
            });
          }
        } catch (err) {
          logWarn("system", `Native notification failed: ${err instanceof Error ? err.message : String(err)}`);
          logNotificationDelivery("warn", `Native macOS delivery threw for ${t.eventType}`, account, {
            channel: "native",
            eventType: t.eventType,
            window: t.triggerWindow,
            notificationEventId: event.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── Telegram ──
      if (settings.telegramEnabled) {
        const creds = getTelegramCredentials();
        if (creds) {
          logNotificationDelivery("info", `Delivering ${t.eventType} via Telegram`, account, {
            channel: "telegram",
            eventType: t.eventType,
            window: t.triggerWindow,
            notificationEventId: event.id,
          });
          try {
            const telegramMsg = formatTelegramMessage(t, account);
            const result = await sendTelegram(creds.botToken, creds.chatId, telegramMsg);
            if (result.success) {
              markNotificationDelivered(event.id, "telegram", result.messageId);
              logNotificationDelivery("success", `Delivered ${t.eventType} via Telegram`, account, {
                channel: "telegram",
                eventType: t.eventType,
                window: t.triggerWindow,
                notificationEventId: event.id,
                messageId: result.messageId ?? null,
              });
            } else {
              logNotificationDelivery("warn", `Telegram delivery failed for ${t.eventType}`, account, {
                channel: "telegram",
                eventType: t.eventType,
                window: t.triggerWindow,
                notificationEventId: event.id,
                error: result.error ?? "Telegram API returned failure",
              });
            }
          } catch (err) {
            logWarn("system", `Telegram notification failed: ${err instanceof Error ? err.message : String(err)}`);
            logNotificationDelivery("warn", `Telegram delivery threw for ${t.eventType}`, account, {
              channel: "telegram",
              eventType: t.eventType,
              window: t.triggerWindow,
              notificationEventId: event.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          logNotificationDelivery("warn", `Telegram delivery skipped for ${t.eventType} — credentials missing`, account, {
            channel: "telegram",
            eventType: t.eventType,
            window: t.triggerWindow,
            notificationEventId: event.id,
            reason: "telegram_credentials_missing",
          });
        }
      }
    } else {
      logInfo("system", `Quiet hours active — notification recorded but not delivered: ${t.message}`);
      logNotificationDelivery("info", `Delivery skipped during quiet hours for ${t.eventType}`, account, {
        channel: "all",
        eventType: t.eventType,
        window: t.triggerWindow,
        notificationEventId: event.id,
        reason: "quiet_hours",
      });
    }

    events.push(event);
  }

  return events;
}

// ─── Native macOS formatting ─────────────────────────────────────────────────

function nativeTitle(t: QuotaTransition, account: Account): string {
  switch (t.eventType) {
    case "quota_exhausted": return `🚨 DEPLETED — ${account.name}`;
    case "quota_critical":  return `🔴 Critical — ${account.name}`;
    case "quota_warning":   return `⚠️ Warning — ${account.name}`;
    case "quota_reset":     return `✅ Replenished — ${account.name}`;
    case "account_switch":  return `🔄 Switched — ${account.name}`;
  }
}

function nativeMessage(t: QuotaTransition): string {
  const primary = t.quota.primary;
  const secondary = t.quota.secondary;
  const resetsIn = formatTimeUntil(
    (t.triggerWindow === "primary" ? primary : secondary)?.resetsAt ?? null,
  );

  if (t.eventType === "quota_exhausted") {
    // Alarm-style: very clear about what's gone
    const lines = [`${windowLabel(t.triggerWindow)} quota is DEPLETED!`];
    // Show the other window's status for context
    if (t.triggerWindow === "primary" && secondary) {
      lines.push(`Weekly: ${Math.round(100 - secondary.usedPercent)}% left`);
    } else if (t.triggerWindow === "secondary" && primary) {
      lines.push(`5-hour: ${Math.round(100 - primary.usedPercent)}% left`);
    }
    lines.push(`Resets in ${resetsIn}`);
    return lines.join("\n");
  }

  if (t.eventType === "quota_reset") {
    return `${windowLabel(t.triggerWindow)} quota replenished.\n${t.remainingPercent}% remaining.\n${bothWindowsSummary(t.quota)}`;
  }

  // Warning / Critical — show both windows
  return `${bothWindowsSummary(t.quota)}\nResets in ${resetsIn}`;
}

// ─── Telegram formatting ─────────────────────────────────────────────────────

function formatTelegramMessage(t: QuotaTransition, account: Account): string {
  const now = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  const primary = t.quota.primary;
  const secondary = t.quota.secondary;
  const resetsIn = formatTimeUntil(
    (t.triggerWindow === "primary" ? primary : secondary)?.resetsAt ?? null,
  );

  const fiveHourLine = primary
    ? `5-hour: ${Math.round(primary.usedPercent)}% used (${Math.round(100 - primary.usedPercent)}% left)`
    : "5-hour: no data";
  const weeklyLine = secondary
    ? `Weekly: ${Math.round(secondary.usedPercent)}% used (${Math.round(100 - secondary.usedPercent)}% left)`
    : "Weekly: no data";

  if (t.eventType === "quota_exhausted") {
    return `🚨🚨🚨 *QUOTA DEPLETED*
━━━━━━━━━━━━━━━━
*${account.name}*
${windowLabel(t.triggerWindow)} quota is completely exhausted!

📊 ${fiveHourLine}
📊 ${weeklyLine}
⏱ Resets in ${resetsIn}

📧 ${account.email}
🕐 ${now}`;
  }

  if (t.eventType === "quota_reset") {
    return `✅ *QUOTA REPLENISHED — ${account.name}*
━━━━━━━━━━━━━━━━
${windowLabel(t.triggerWindow)} quota replenished.
${t.remainingPercent}% remaining

📊 ${fiveHourLine}
📊 ${weeklyLine}
⏱ Resets in ${resetsIn}

📧 ${account.email}
🕐 ${now}`;
  }

  const emoji = t.eventType === "quota_critical" ? "🔴" : "⚠️";
  const severity = t.eventType === "quota_critical" ? "CRITICAL" : "WARNING";

  return `${emoji} *${severity} — ${account.name}*
━━━━━━━━━━━━━━━━
${t.remainingPercent}% ${windowLabel(t.triggerWindow)} remaining

📊 ${fiveHourLine}
📊 ${weeklyLine}
⏱ Resets in ${resetsIn}

📧 ${account.email}
🕐 ${now}`;
}

// ─── Account switch notification ─────────────────────────────────────────────

export async function notifyAccountSwitch(
  newAccount: Account,
  previousName?: string,
): Promise<NotificationEvent | null> {
  const settings = getNotificationSettings();
  if (!settings.notificationsEnabled) return null;

  // Dedup
  if (hasUnresolvedEvent("__global__", "account_switch", null)) return null;

  const message = previousName
    ? `🔄 Active Codex account switched to ${newAccount.name} (was: ${previousName})`
    : `🔄 Active Codex account: ${newAccount.name}`;

  const event = insertNotificationEvent({
    accountId: newAccount.id,
    eventType: "account_switch",
    window: null,
    usedPercent: null,
    message,
  });

  if (!isQuietHours()) {
    if (settings.nativeEnabled) {
      logNotificationDelivery("info", "Delivering account_switch via native macOS", newAccount, {
        channel: "native",
        eventType: "account_switch",
        notificationEventId: event.id,
      });
      const result = sendNative({
        title: "🔄 Account Switched",
        subtitle: newAccount.email,
        message: `Now using: ${newAccount.name}\n${previousName ? `Was: ${previousName}` : ""}`,
        group: "oat-account-switch",
        openUrl: "http://localhost:3000",
      });
      if (result.success) {
        markNotificationDelivered(event.id, "native");
        logNotificationDelivery("success", "Delivered account_switch via native macOS", newAccount, {
          channel: "native",
          eventType: "account_switch",
          notificationEventId: event.id,
          method: result.method,
        });
      } else {
        logNotificationDelivery("warn", "Native macOS delivery failed for account_switch", newAccount, {
          channel: "native",
          eventType: "account_switch",
          notificationEventId: event.id,
          error: result.error ?? "Unknown native notification failure",
          method: result.method,
        });
      }
    }

    if (settings.telegramEnabled) {
      const creds = getTelegramCredentials();
      if (creds) {
        const now = new Date().toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        });
        const text = `🔄 *Active Codex Account Changed*
━━━━━━━━━━━━━━━━
Now: *${newAccount.name}* (${newAccount.email})${previousName ? `\nWas: ${previousName}` : ""}

🕐 ${now}`;
        logNotificationDelivery("info", "Delivering account_switch via Telegram", newAccount, {
          channel: "telegram",
          eventType: "account_switch",
          notificationEventId: event.id,
        });
        const result = await sendTelegram(creds.botToken, creds.chatId, text);
        if (result.success) {
          markNotificationDelivered(event.id, "telegram", result.messageId);
          logNotificationDelivery("success", "Delivered account_switch via Telegram", newAccount, {
            channel: "telegram",
            eventType: "account_switch",
            notificationEventId: event.id,
            messageId: result.messageId ?? null,
          });
        } else {
          logNotificationDelivery("warn", "Telegram delivery failed for account_switch", newAccount, {
            channel: "telegram",
            eventType: "account_switch",
            notificationEventId: event.id,
            error: result.error ?? "Telegram API returned failure",
          });
        }
      } else {
        logNotificationDelivery("warn", "Telegram delivery skipped for account_switch — credentials missing", newAccount, {
          channel: "telegram",
          eventType: "account_switch",
          notificationEventId: event.id,
          reason: "telegram_credentials_missing",
        });
      }
    }
  } else {
    logNotificationDelivery("info", "Delivery skipped during quiet hours for account_switch", newAccount, {
      channel: "all",
      eventType: "account_switch",
      notificationEventId: event.id,
      reason: "quiet_hours",
    });
  }

  return event;
}
