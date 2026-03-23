import { describe, expect, it, vi } from "vitest";
import {
  applyNotificationPreviews,
  DEPLETED_RECOVERY_NEAR_RESET_INTERVAL_MINS,
  DEPLETED_RECOVERY_WATCH_INTERVAL_MINS,
  getEffectiveRefreshIntervalMins,
  getRecoveryWatchRefreshIntervalMins,
} from "./useAccountRefreshController";
import type { Account } from "@/types";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_001",
    name: "Primary",
    email: "primary@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-01",
    usageLimits: [],
    ...overrides,
  };
}

describe("applyNotificationPreviews", () => {
  it("fires each preview exactly once", () => {
    const fireWebNotification = vi.fn();

    applyNotificationPreviews([
      { id: 1, eventType: "quota_warning", message: "warning" },
      { id: 2, eventType: "quota_reset", message: "reset" },
    ], fireWebNotification);

    expect(fireWebNotification).toHaveBeenCalledTimes(2);
    expect(fireWebNotification).toHaveBeenNthCalledWith(1, {
      id: 1,
      eventType: "quota_warning",
      message: "warning",
    });
    expect(fireWebNotification).toHaveBeenNthCalledWith(2, {
      id: 2,
      eventType: "quota_reset",
      message: "reset",
    });
  });

  it("ignores missing preview arrays", () => {
    const fireWebNotification = vi.fn();

    applyNotificationPreviews(undefined, fireWebNotification);

    expect(fireWebNotification).not.toHaveBeenCalled();
  });
});

describe("refresh intervals", () => {
  it("starts a recovery watch for depleted accounts that are not in use", () => {
    const account = makeAccount({
      codexHomePath: "/tmp/codex",
      quotaData: {
        fetchedAt: "2026-03-23T10:00:00.000Z",
        primary: { usedPercent: 100, resetsAt: 1_900_000_000, windowDurationSecs: 18_000 },
        secondary: { usedPercent: 80, resetsAt: 1_900_500_000, windowDurationSecs: 604_800 },
      },
    });

    expect(getRecoveryWatchRefreshIntervalMins(account, Date.parse("2026-03-23T10:15:00.000Z"))).toBe(
      DEPLETED_RECOVERY_WATCH_INTERVAL_MINS,
    );
    expect(getEffectiveRefreshIntervalMins(account, Date.parse("2026-03-23T10:15:00.000Z"))).toBe(
      DEPLETED_RECOVERY_WATCH_INTERVAL_MINS,
    );
  });

  it("checks more aggressively close to reset time", () => {
    const now = Date.parse("2026-03-23T10:00:00.000Z");
    const account = makeAccount({
      codexHomePath: "/tmp/codex",
      quotaData: {
        fetchedAt: "2026-03-23T09:55:00.000Z",
        primary: {
          usedPercent: 100,
          resetsAt: Math.floor((now + 5 * 60_000) / 1000),
          windowDurationSecs: 18_000,
        },
        secondary: { usedPercent: 20, resetsAt: 1_900_500_000, windowDurationSecs: 604_800 },
      },
    });

    expect(getRecoveryWatchRefreshIntervalMins(account, now)).toBe(DEPLETED_RECOVERY_NEAR_RESET_INTERVAL_MINS);
    expect(getEffectiveRefreshIntervalMins(account, now)).toBe(DEPLETED_RECOVERY_NEAR_RESET_INTERVAL_MINS);
  });

  it("preserves the faster manual auto-refresh cadence when already in use", () => {
    const account = makeAccount({
      codexHomePath: "/tmp/codex",
      refreshIntervalMins: 5,
      quotaData: {
        fetchedAt: "2026-03-23T09:55:00.000Z",
        primary: { usedPercent: 100, resetsAt: 1_900_000_000, windowDurationSecs: 18_000 },
        secondary: { usedPercent: 20, resetsAt: 1_900_500_000, windowDurationSecs: 604_800 },
      },
    });

    expect(getEffectiveRefreshIntervalMins(account, Date.parse("2026-03-23T10:15:00.000Z"))).toBe(5);
  });

  it("does not auto-refresh accounts without an active cadence or depleted quota", () => {
    const account = makeAccount({
      codexHomePath: "/tmp/codex",
      quotaData: {
        fetchedAt: "2026-03-23T10:00:00.000Z",
        primary: { usedPercent: 60, resetsAt: 1_900_000_000, windowDurationSecs: 18_000 },
        secondary: { usedPercent: 20, resetsAt: 1_900_500_000, windowDurationSecs: 604_800 },
      },
    });

    expect(getRecoveryWatchRefreshIntervalMins(account, Date.parse("2026-03-23T10:15:00.000Z"))).toBeNull();
    expect(getEffectiveRefreshIntervalMins(account, Date.parse("2026-03-23T10:15:00.000Z"))).toBeNull();
  });
});
