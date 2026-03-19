import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXHAUSTED_REMINDER_MINS,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_THRESHOLDS,
  parseSettingsPatch,
  parseStoredReminderMins,
  parseStoredThresholds,
  parseStoredTime,
  SettingsValidationError,
} from "./settings-validation";

describe("settings validation", () => {
  it("normalizes valid settings payloads", () => {
    const parsed = parseSettingsPatch({
      notifications_enabled: true,
      quiet_hours_start: "09:30",
      default_thresholds: [5, 15, 5, 0],
      exhausted_reminder_mins: 60,
    });

    expect(parsed.notifications_enabled).toBe(true);
    expect(parsed.quiet_hours_start).toBe("09:30");
    expect(parsed.default_thresholds).toEqual([15, 5, 0]);
    expect(parsed.exhausted_reminder_mins).toBe(60);
  });

  it("rejects malformed settings payloads", () => {
    expect(() => parseSettingsPatch({ quiet_hours_start: "9:30" })).toThrow(SettingsValidationError);
    expect(() => parseSettingsPatch({ default_thresholds: ["5"] })).toThrow(SettingsValidationError);
    expect(() => parseSettingsPatch({ unknown_field: true })).toThrow(SettingsValidationError);
  });

  it("falls back safely when stored settings are malformed", () => {
    expect(parseStoredThresholds("not json")).toEqual([...DEFAULT_THRESHOLDS]);
    expect(parseStoredReminderMins("-4")).toBe(DEFAULT_EXHAUSTED_REMINDER_MINS);
    expect(parseStoredTime("25:99", DEFAULT_QUIET_HOURS_START)).toBe(DEFAULT_QUIET_HOURS_START);
  });
});
