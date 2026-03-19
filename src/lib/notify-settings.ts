/**
 * notify-settings.ts
 *
 * Resolves notification settings from env vars → DB fallback.
 */

import { getSetting } from "./db";
import type { NotificationSettings } from "@/types";
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  parseStoredReminderMins,
  parseStoredThresholds,
  parseStoredTime,
} from "./settings-validation";

export function getTelegramCredentials(): { botToken: string; chatId: string } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || getSetting("telegram_bot_token");
  const chatId = process.env.TELEGRAM_CHAT_ID || getSetting("telegram_chat_id");
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export function getTelegramSource(): "env" | "db" | null {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return "env";
  if (getSetting("telegram_bot_token") && getSetting("telegram_chat_id")) return "db";
  return null;
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "•".repeat(token.length);
  return "•".repeat(token.length - 5) + token.slice(-5);
}

export function getNotificationSettings(): NotificationSettings {
  const telegramCreds = getTelegramCredentials();
  const source = getTelegramSource();

  return {
    notificationsEnabled: (getSetting("notifications_enabled") ?? "true") === "true",
    webEnabled: (getSetting("notifications_web") ?? "true") === "true",
    nativeEnabled: (getSetting("notifications_native") ?? "true") === "true",
    telegramEnabled: (getSetting("telegram_enabled") ?? "false") === "true",
    telegramConfigured: telegramCreds !== null,
    telegramSource: source,
    telegramBotTokenMasked: telegramCreds ? maskToken(telegramCreds.botToken) : null,
    telegramChatId: telegramCreds?.chatId ?? getSetting("telegram_chat_id") ?? null,
    quietHoursEnabled: (getSetting("quiet_hours_enabled") ?? "false") === "true",
    quietHoursStart: parseStoredTime(getSetting("quiet_hours_start"), DEFAULT_QUIET_HOURS_START),
    quietHoursEnd: parseStoredTime(getSetting("quiet_hours_end"), DEFAULT_QUIET_HOURS_END),
    defaultThresholds: parseStoredThresholds(getSetting("default_thresholds")),
    exhaustedReminderMins: parseStoredReminderMins(getSetting("exhausted_reminder_mins")),
  };
}

export function isQuietHours(): boolean {
  const settings = getNotificationSettings();
  if (!settings.quietHoursEnabled) return false;

  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = settings.quietHoursStart.split(":").map(Number);
  const [eh, em] = settings.quietHoursEnd.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  // Handle overnight ranges (e.g., 22:00 to 07:00)
  if (start <= end) {
    return hhmm >= start && hhmm < end;
  }
  return hhmm >= start || hhmm < end;
}
