/**
 * Core types for OpenAI account tracking.
 *
 * UsageLimit  – a single quota bucket (e.g. "5 hour limit", "weekly limit").
 * Account     – everything we know about one OpenAI account.
 * AccountStatus – derived health indicator shown in the UI.
 */

export type SubscriptionTier =
  | "Free"
  | "ChatGPT Plus"
  | "ChatGPT Pro"
  | "ChatGPT Team"
  | "ChatGPT Enterprise"
  | "API Pay-As-You-Go"
  | "API Scale";

export type AccountStatus = "in-use" | "active" | "expiring-soon" | "expired" | "unknown";

/** Codex / agent machines an account can be assigned to. */
export type CodexAgent =
  | "Eve"
  | "Ava"
  | "Codex on MacBook"
  | "Codex on Ava-PC"
  | "Codex on Work-PC"
  | "Pi on O-Auth";

export const CODEX_AGENTS: CodexAgent[] = [
  "Eve",
  "Ava",
  "Codex on MacBook",
  "Codex on Ava-PC",
  "Codex on Work-PC",
  "Pi on O-Auth",
];

/** ChatGPT client devices an account can be assigned to. */
export type ChatGPTAgent =
  | "ChatGPT on MacBook"
  | "ChatGPT on iPhone"
  | "ChatGPT on Work-PC";

export const CHATGPT_AGENTS: ChatGPTAgent[] = [
  "ChatGPT on MacBook",
  "ChatGPT on iPhone",
  "ChatGPT on Work-PC",
];

export type AccountType = "Primary account" | "Personal account" | "Work account" | "Business account";

export const ACCOUNT_TYPES: AccountType[] = [
  "Primary account",
  "Personal account",
  "Work account",
  "Business account",
];

export interface UsageLimit {
  /** Human-readable label, e.g. "5 Hour Usage" */
  label: string;
  /** 0-100 representing percentage remaining */
  remainingPct: number;
  /** Optional total quota expressed as a number (credits, messages, etc.) */
  total?: number;
  /** Optional amount consumed */
  used?: number;
  /** When this limit resets, if known */
  resetsAt?: string;
}

export interface Account {
  /** Stable identifier – use crypto.randomUUID() when adding new entries */
  id: string;
  name: string;
  email: string;
  subscription: SubscriptionTier;
  /** ISO-8601 date string, e.g. "2026-04-06" */
  expirationDate: string;
  /** Arbitrary usage buckets */
  usageLimits: UsageLimit[];
  /** Starred accounts are pinned to the top of the dashboard */
  starred?: boolean;
  /** Account is currently being actively used */
  inUse?: boolean;
  /** Optional notes visible in the detail view */
  notes?: string;
  /** Account type classification */
  accountType?: AccountType;
  /** Last time quota was checked (ISO-8601 datetime) – for future automation */
  lastChecked?: string;
  /** Avatar URL or initials fallback */
  avatarUrl?: string;
  /** Which Codex agents/machines this account is assigned to (can be multiple) */
  codexAssignedTo?: CodexAgent[];
  /** Which ChatGPT client devices this account is assigned to (can be multiple) */
  chatgptAssignedTo?: ChatGPTAgent[];
  /** Pinned accounts stay at the top in pin order — independent of starred */
  pinned?: boolean;
  /** Ascending integer — lower = higher in the pinned list */
  pinOrder?: number;
}
