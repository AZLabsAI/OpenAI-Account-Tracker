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

export type QuotaStatus = "normal" | "weekly-warning" | "waiting-refresh";

export type SubscriptionStatus = "active" | "expiring" | "expired" | "unknown";

/** Presentation compatibility status used by the current badge/UI layer. */
export type AccountStatus = "in-use" | "active" | "waiting-refresh" | "expiring-soon" | "expired" | "unknown";

/** Codex / agent machines an account can be assigned to. */
export type CodexAgent =
  | "Eve"
  | "Ava"
  | "Codex on MacBook"
  | "Codex on Ava-PC"
  | "Codex on Work-PC"
  | "Codex CLI on MacBook"
  | "Codex CLI on Ava-PC"
  | "Codex CLI on Work-PC"
  | "OpenCode on MacBook"
  | "Pi Agent on MacBook";

export const CODEX_AGENTS: CodexAgent[] = [
  "Eve",
  "Ava",
  "Codex on MacBook",
  "Codex on Ava-PC",
  "Codex on Work-PC",
  "Codex CLI on MacBook",
  "Codex CLI on Ava-PC",
  "Codex CLI on Work-PC",
  "OpenCode on MacBook",
  "Pi Agent on MacBook",
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
  /** ISO-8601 date string, e.g. "2026-04-06". Null/undefined means no expiry. */
  expirationDate?: string | null;
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
  /**
   * Absolute path to the CODEX_HOME directory for this account.
   * When set, quota can be fetched live via `codex app-server`.
   * Example: "/Users/you/.codex-accounts/acc_001"
   */
  codexHomePath?: string;
  /** Live quota data fetched from the Codex app-server. Stored in DB, refreshed on demand. */
  quotaData?: QuotaData;
  /**
   * Auto-refresh interval in minutes. null/undefined = manual only.
   * When set, the dashboard will automatically refresh quota at this cadence.
   */
  refreshIntervalMins?: number | null;
}

/** Live rate-limit snapshot from `account/rateLimits/read`. */
export interface QuotaData {
  /** ISO-8601 datetime when this was last fetched */
  fetchedAt: string;
  /** Email confirmed by the app-server — sanity-checks the right account is logged in */
  email?: string;
  /** e.g. "plus", "pro", "free" */
  planType?: string;
  /** 5-hour rolling window */
  primary: QuotaWindow | null;
  /** 7-day rolling window */
  secondary: QuotaWindow | null;
}

export interface QuotaWindow {
  /** 0-100 */
  usedPercent: number;
  /** Unix timestamp (seconds) when window resets */
  resetsAt: number | null;
  /** Duration of window in seconds */
  windowDurationSecs: number | null;
}

// ─── Notification types ─────────────────────────────────────────────────────

export type NotificationEventType =
  | "quota_warning"
  | "quota_critical"
  | "quota_exhausted"
  | "quota_reset"
  | "account_switch";

export interface NotificationEvent {
  id: number;
  accountId: string;
  eventType: NotificationEventType;
  /** 'primary' (5h) | 'secondary' (weekly) | null (for account_switch) */
  window: "primary" | "secondary" | null;
  usedPercent: number | null;
  message: string;
  createdAt: string;
  acknowledged: boolean;
  deliveredWeb: boolean;
  deliveredNative: boolean;
  deliveredTelegram: boolean;
  telegramMessageId: number | null;
}

export interface NotificationSettings {
  notificationsEnabled: boolean;
  webEnabled: boolean;
  nativeEnabled: boolean;
  telegramEnabled: boolean;
  telegramConfigured: boolean;
  telegramSource: "env" | "db" | null;
  telegramBotTokenMasked: string | null;
  telegramChatId: string | null;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultThresholds: number[];
  exhaustedReminderMins: number;
}
