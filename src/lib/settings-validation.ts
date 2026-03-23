import type { NotificationSettings } from "@/types";

export const DEFAULT_THRESHOLDS = [15, 10, 5, 0] as const;
export const DEFAULT_QUIET_HOURS_START = "22:00";
export const DEFAULT_QUIET_HOURS_END = "07:00";
export const DEFAULT_EXHAUSTED_REMINDER_MINS = 0;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const BOOLEAN_KEYS = [
  "notifications_enabled",
  "web_enabled",
  "native_enabled",
  "telegram_enabled",
  "quiet_hours_enabled",
] as const;

const STRING_KEYS = [
  "telegram_bot_token",
  "telegram_chat_id",
  "quiet_hours_start",
  "quiet_hours_end",
] as const;

const OTHER_KEYS = [
  "default_thresholds",
  "exhausted_reminder_mins",
] as const;

const ALLOWED_KEYS = new Set<string>([
  ...BOOLEAN_KEYS,
  ...STRING_KEYS,
  ...OTHER_KEYS,
]);

export interface SettingsPatch {
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  notifications_enabled?: boolean;
  web_enabled?: boolean;
  native_enabled?: boolean;
  telegram_enabled?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  default_thresholds?: number[];
  exhausted_reminder_mins?: number;
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: unknown, key: string) {
  if (typeof value !== "boolean") {
    throw new SettingsValidationError(`${key} must be a boolean`);
  }
  return value;
}

function parseString(value: unknown, key: string) {
  if (typeof value !== "string") {
    throw new SettingsValidationError(`${key} must be a string`);
  }
  return value.trim();
}

function parseTime(value: unknown, key: string) {
  const parsed = parseString(value, key);
  if (!TIME_PATTERN.test(parsed)) {
    throw new SettingsValidationError(`${key} must use HH:MM format`);
  }
  return parsed;
}

function parseThresholds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new SettingsValidationError("default_thresholds must be an array");
  }

  const parsed = value.map((entry) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry > 100) {
      throw new SettingsValidationError("default_thresholds entries must be integers between 0 and 100");
    }
    return entry;
  });

  return Array.from(new Set(parsed)).sort((left, right) => right - left);
}

function parseReminderMins(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SettingsValidationError("exhausted_reminder_mins must be a non-negative integer");
  }
  return value;
}

export function parseSettingsPatch(input: unknown): SettingsPatch {
  if (!isPlainObject(input)) {
    throw new SettingsValidationError("Settings payload must be an object");
  }

  const unknownKeys = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new SettingsValidationError(`Unknown settings field: ${unknownKeys[0]}`);
  }

  const patch: SettingsPatch = {};

  for (const key of BOOLEAN_KEYS) {
    if (input[key] !== undefined) {
      patch[key] = parseBoolean(input[key], key);
    }
  }

  if (input.telegram_bot_token !== undefined) {
    patch.telegram_bot_token = parseString(input.telegram_bot_token, "telegram_bot_token");
  }
  if (input.telegram_chat_id !== undefined) {
    patch.telegram_chat_id = parseString(input.telegram_chat_id, "telegram_chat_id");
  }
  if (input.quiet_hours_start !== undefined) {
    patch.quiet_hours_start = parseTime(input.quiet_hours_start, "quiet_hours_start");
  }
  if (input.quiet_hours_end !== undefined) {
    patch.quiet_hours_end = parseTime(input.quiet_hours_end, "quiet_hours_end");
  }
  if (input.default_thresholds !== undefined) {
    patch.default_thresholds = parseThresholds(input.default_thresholds);
  }
  if (input.exhausted_reminder_mins !== undefined) {
    patch.exhausted_reminder_mins = parseReminderMins(input.exhausted_reminder_mins);
  }

  return patch;
}

export function parseStoredThresholds(value: string | null): NotificationSettings["defaultThresholds"] {
  if (!value) return [...DEFAULT_THRESHOLDS];

  try {
    return parseThresholds(JSON.parse(value));
  } catch {
    return [...DEFAULT_THRESHOLDS];
  }
}

export function parseStoredReminderMins(value: string | null): NotificationSettings["exhaustedReminderMins"] {
  if (value == null) return DEFAULT_EXHAUSTED_REMINDER_MINS;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_EXHAUSTED_REMINDER_MINS;
}

export function parseStoredTime(value: string | null, fallback: string) {
  if (!value) return fallback;
  return TIME_PATTERN.test(value) ? value : fallback;
}
