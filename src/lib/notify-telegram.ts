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
  statusCode?: number;
  transient?: boolean;
  attempts?: number;
}

interface TelegramSendOptions {
  parseMode?: "Markdown" | "HTML";
  silent?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

function isTransientStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function isTransientErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("timed out")
    || normalized.includes("timeout")
    || normalized.includes("network")
    || normalized.includes("fetch")
    || normalized.includes("socket")
    || normalized.includes("econn");
}

/**
 * Send a message via Telegram Bot API.
 */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  opts?: TelegramSendOptions,
): Promise<TelegramResult> {
  const maxRetries = opts?.maxRetries ?? 0;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };

      if (data.ok) {
        return { success: true, messageId: data.result?.message_id, statusCode: res.status, attempts: attempt + 1 };
      }

      const transient = isTransientStatusCode(res.status);
      if (!transient || attempt === maxRetries) {
        return {
          success: false,
          error: data.description ?? "Telegram API returned ok=false",
          statusCode: res.status,
          transient,
          attempts: attempt + 1,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const transient = isTransientErrorMessage(error);
      if (!transient || attempt === maxRetries) {
        return { success: false, error, transient, attempts: attempt + 1 };
      }
    }
  }

  return { success: false, error: "Telegram delivery failed", transient: true, attempts: maxRetries + 1 };
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
