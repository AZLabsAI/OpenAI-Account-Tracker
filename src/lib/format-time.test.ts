import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatCompactWeekdayDateTime,
  formatLastFetchedAgo,
  formatQuotaFetchedLabel,
  formatWholeDaysAgo,
  isFutureIsoTime,
} from "./format-time";

describe("format-time", () => {
  describe("formatQuotaFetchedLabel", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns just now for very recent timestamps", () => {
      const iso = new Date("2025-06-15T11:59:30.000Z").toISOString();
      expect(formatQuotaFetchedLabel(iso)).toBe("just now");
    });

    it("returns minutes ago", () => {
      const iso = new Date("2025-06-15T11:30:00.000Z").toISOString();
      expect(formatQuotaFetchedLabel(iso)).toBe("30m ago");
    });

    it("returns hours ago same day", () => {
      const iso = new Date("2025-06-15T08:00:00.000Z").toISOString();
      expect(formatQuotaFetchedLabel(iso)).toBe("4h ago");
    });
  });

  describe("formatLastFetchedAgo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("includes minutes within hour for same-day", () => {
      const iso = new Date("2025-06-15T10:30:00.000Z").toISOString();
      expect(formatLastFetchedAgo(iso)).toBe("1h 30m ago");
    });
  });

  describe("formatCompactWeekdayDateTime", () => {
    it("renders weekday, date, and time in the compact header format", () => {
      expect(
        formatCompactWeekdayDateTime("2026-04-15T18:13:00.000Z", { timeZone: "UTC" }),
      ).toBe("Wed, Apr 15 · 6:13 PM");
    });

    it("can include an explicit timezone label", () => {
      expect(
        formatCompactWeekdayDateTime("2026-04-08T19:54:04.608Z", {
          timeZone: "Africa/Johannesburg",
          includeTimeZoneName: true,
        }),
      ).toBe("Wed, Apr 8 · 9:54 PM SAST");
    });
  });

  describe("formatWholeDaysAgo", () => {
    it("returns 0 days ago for a same-day timestamp", () => {
      expect(
        formatWholeDaysAgo("2025-06-15T01:00:00.000Z", {
          now: new Date("2025-06-15T23:00:00.000Z"),
          timeZone: "UTC",
        }),
      ).toBe("0 days ago");
    });

    it("returns whole calendar days ago", () => {
      expect(
        formatWholeDaysAgo("2025-06-08T23:59:00.000Z", {
          now: new Date("2025-06-15T12:00:00.000Z"),
          timeZone: "UTC",
        }),
      ).toBe("7 days ago");
    });

    it("returns null for an invalid timestamp", () => {
      expect(formatWholeDaysAgo("not-a-date")).toBeNull();
    });
  });

  describe("isFutureIsoTime", () => {
    it("returns true when the timestamp is later than now", () => {
      expect(
        isFutureIsoTime("2026-04-08T19:54:04.608Z", { now: new Date("2026-04-08T17:18:24.000Z") }),
      ).toBe(true);
    });

    it("returns false when the timestamp is not in the future", () => {
      expect(
        isFutureIsoTime("2026-04-08T00:07:19.925Z", { now: new Date("2026-04-08T17:18:24.000Z") }),
      ).toBe(false);
    });
  });
});
