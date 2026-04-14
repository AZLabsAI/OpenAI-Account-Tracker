import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuotaData } from "@/types";
import { QuotaBar } from "./UsageBar";

function renderQuotaBar(quotaData: QuotaData): string {
  return renderToStaticMarkup(<QuotaBar quotaData={quotaData} />);
}

function makeQuotaData(overrides: Partial<QuotaData> = {}): QuotaData {
  return {
    fetchedAt: "2026-04-08T15:45:00.000Z",
    primary: {
      usedPercent: 23,
      resetsAt: Math.floor(new Date("2026-04-08T20:07:00.000Z").getTime() / 1000),
      windowDurationSecs: 18_000,
    },
    secondary: {
      usedPercent: 38,
      resetsAt: Math.floor(new Date("2026-04-15T16:13:00.000Z").getTime() / 1000),
      windowDurationSecs: 604_800,
    },
    ...overrides,
  };
}

describe("QuotaBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders balance-first live quota copy with remaining widths", () => {
    const markup = renderQuotaBar(makeQuotaData());

    expect(markup).toContain("Live Balance");
    expect(markup).toContain("5 hour usage limit");
    expect(markup).toContain("Weekly usage limit");
    expect(markup).toContain("77%");
    expect(markup).toContain("62%");
    expect(markup).toContain("remaining");
    expect(markup).toContain("width:77%");
    expect(markup).toContain("width:62%");
    expect(markup).toContain("Resets in 7 days on Wed, Apr 15 · 6:13 PM");
    expect(markup).not.toContain("% used");
  });

  it("uses natural same-day wording for 5-hour resets", () => {
    const markup = renderQuotaBar(makeQuotaData());

    expect(markup).toContain("Resets tonight at 10:07 PM");
  });

  it("uses natural tomorrow wording with a day-part and absolute time", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        secondary: {
          usedPercent: 38,
          resetsAt: Math.floor(new Date("2026-04-09T16:13:00.000Z").getTime() / 1000),
          windowDurationSecs: 604_800,
        },
      }),
    );

    expect(markup).toContain("Resets tomorrow evening on Thu, Apr 9 · 6:13 PM");
  });

  it("uses this-afternoon wording for same-day daytime resets", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        primary: {
          usedPercent: 23,
          resetsAt: Math.floor(new Date("2026-04-08T13:15:00.000Z").getTime() / 1000),
          windowDurationSecs: 18_000,
        },
      }),
    );

    expect(markup).toContain("Resets this afternoon at 3:15 PM");
  });

  it("handles near-empty and depleted balances without reverting to used-first copy", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        primary: {
          usedPercent: 95,
          resetsAt: Math.floor(new Date("2026-04-08T20:07:00.000Z").getTime() / 1000),
          windowDurationSecs: 18_000,
        },
        secondary: {
          usedPercent: 100,
          resetsAt: Math.floor(new Date("2026-04-15T16:13:00.000Z").getTime() / 1000),
          windowDurationSecs: 604_800,
        },
      }),
    );

    expect(markup).toContain("5%");
    expect(markup).toContain("0%");
    expect(markup).toContain("width:5%");
    expect(markup).toContain("width:0%");
    expect(markup).not.toContain("% used");
  });

  it("shows a reset fallback when the reset time is unavailable", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        primary: {
          usedPercent: 40,
          resetsAt: null,
          windowDurationSecs: 18_000,
        },
        secondary: null,
      }),
    );

    expect(markup).toContain("60%");
    expect(markup).toContain("Reset time unavailable");
  });

  it("labels a weekly-only primary window as weekly based on duration", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        primary: {
          usedPercent: 38,
          resetsAt: Math.floor(new Date("2026-04-15T16:13:00.000Z").getTime() / 1000),
          windowDurationSecs: 604_800,
        },
        secondary: null,
      }),
    );

    expect(markup).toContain("Weekly usage limit");
    expect(markup).not.toContain("5 hour usage limit");
    expect(markup).toContain("62%");
    expect(markup).toContain("Resets in 7 days on Wed, Apr 15 · 6:13 PM");
  });

  it("falls back to the primary slot label when duration is unavailable", () => {
    const markup = renderQuotaBar(
      makeQuotaData({
        primary: {
          usedPercent: 40,
          resetsAt: Math.floor(new Date("2026-04-08T20:07:00.000Z").getTime() / 1000),
          windowDurationSecs: null,
        },
        secondary: null,
      }),
    );

    expect(markup).toContain("5 hour usage limit");
    expect(markup).toContain("60%");
  });
});
