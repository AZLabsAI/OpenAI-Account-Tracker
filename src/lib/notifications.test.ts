import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, QuotaData } from "@/types";

const { getLatestUnresolvedEvent } = vi.hoisted(() => ({
  getLatestUnresolvedEvent: vi.fn(),
}));

vi.mock("./db", () => ({
  getLatestUnresolvedEvent,
  hasUnresolvedEvent: vi.fn(),
  insertNotificationEvent: vi.fn(),
  markNotificationDelivered: vi.fn(),
}));

vi.mock("./notify-settings", () => ({
  getNotificationSettings: vi.fn(),
  isQuietHours: vi.fn(),
  getTelegramCredentials: vi.fn(),
}));

vi.mock("./notify-telegram", () => ({
  sendTelegram: vi.fn(),
}));

vi.mock("./notify-native", () => ({
  sendNative: vi.fn(),
}));

vi.mock("./logger", () => ({
  logInfo: vi.fn(),
  logSuccess: vi.fn(),
  logWarn: vi.fn(),
}));

import { detectTransitions } from "./notifications";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_notify",
    name: "Notify Account",
    email: "notify@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-01",
    usageLimits: [],
    ...overrides,
  };
}

function makeQuotaData(primaryUsed: number | null, secondaryUsed: number | null): QuotaData {
  return {
    fetchedAt: "2026-03-19T12:00:00.000Z",
    primary: primaryUsed === null ? null : {
      usedPercent: primaryUsed,
      resetsAt: 1_800_000_000,
      windowDurationSecs: 18_000,
    },
    secondary: secondaryUsed === null ? null : {
      usedPercent: secondaryUsed,
      resetsAt: 1_800_500_000,
      windowDurationSecs: 604_800,
    },
  };
}

describe("detectTransitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));
    getLatestUnresolvedEvent.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only the highest-severity threshold crossed per window", () => {
    const transitions = detectTransitions(
      makeAccount(),
      makeQuotaData(80, 20),
      makeQuotaData(96, 20),
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      eventType: "quota_critical",
      triggerWindow: "primary",
      remainingPercent: 4,
    });
  });

  it("detects reset transitions independently from threshold alerts", () => {
    const transitions = detectTransitions(
      makeAccount(),
      makeQuotaData(92, 20),
      makeQuotaData(40, 20),
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.eventType).toBe("quota_reset");
  });

  it("gates exhausted reminders on unresolved events and cooldown", () => {
    const account = makeAccount();
    const quota = makeQuotaData(100, 20);

    getLatestUnresolvedEvent.mockReturnValue(null);
    expect(detectTransitions(account, quota, quota, [15, 10, 5, 0], 240)).toHaveLength(0);

    getLatestUnresolvedEvent.mockReturnValue({ id: 1, createdAt: "2026-03-19T10:30:00.000Z" });
    expect(detectTransitions(account, quota, quota, [15, 10, 5, 0], 240)).toHaveLength(0);

    getLatestUnresolvedEvent.mockReturnValue({ id: 1, createdAt: "2026-03-19T07:00:00.000Z" });
    const transitions = detectTransitions(account, quota, quota, [15, 10, 5, 0], 240);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      eventType: "quota_exhausted",
      triggerWindow: "primary",
      remainingPercent: 0,
      isReminder: true,
    });
  });
});
