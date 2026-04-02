import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatLastFetchedAgo, formatQuotaFetchedLabel } from "./format-time";

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
});
