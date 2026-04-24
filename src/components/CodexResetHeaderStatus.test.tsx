import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CodexResetStatusResponse } from "@/types/codex-reset";
import {
  CODEX_RESET_POLL_MS,
  CODEX_RESET_STATUS_PATH,
  CodexResetHeaderStatusDisplay,
  buildCodexResetHeaderModel,
  loadCodexResetStatus,
  scheduleCodexResetPolling,
} from "./CodexResetHeaderStatus";

function renderStatus(status: CodexResetStatusResponse): string {
  return renderToStaticMarkup(<CodexResetHeaderStatusDisplay status={status} />);
}

describe("CodexResetHeaderStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders a yes state with reset time but no elapsed-days text", () => {
    const markup = renderStatus({
      status: "yes",
      configured: true,
      resetAt: "2026-04-08T19:54:04.608Z",
      updatedAt: "2026-04-08T00:07:19.925Z",
    });

    expect(markup).toContain("Codex Reset: YES");
    expect(markup).toContain("Updated Wed, Apr 8 · 2:07 AM SAST");
    expect(markup).not.toContain("days ago");
    expect(markup).toContain("shadow-[0_0_28px_rgba(56,189,248,0.45)]");
  });

  it("renders a no state with last-reset timestamp and elapsed days", () => {
    const model = buildCodexResetHeaderModel(
      {
        status: "no",
        configured: true,
        resetAt: "2026-04-01T18:13:00.000Z",
        updatedAt: "2026-04-08T18:14:00.000Z",
      },
      { now: new Date("2026-04-08T12:00:00.000Z"), timeZone: "Africa/Johannesburg" },
    );

    expect(model.metaText).toBe("Last reset Wed, Apr 1 · 8:13 PM SAST · 7 days ago");
    expect(model.pillLabel).toBe("Codex Reset: NO");
  });

  it("shows 0 days ago when the last reset happened the same day", () => {
    const model = buildCodexResetHeaderModel(
      {
        status: "no",
        configured: true,
        resetAt: "2026-04-08T01:13:00.000Z",
        updatedAt: "2026-04-08T02:14:00.000Z",
      },
      { now: new Date("2026-04-08T12:00:00.000Z"), timeZone: "Africa/Johannesburg" },
    );

    expect(model.metaText).toContain("0 days ago");
  });

  it("falls back to the updated time when a yes-state reset timestamp is in the future", () => {
    const model = buildCodexResetHeaderModel(
      {
        status: "yes",
        configured: true,
        resetAt: "2026-04-08T19:54:04.608Z",
        updatedAt: "2026-04-08T00:07:19.925Z",
      },
      { now: new Date("2026-04-08T17:18:24.000Z"), timeZone: "Africa/Johannesburg" },
    );

    expect(model.metaText).toBe("Updated Wed, Apr 8 · 2:07 AM SAST");
  });

  it("renders unavailable without inline reset metadata", () => {
    const markup = renderStatus({
      status: "unavailable",
      configured: false,
      resetAt: null,
      updatedAt: null,
    });

    expect(markup).toContain("Codex Reset: UNKNOWN");
    expect(markup).not.toContain("Last reset");
    expect(markup).not.toContain("Reset Wed");
  });

  it("loads the local route with no-store caching", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "no",
        configured: true,
        resetAt: "2026-04-01T18:13:00.000Z",
        updatedAt: "2026-04-08T18:14:00.000Z",
      }),
    } as Response);

    await expect(loadCodexResetStatus(fetchMock)).resolves.toEqual({
      status: "no",
      configured: true,
      resetAt: "2026-04-01T18:13:00.000Z",
      updatedAt: "2026-04-08T18:14:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      CODEX_RESET_STATUS_PATH,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("schedules polling every 60 seconds", () => {
    const callback = vi.fn();
    const intervalSpy = vi.spyOn(globalThis, "setInterval");

    const intervalId = scheduleCodexResetPolling(callback);

    expect(intervalSpy).toHaveBeenCalledWith(callback, CODEX_RESET_POLL_MS);

    clearInterval(intervalId);
  });
});
