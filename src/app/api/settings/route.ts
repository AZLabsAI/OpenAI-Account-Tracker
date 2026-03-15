/**
 * GET  /api/settings — Return all notification settings
 * PATCH /api/settings — Update notification settings (including Telegram credentials)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { getNotificationSettings } from "@/lib/notify-settings";
import { validateTelegramToken } from "@/lib/notify-telegram";
import { getNativeCapability } from "@/lib/notify-native";

export async function GET() {
  const settings = getNotificationSettings();
  const nativeCap = getNativeCapability();

  return NextResponse.json({
    ...settings,
    nativeAvailable: nativeCap.available,
    nativeMethod: nativeCap.method,
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
    const body = await req.json() as Record<string, unknown>;

    // ── Telegram credentials ──────────────────────────────────────────────
    if (body.telegram_bot_token !== undefined) {
      const token = body.telegram_bot_token as string;
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

    if (body.telegram_chat_id !== undefined) {
      setSetting("telegram_chat_id", body.telegram_chat_id as string);
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
      if (body[bodyKey] !== undefined) {
        setSetting(dbKey, body[bodyKey] ? "true" : "false");
      }
    }

    // ── String settings ───────────────────────────────────────────────────
    if (body.quiet_hours_start !== undefined) {
      setSetting("quiet_hours_start", body.quiet_hours_start as string);
    }
    if (body.quiet_hours_end !== undefined) {
      setSetting("quiet_hours_end", body.quiet_hours_end as string);
    }
    if (body.default_thresholds !== undefined) {
      setSetting("default_thresholds", JSON.stringify(body.default_thresholds));
    }

    // Return updated settings
    const updated = getNotificationSettings();
    return NextResponse.json({ success: true, settings: updated });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update settings" },
      { status: 500 },
    );
  }
}
