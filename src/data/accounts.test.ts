import { describe, expect, it } from "vitest";
import type { Account } from "@/types";
import { getSortedAccounts } from "./accounts";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_test",
    name: "Test Account",
    email: "test@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-01",
    usageLimits: [],
    ...overrides,
  };
}

describe("getSortedAccounts", () => {
  it("orders normal accounts before weekly-warning before waiting-refresh", () => {
    const accounts = [
      makeAccount({
        id: "waiting",
        name: "Waiting",
        pinned: true,
        quotaData: {
          fetchedAt: "2026-03-19T00:00:00.000Z",
          primary: { usedPercent: 100, resetsAt: null, windowDurationSecs: null },
          secondary: { usedPercent: 20, resetsAt: null, windowDurationSecs: null },
        },
      }),
      makeAccount({
        id: "warning",
        name: "Warning",
        starred: true,
        quotaData: {
          fetchedAt: "2026-03-19T00:00:00.000Z",
          primary: { usedPercent: 30, resetsAt: null, windowDurationSecs: null },
          secondary: { usedPercent: 97, resetsAt: null, windowDurationSecs: null },
        },
      }),
      makeAccount({
        id: "normal",
        name: "Normal",
      }),
    ];

    expect(getSortedAccounts(accounts).map((account) => account.id)).toEqual([
      "normal",
      "warning",
      "waiting",
    ]);
  });

  it("keeps pinned accounts ordered by pinOrder within the same rank", () => {
    const accounts = [
      makeAccount({ id: "plain", name: "Plain" }),
      makeAccount({ id: "pin-b", name: "Pin B", pinned: true, pinOrder: 2 }),
      makeAccount({ id: "pin-a", name: "Pin A", pinned: true, pinOrder: 1 }),
      makeAccount({ id: "starred", name: "Starred", starred: true }),
    ];

    expect(getSortedAccounts(accounts).map((account) => account.id)).toEqual([
      "pin-a",
      "pin-b",
      "starred",
      "plain",
    ]);
  });
});
