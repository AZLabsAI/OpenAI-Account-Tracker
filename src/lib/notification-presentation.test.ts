import { describe, expect, it, vi } from "vitest";
import type { QuotaData } from "@/types";
import {
  buildWebNotificationPayload,
  getNotificationUiMeta,
  renderNativeNotification,
  renderTelegramNotification,
} from "./notification-presentation";

function makeQuota(overrides?: Partial<QuotaData>): QuotaData {
  return {
    fetchedAt: "2026-03-19T12:00:00.000Z",
    email: "notify@example.com",
    planType: "plus",
    primary: { usedPercent: 95, resetsAt: 1_800_000_000, windowDurationSecs: 18_000 },
    secondary: { usedPercent: 40, resetsAt: 1_800_500_000, windowDurationSecs: 604_800 },
    ...overrides,
  };
}

describe("notification presentation", () => {
  it("uses shared ui metadata for web payloads", () => {
    const payload = buildWebNotificationPayload({
      id: 42,
      eventType: "quota_reset",
      message: "Weekly quota replenished. 100% remaining.",
    });

    expect(getNotificationUiMeta("quota_reset")).toMatchObject({
      label: "Replenished",
      emoji: "✅",
    });
    expect(payload).toEqual({
      title: "✅ Quota Replenished",
      body: "Weekly quota replenished. 100% remaining.",
      tag: "oat-quota_reset-42",
    });
  });

  it("keeps native and telegram reset copy aligned", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));

    const context = {
      eventType: "quota_reset" as const,
      accountName: "Notify Account",
      accountEmail: "notify@example.com",
      triggerWindow: "secondary" as const,
      remainingPercent: 100,
      quota: makeQuota({
        primary: { usedPercent: 0, resetsAt: 1_800_000_000, windowDurationSecs: 18_000 },
        secondary: { usedPercent: 0, resetsAt: 1_800_500_000, windowDurationSecs: 604_800 },
      }),
      timestampLabel: "Mar 19, 2026, 12:00 PM",
    };

    const native = renderNativeNotification(context);
    const telegram = renderTelegramNotification(context);

    expect(native.title).toContain("Replenished");
    expect(native.message).toContain("Weekly quota replenished.");
    expect(native.message).toContain("100% remaining.");
    expect(telegram).toContain("*QUOTA REPLENISHED");
    expect(telegram).toContain("Weekly quota replenished.");
    expect(telegram).toContain("100% remaining");

    vi.useRealTimers();
  });

  it("renders critical notifications with consistent severity language", () => {
    const context = {
      eventType: "quota_critical" as const,
      accountName: "Notify Account",
      accountEmail: "notify@example.com",
      triggerWindow: "primary" as const,
      remainingPercent: 5,
      quota: makeQuota(),
      timestampLabel: "Mar 19, 2026, 12:00 PM",
    };

    const native = renderNativeNotification(context);
    const telegram = renderTelegramNotification(context);

    expect(native.title).toContain("Critical");
    expect(native.message).toContain("5-hour: 95% used (5% left)");
    expect(telegram).toContain("*CRITICAL");
    expect(telegram).toContain("5% 5-hour remaining");
  });
});
