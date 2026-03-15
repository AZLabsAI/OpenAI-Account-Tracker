/**
 * notify-telegram.ts
 *
 * Send notifications via the Telegram Bot API.
 * Zero dependencies — uses native fetch().
 */

export interface TelegramResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Send a message via Telegram Bot API.
 */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  opts?: { parseMode?: "Markdown" | "HTML"; silent?: boolean },
): Promise<TelegramResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts?.parseMode ?? "Markdown",
        disable_notification: opts?.silent ?? false,
      }),
    });

    const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (data.ok) {
      return { success: true, messageId: data.result?.message_id };
    }
    return { success: false, error: data.description ?? "Telegram API returned ok=false" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Validate a bot token by calling getMe.
 */
export async function validateTelegramToken(botToken: string): Promise<{ valid: boolean; botName?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json() as { ok: boolean; result?: { first_name: string; username: string }; description?: string };
    if (data.ok) {
      return { valid: true, botName: `@${data.result?.username ?? data.result?.first_name}` };
    }
    return { valid: false, error: data.description ?? "Invalid token" };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a test notification.
 */
export async function testTelegram(botToken: string, chatId: string): Promise<TelegramResult> {
  const now = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  const text = `🔔 *Test Notification*
━━━━━━━━━━━━━━━━
OpenAI Account Tracker is connected.
Telegram alerts are working.

🕐 ${now}`;

  return sendTelegram(botToken, chatId, text);
}
