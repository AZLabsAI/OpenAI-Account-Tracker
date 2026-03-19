import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/types";
import {
  getAccountStatus,
  getExpiryBorderUrgency,
  getDerivedAccountHealth,
  getQuotaStatus,
  getSortRank,
  getSubscriptionStatus,
} from "./account-health";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_test",
    name: "Test Account",
    email: "test@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-03-31",
    usageLimits: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("account health", () => {
  it("marks weekly 95-99% used as weekly warning / expiring-soon", () => {
    const account = makeAccount({
      quotaData: {
        fetchedAt: "2026-03-19T00:00:00.000Z",
        primary: { usedPercent: 20, resetsAt: null, windowDurationSecs: null },
        secondary: { usedPercent: 95, resetsAt: null, windowDurationSecs: null },
      },
    });

    expect(getQuotaStatus(account)).toBe("weekly-warning");
    expect(getAccountStatus(account)).toBe("expiring-soon");
    expect(getSortRank(account)).toBe(1);
  });

  it("keeps healthy in-use accounts active in the compatibility layer", () => {
    const account = makeAccount({
      inUse: true,
      quotaData: {
        fetchedAt: "2026-03-19T00:00:00.000Z",
        primary: { usedPercent: 20, resetsAt: null, windowDurationSecs: null },
        secondary: { usedPercent: 40, resetsAt: null, windowDurationSecs: null },
      },
    });

    expect(getAccountStatus(account)).toBe("in-use");
    expect(getDerivedAccountHealth(account)).toMatchObject({
      quotaStatus: "normal",
      accountStatus: "in-use",
    });
  });

  it("marks any fully depleted window as waiting-refresh", () => {
    const account = makeAccount({
      quotaData: {
        fetchedAt: "2026-03-19T00:00:00.000Z",
        primary: { usedPercent: 100, resetsAt: null, windowDurationSecs: null },
        secondary: { usedPercent: 50, resetsAt: null, windowDurationSecs: null },
      },
    });

    expect(getQuotaStatus(account)).toBe("waiting-refresh");
    expect(getAccountStatus(account)).toBe("waiting-refresh");
    expect(getSortRank(account)).toBe(2);
  });

  it("treats final 5 days as expiring and final 2 as critical border urgency", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));

    const warningAccount = makeAccount({ expirationDate: "2026-03-24" });
    const criticalAccount = makeAccount({ expirationDate: "2026-03-21" });

    expect(getSubscriptionStatus(warningAccount)).toBe("expiring");
    expect(getExpiryBorderUrgency(warningAccount)).toBe("warning");
    expect(getExpiryBorderUrgency(criticalAccount)).toBe("critical");
  });
});
