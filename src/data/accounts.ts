import { Account, AccountType } from "@/types";
import type { AccountStatus } from "@/types";

/**
 * Seed accounts — used only to populate a fresh database on first run.
 * Replace these with your own accounts, or add them via the UI.
 * Real account data is stored in data.db (gitignored) and never committed.
 */
export const accounts: Account[] = [
  {
    id: "acc_001",
    name: "My Primary Account",
    email: "primary@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2027-03-03",
    starred: true,
    usageLimits: [
      { label: "5 Hour Usage", remainingPct: 100, resetsAt: "Every 5 hours" },
      { label: "Weekly Usage", remainingPct: 100, resetsAt: "Every Monday" },
    ],
    accountType: "Primary account" as AccountType,
    lastChecked: new Date().toISOString(),
  },
  {
    id: "acc_002",
    name: "Work Account",
    email: "work@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-06",
    usageLimits: [
      { label: "5 Hour Usage", remainingPct: 100, resetsAt: "Every 5 hours" },
      { label: "Weekly Usage", remainingPct: 100, resetsAt: "Every Monday" },
    ],
    accountType: "Work account" as AccountType,
    lastChecked: new Date().toISOString(),
  },
  {
    id: "acc_003",
    name: "Personal Account",
    email: "personal@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-06",
    usageLimits: [
      { label: "5 Hour Usage", remainingPct: 80, resetsAt: "Every 5 hours" },
      { label: "Weekly Usage", remainingPct: 60, resetsAt: "Every Monday" },
    ],
    accountType: "Personal account" as AccountType,
    lastChecked: new Date().toISOString(),
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Sort accounts: pinned first (by pinOrder), then starred, then by name.
 *  inUse is purely a visual indicator — it does NOT affect sort position. */
export function getSortedAccounts(accs: Account[]): Account[] {
  return [...accs].sort((a, b) => {
    // Pinned first, ordered by pinOrder
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (a.pinned && b.pinned) return (a.pinOrder ?? 0) - (b.pinOrder ?? 0);
    // Starred second
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Derive account health from its expiration date + inUse flag. */
export function getAccountStatus(account: Account): AccountStatus {
  if (account.inUse) return "in-use";

  const now = new Date();
  const exp = new Date(account.expirationDate);
  if (isNaN(exp.getTime())) return "unknown";
  if (exp < now) return "expired";

  const daysLeft = Math.ceil(
    (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysLeft <= 14) return "expiring-soon";
  return "active";
}

/** Format an ISO date string to a readable form. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Days remaining until expiration. */
export function daysUntilExpiration(iso: string): number {
  const now = new Date();
  const exp = new Date(iso);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
