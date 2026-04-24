import { describe, expect, it, vi } from "vitest";
import {
  CODEX_RESET_STATUS_SOURCE_URL,
  fetchCodexResetStatusFromSource,
  normalizeCodexResetStatusPayload,
} from "./codex-reset-status";

describe("codex-reset-status", () => {
  it("normalizes a no-state payload into the local no status", () => {
    expect(
      normalizeCodexResetStatusPayload({
        state: "no",
        configured: true,
        resetAt: 1_775_678_044_608,
        updatedAt: 1_775_606_839_925,
      }),
    ).toEqual({
      status: "no",
      configured: true,
      resetAt: "2026-04-08T19:54:04.608Z",
      updatedAt: "2026-04-08T00:07:19.925Z",
    });
  });

  it("normalizes any configured non-no state into yes", () => {
    expect(
      normalizeCodexResetStatusPayload({
        state: "yes",
        configured: true,
        resetAt: 1_776_000_000_000,
        updatedAt: 1_776_000_100_000,
      }),
    ).toEqual({
      status: "yes",
      configured: true,
      resetAt: "2026-04-12T13:20:00.000Z",
      updatedAt: "2026-04-12T13:21:40.000Z",
    });
  });

  it("treats malformed payloads as unavailable", () => {
    expect(normalizeCodexResetStatusPayload({ configured: true })).toEqual({
      status: "unavailable",
      configured: true,
      resetAt: null,
      updatedAt: null,
    });
  });

  it("returns unavailable when the source fetch fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("boom"));

    await expect(fetchCodexResetStatusFromSource(fetchMock)).resolves.toEqual({
      status: "unavailable",
      configured: false,
      resetAt: null,
      updatedAt: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      CODEX_RESET_STATUS_SOURCE_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
