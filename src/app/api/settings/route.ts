/**
 * GET  /api/settings — Return all notification settings
 * PATCH /api/settings — Update notification settings (including Telegram credentials)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { getNotificationSettings } from "@/lib/notify-settings";
import { parseSettingsPatch, SettingsValidationError } from "@/lib/settings-validation";
import { validateTelegramToken } from "@/lib/notify-telegram";
import { getNotificationChannelHealth } from "@/lib/logger";

export async function GET() {
  const settings = getNotificationSettings();
  const { getNativeCapability } = await import("@/lib/notify-native-capability");
  const nativeCap = getNativeCapability();
  const channelHealth = getNotificationChannelHealth();

  return NextResponse.json({
    ...settings,
    nativeAvailable: nativeCap.available,
    nativeMethod: nativeCap.method,
    channelHealth,
    // Include raw telegram_chat_id from DB for the form (env value is already shown via source)
    telegramChatIdFromDb: getSetting("telegram_chat_id"),
    telegramBotTokenFromDb: getSetting("telegram_bot_token") ? true : false,
    // Whether env vars are set
    telegramEnvBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramEnvChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const patch = parseSettingsPatch(await req.json());

    // ── Telegram credentials ──────────────────────────────────────────────
    if (patch.telegram_bot_token !== undefined) {
      const token = patch.telegram_bot_token;
      if (token) {
        // Validate before saving
        const validation = await validateTelegramToken(token);
        if (!validation.valid) {
          return NextResponse.json(
            { error: `Invalid bot token: ${validation.error}` },
            { status: 400 },
          );
        }
        setSetting("telegram_bot_token", token);
      } else {
        // Empty string = clear the stored token
        setSetting("telegram_bot_token", "");
      }
    }

    if (patch.telegram_chat_id !== undefined) {
      setSetting("telegram_chat_id", patch.telegram_chat_id);
    }

    // ── Toggle booleans ───────────────────────────────────────────────────
    const boolKeys: Record<string, string> = {
      notifications_enabled: "notifications_enabled",
      web_enabled: "notifications_web",
      native_enabled: "notifications_native",
      telegram_enabled: "telegram_enabled",
      quiet_hours_enabled: "quiet_hours_enabled",
    };

    for (const [bodyKey, dbKey] of Object.entries(boolKeys)) {
      const value = patch[bodyKey as keyof typeof patch];
      if (value !== undefined) {
        setSetting(dbKey, value ? "true" : "false");
      }
    }

    // ── String settings ───────────────────────────────────────────────────
    if (patch.quiet_hours_start !== undefined) {
      setSetting("quiet_hours_start", patch.quiet_hours_start);
    }
    if (patch.quiet_hours_end !== undefined) {
      setSetting("quiet_hours_end", patch.quiet_hours_end);
    }
    if (patch.default_thresholds !== undefined) {
      setSetting("default_thresholds", JSON.stringify(patch.default_thresholds));
    }
    if (patch.exhausted_reminder_mins !== undefined) {
      setSetting("exhausted_reminder_mins", String(patch.exhausted_reminder_mins));
    }

    // Return updated settings
    const updated = getNotificationSettings();
    return NextResponse.json({ success: true, settings: updated });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update settings" },
      { status: err instanceof SettingsValidationError ? 400 : 500 },
    );
  }
}
