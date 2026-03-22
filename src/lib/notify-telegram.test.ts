import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTelegram } from "./notify-telegram";

describe("sendTelegram", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns success on the first successful send", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        result: { message_id: 77 },
      }), { status: 200 }),
    );

    const result = await sendTelegram("bot", "chat", "hello", { timeoutMs: 5000, maxRetries: 1 });

    expect(result).toEqual({
      success: true,
      messageId: 77,
      statusCode: 200,
      attempts: 1,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries transient http failures once", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: false,
          description: "gateway timeout",
        }), { status: 504 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          result: { message_id: 88 },
        }), { status: 200 }),
      );

    const result = await sendTelegram("bot", "chat", "hello", { timeoutMs: 5000, maxRetries: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: true,
      messageId: 88,
      statusCode: 200,
      attempts: 2,
    });
  });

  it("does not retry non-retryable api failures", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: false,
        description: "chat not found",
      }), { status: 400 }),
    );

    const result = await sendTelegram("bot", "chat", "hello", { timeoutMs: 5000, maxRetries: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: false,
      error: "chat not found",
      statusCode: 400,
      transient: false,
      attempts: 1,
    });
  });

  it("retries transient network failures once", async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          result: { message_id: 99 },
        }), { status: 200 }),
      );

    const result = await sendTelegram("bot", "chat", "hello", { timeoutMs: 5000, maxRetries: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: true,
      messageId: 99,
      statusCode: 200,
      attempts: 2,
    });
  });
});
