import type { QuotaHistoryRow } from "./db";

export interface LocalCodexResetDetection {
  detected: boolean;
  detectedAt: string | null;
  accountCount: number;
  eligibleCount: number;
}

export const DEFAULT_OPTIONS = {
  // Account contributes only if it has a snapshot within this many hours.
  eligibilityWindowHours: 6,
  // The transitions we look at must have occurred within this window.
  detectionWindowHours: 2,
  // All transitions must fall inside this span of each other.
  clusterWindowMinutes: 30,
  // "Reset" means both pcts are at-or-above this.
  resetPctThreshold: 99,
  // Prior snapshot had to be materially below 100 on at least one window.
  preResetPctCeiling: 95,
  // Need at least this many distinct accounts transitioning to call it global.
  minTransitioningAccounts: 2,
} as const;

export type DetectorOptions = typeof DEFAULT_OPTIONS;

/**
 * Detect a global Codex reset from local quota-history evidence.
 *
 * Ground truth: OpenAI pushes a platform-wide reset → every signed-in account
 * jumps to 100% on both its primary (5-hour) AND weekly windows at roughly the
 * same moment, independent of each account's own scheduled reset time.
 *
 * Algorithm:
 *   1. Group snapshots by account. An account is "eligible" if its newest
 *      snapshot is within `eligibilityWindowHours` of `now`.
 *   2. For each eligible account, require the newest snapshot to be at-or-above
 *      `resetPctThreshold` on both windows. If any eligible account is still
 *      showing usage (<99% on either window) we abort — not a global reset.
 *   3. An account counts as "transitioning" if it has a prior snapshot that
 *      is at-or-below `preResetPctCeiling` on at least one window, and that
 *      prior snapshot falls within `detectionWindowHours` of the reset sample.
 *   4. Fire only if (a) ≥ `minTransitioningAccounts` transitioned and
 *      (b) their transition timestamps all cluster within `clusterWindowMinutes`.
 */
export function detectLocalCodexReset(
  rows: QuotaHistoryRow[],
  now: Date = new Date(),
  opts: DetectorOptions = DEFAULT_OPTIONS,
): LocalCodexResetDetection {
  const none: LocalCodexResetDetection = {
    detected: false,
    detectedAt: null,
    accountCount: 0,
    eligibleCount: 0,
  };

  if (!rows.length) return none;

  // Group by account, preserving newest-first order.
  const byAccount = new Map<string, QuotaHistoryRow[]>();
  for (const r of rows) {
    const list = byAccount.get(r.accountId) ?? [];
    list.push(r);
    byAccount.set(r.accountId, list);
  }
  for (const list of byAccount.values()) {
    list.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }

  const nowMs = now.getTime();
  const eligibilityCutoff = nowMs - opts.eligibilityWindowHours * 3_600_000;
  const detectionCutoff = nowMs - opts.detectionWindowHours * 3_600_000;

  const transitionMs: number[] = [];
  let eligibleCount = 0;

  for (const snapshots of byAccount.values()) {
    const latest = snapshots[0];
    const latestMs = Date.parse(latest.fetchedAt);
    if (!Number.isFinite(latestMs) || latestMs < eligibilityCutoff) continue;

    eligibleCount++;

    // Every eligible account must currently read as fully reset; one holdout
    // means the event wasn't global.
    const p = latest.primaryPct, w = latest.weeklyPct;
    if (p == null || w == null) return none;
    if (p < opts.resetPctThreshold || w < opts.resetPctThreshold) return none;

    // Look for a materially-sub-100 prior snapshot inside the detection window.
    const prior = snapshots.slice(1).find(s => {
      const t = Date.parse(s.fetchedAt);
      if (!Number.isFinite(t) || t < detectionCutoff) return false;
      const pp = s.primaryPct, wp = s.weeklyPct;
      if (pp == null && wp == null) return false;
      return (pp != null && pp <= opts.preResetPctCeiling)
        || (wp != null && wp <= opts.preResetPctCeiling);
    });

    if (prior) transitionMs.push(latestMs);
  }

  if (transitionMs.length < opts.minTransitioningAccounts) {
    return { ...none, eligibleCount };
  }

  transitionMs.sort((a, b) => a - b);
  const span = transitionMs[transitionMs.length - 1] - transitionMs[0];
  if (span > opts.clusterWindowMinutes * 60_000) {
    return { ...none, eligibleCount };
  }

  const median = transitionMs[Math.floor(transitionMs.length / 2)];
  return {
    detected: true,
    detectedAt: new Date(median).toISOString(),
    accountCount: transitionMs.length,
    eligibleCount,
  };
}
