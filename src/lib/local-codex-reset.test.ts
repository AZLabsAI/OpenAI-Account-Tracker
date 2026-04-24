import { describe, expect, it } from "vitest";
import { detectLocalCodexReset } from "./local-codex-reset";
import type { QuotaHistoryRow } from "./db";

const NOW = new Date("2026-04-24T12:00:00.000Z");

function snap(accountId: string, minutesAgo: number, primaryPct: number | null, weeklyPct: number | null): QuotaHistoryRow {
  const t = new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
  return { accountId, fetchedAt: t, primaryPct, weeklyPct };
}

describe("detectLocalCodexReset", () => {
  it("returns no detection for empty input", () => {
    expect(detectLocalCodexReset([], NOW).detected).toBe(false);
  });

  it("fires when every eligible account resets within the cluster window", () => {
    const rows: QuotaHistoryRow[] = [
      // Account A: prior 30/45 → latest 100/100, 5 min ago
      snap("A", 5, 100, 100),
      snap("A", 65, 30, 45),
      // Account B: prior 10/20 → latest 100/100, 8 min ago
      snap("B", 8, 100, 100),
      snap("B", 70, 10, 20),
      // Account C: prior 55/80 → latest 100/100, 6 min ago
      snap("C", 6, 100, 100),
      snap("C", 75, 55, 80),
    ];
    const r = detectLocalCodexReset(rows, NOW);
    expect(r.detected).toBe(true);
    expect(r.accountCount).toBe(3);
    expect(r.eligibleCount).toBe(3);
    expect(r.detectedAt).not.toBeNull();
  });

  it("does NOT fire when one eligible account is still below 100%", () => {
    const rows: QuotaHistoryRow[] = [
      snap("A", 5, 100, 100),
      snap("A", 65, 20, 20),
      snap("B", 7, 100, 100),
      snap("B", 70, 10, 20),
      // C is eligible but still showing usage — no global reset.
      snap("C", 10, 72, 98),
      snap("C", 80, 60, 95),
    ];
    expect(detectLocalCodexReset(rows, NOW).detected).toBe(false);
  });

  it("does NOT fire with only a single transitioning account", () => {
    const rows: QuotaHistoryRow[] = [
      snap("A", 5, 100, 100),
      snap("A", 65, 30, 45),
      // B was already at 100/100 — no transition. Still eligible and at 100.
      snap("B", 5, 100, 100),
      snap("B", 65, 100, 100),
    ];
    const r = detectLocalCodexReset(rows, NOW);
    expect(r.detected).toBe(false);
    expect(r.eligibleCount).toBe(2);
  });

  it("does NOT fire when transitions are too far apart", () => {
    const rows: QuotaHistoryRow[] = [
      snap("A", 5, 100, 100),   // reset 5 min ago
      snap("A", 65, 30, 45),
      snap("B", 90, 100, 100),  // reset 90 min ago → outside 30-min cluster
      snap("B", 180, 30, 45),
    ];
    expect(detectLocalCodexReset(rows, NOW).detected).toBe(false);
  });

  it("ignores stale accounts (no recent snapshot)", () => {
    const rows: QuotaHistoryRow[] = [
      snap("A", 5, 100, 100),
      snap("A", 65, 20, 30),
      snap("B", 8, 100, 100),
      snap("B", 70, 15, 25),
      // Account C has no snapshot in last 6h → excluded from eligibility.
      snap("C", 60 * 10, 50, 70),
    ];
    const r = detectLocalCodexReset(rows, NOW);
    expect(r.detected).toBe(true);
    expect(r.eligibleCount).toBe(2);
  });

  it("treats 99%+ as reset (absorbs rounding noise)", () => {
    const rows: QuotaHistoryRow[] = [
      snap("A", 5, 99.4, 99.8),
      snap("A", 65, 30, 45),
      snap("B", 7, 100, 99.1),
      snap("B", 70, 10, 20),
    ];
    expect(detectLocalCodexReset(rows, NOW).detected).toBe(true);
  });

  it("requires prior snapshot to be materially below 100", () => {
    const rows: QuotaHistoryRow[] = [
      // Prior was 96% — above 95 ceiling → not a real transition.
      snap("A", 5, 100, 100),
      snap("A", 65, 96, 97),
      snap("B", 7, 100, 100),
      snap("B", 70, 96, 97),
    ];
    expect(detectLocalCodexReset(rows, NOW).detected).toBe(false);
  });
});
