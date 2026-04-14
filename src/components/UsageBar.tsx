"use client";

/**
 * UsageBar — renders a single quota window as a labelled progress bar
 * with a configurable sparkline showing quota history.
 */

import { useEffect, useMemo, useState } from "react";
import type { UsageLimit, QuotaData, SparklineStyle } from "@/types";
import { formatQuotaFetchedLabel } from "@/lib/format-time";
import { Sparkline, type Bucket } from "./Sparkline";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuotaHistoryItem {
  fetchedAt: string;
  primaryPct: number | null;
  weeklyPct: number | null;
}

type Trend = "rising" | "falling" | "stable";

const TREND_META: Record<Trend, { icon: string; label: string; cls: string }> = {
  rising:  { icon: "↑", label: "Recovering", cls: "text-emerald-500 dark:text-emerald-400" },
  falling: { icon: "↓", label: "Depleting",  cls: "text-amber-500 dark:text-amber-400" },
  stable:  { icon: "→", label: "Stable",     cls: "text-zinc-400 dark:text-zinc-500" },
};

// ─── Static UsageLimit bar ───────────────────────────────────────────────────

export function UsageBar({ limit }: { limit: UsageLimit }) {
  const pct = Math.max(0, Math.min(100, limit.remainingPct));
  const { barColor, textColor } = colorFor(100 - pct);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-400 font-medium">{limit.label}</span>
        <span className={`tabular-nums font-semibold ${textColor}`}>{pct}%</span>
      </div>
      <BarTrack pct={pct} barColor={barColor} ariaLabel={`${limit.label} usage, ${pct}% remaining`} />
      {(limit.resetsAt || limit.total !== undefined) && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          {limit.resetsAt && <span>Resets: {limit.resetsAt}</span>}
          {limit.total !== undefined && limit.used !== undefined && (
            <span>{limit.used} / {limit.total} used</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Live QuotaBar ───────────────────────────────────────────────────────────

export function QuotaBar({ quotaData, accountId, sparklineStyle }: {
  quotaData: QuotaData;
  accountId: string;
  sparklineStyle?: SparklineStyle;
}) {
  const { primary, secondary, fetchedAt } = quotaData;
  const [history, setHistory] = useState<QuotaHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    fetch(`/api/accounts/${accountId}/history`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!stale) setHistory(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [accountId, fetchedAt]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [fetchedAt]);
  const pBuckets = useMemo(() => buildHourlyBuckets(history, now, 24), [history, now]);
  const sBuckets = useMemo(() => buildDailyBuckets(history, now, 14), [history, now]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Live Balance</h4>
        <span className="text-xs text-zinc-500 dark:text-zinc-600">{formatQuotaFetchedLabel(fetchedAt)}</span>
      </div>
      {primary && (
        <QuotaWindow slot="primary" label={quotaLabelFor(primary, "primary")}
          window={primary} buckets={pBuckets} loading={loading}
          accountId={accountId} sparklineStyle={sparklineStyle} />
      )}
      {secondary && (
        <QuotaWindow slot="secondary" label={quotaLabelFor(secondary, "secondary")}
          window={secondary} buckets={sBuckets} loading={loading}
          accountId={accountId} sparklineStyle={sparklineStyle} />
      )}
      {!primary && !secondary && <p className="text-xs text-zinc-500 italic">No quota data available</p>}
    </div>
  );
}

// ─── QuotaWindow ─────────────────────────────────────────────────────────────

function QuotaWindow({ slot, label, window: w, buckets, loading, accountId, sparklineStyle }: {
  slot: "primary" | "secondary";
  label: string;
  window: NonNullable<QuotaData["primary"]>;
  buckets: Bucket[];
  loading: boolean;
  accountId: string;
  sparklineStyle?: SparklineStyle;
}) {
  const pct = 100 - Math.max(0, Math.min(100, w.usedPercent));
  const trend = useMemo(() => getTrend(buckets), [buckets]);
  const t = TREND_META[trend];
  const filled = buckets.filter(b => b.remaining != null).length;
  const resetsLabel = formatResetLabel(w.resetsAt);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-zinc-500">{label}</p>
        {filled >= 3 && (
          <span className={`flex items-center gap-0.5 text-[10px] font-medium ${t.cls}`}>
            {t.icon} {t.label}
          </span>
        )}
      </div>
      <p className="leading-none text-zinc-900 dark:text-zinc-50">
        <span className="tabular-nums text-[1.45rem] font-semibold tracking-[-0.03em]">{pct}%</span>
        {" "}<span className="ml-1.5 text-[0.95rem] font-medium text-zinc-700 dark:text-zinc-200">remaining</span>
      </p>
      <BarTrack pct={pct} barColor="bg-emerald-500 dark:bg-emerald-400"
        trackColor="bg-zinc-200 dark:bg-zinc-200/90" height="h-3"
        ariaLabel={`${label}, ${pct}% remaining`} />

      {loading
        ? <div className="h-9 w-full rounded bg-zinc-100 dark:bg-zinc-800/30 animate-pulse mt-1" />
        : filled >= 2 && (
          <Sparkline
            style={sparklineStyle}
            buckets={buckets}
            remainingPct={pct}
            gradientId={`sp-${accountId}-${slot}`}
          />
        )
      }

      <p className="text-[11px] text-zinc-500">{resetsLabel ? `Resets ${resetsLabel}` : "Reset time unavailable"}</p>
    </div>
  );
}

// ─── Bucket builders ─────────────────────────────────────────────────────────

function buildHourlyBuckets(history: QuotaHistoryItem[], now: Date, count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const end = new Date(now.getTime() - i * 3_600_000);
    const start = new Date(now.getTime() - (i + 1) * 3_600_000);
    const snap = history.find(s =>
      s.primaryPct != null &&
      new Date(s.fetchedAt).getTime() > start.getTime() &&
      new Date(s.fetchedAt).getTime() <= end.getTime(),
    );
    const h = end.getHours(), h12 = h % 12 || 12;
    return { label: `${h12}:00 ${h >= 12 ? "PM" : "AM"}`, remaining: snap?.primaryPct ?? null };
  }).reverse();
}

function buildDailyBuckets(history: QuotaHistoryItem[], now: Date, count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(now.getTime() - i * 86_400_000);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);
    const snap = history.find(s =>
      s.weeklyPct != null &&
      new Date(s.fetchedAt).getTime() >= start.getTime() &&
      new Date(s.fetchedAt).getTime() < end.getTime(),
    );
    return {
      label: `${start.toLocaleString("default", { month: "short" })} ${start.getDate()}`,
      remaining: snap?.weeklyPct ?? null,
    };
  }).reverse();
}

// ─── Trend (linear regression on last 5 filled) ─────────────────────────────

function getTrend(buckets: Bucket[]): Trend {
  const vals = buckets.filter(b => b.remaining != null).map(b => b.remaining!);
  if (vals.length < 3) return "stable";
  const r = vals.slice(-Math.min(5, vals.length));
  const n = r.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += r[i]; sxy += i * r[i]; sxx += i * i; }
  const d = n * sxx - sx * sx;
  if (d === 0) return "stable";
  const slope = (n * sxy - sx * sy) / d;
  return slope > 2 ? "rising" : slope < -2 ? "falling" : "stable";
}

// ─── Shared bar track ────────────────────────────────────────────────────────

function BarTrack({ pct, barColor, trackColor = "bg-zinc-200 dark:bg-zinc-800", height = "h-2", ariaLabel }: {
  pct: number; barColor: string; trackColor?: string; height?: string; ariaLabel: string;
}) {
  const v = Math.round(Math.max(0, Math.min(100, pct)));
  return (
    <div className={`${height} w-full rounded-full overflow-hidden ${trackColor}`}
      role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={ariaLabel}>
      <div className={`h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none ${barColor}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function colorFor(usedPct: number) {
  if (usedPct >= 90) return { barColor: "bg-red-500",    textColor: "text-red-400" };
  if (usedPct >= 60) return { barColor: "bg-amber-400",  textColor: "text-amber-400" };
  return               { barColor: "bg-emerald-500", textColor: "text-emerald-400" };
}

function quotaLabelFor(w: NonNullable<QuotaData["primary"]>, slot: "primary" | "secondary") {
  const d = w.windowDurationSecs;
  if (d != null) {
    if (Math.abs(d - 18_000) <= 60)  return "5 hour usage limit";
    if (Math.abs(d - 604_800) <= 60) return "Weekly usage limit";
  }
  return slot === "primary" ? "5 hour usage limit" : "Weekly usage limit";
}

// ─── Reset label formatting ──────────────────────────────────────────────────

function formatResetLabel(resetsAt: number | null): string | null {
  if (!resetsAt) return null;

  const tz = "Africa/Johannesburg";
  const reset = getDateTimeParts(new Date(resetsAt * 1000), tz);
  const today = getDateTimeParts(new Date(), tz);
  const days = Math.max(0, calendarDayDiff(today, reset));
  const time = `${reset.hour}:${reset.minute} ${reset.dayPeriod}`;
  const full = `${reset.weekday}, ${reset.month} ${reset.day} · ${time}`;
  const part = dayPart(reset.hour24);

  if (days === 0) return part === "tonight" ? `tonight at ${time}` : `this ${part} at ${time}`;
  if (days === 1) return part === "tonight" ? `tomorrow night on ${full}` : `tomorrow ${part} on ${full}`;
  return `in ${days} day${days === 1 ? "" : "s"} on ${full}`;
}

function getDateTimeParts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const p = fmt.formatToParts(date);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? "";
  const hour24 = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date).find(x => x.type === "hour")?.value);
  return {
    year: Number(g("year")), month: g("month"), day: Number(g("day")),
    weekday: g("weekday"), hour: g("hour"), minute: g("minute"),
    dayPeriod: g("dayPeriod"), hour24,
  };
}

function calendarDayDiff(
  a: { year: number; month: string; day: number },
  b: { year: number; month: string; day: number },
) {
  const mi = (m: string) => new Date(`${m} 1, 2000`).getMonth();
  return Math.round((Date.UTC(b.year, mi(b.month), b.day) - Date.UTC(a.year, mi(a.month), a.day)) / 86_400_000);
}

function dayPart(h: number) {
  if (h >= 5 && h <= 11) return "morning";
  if (h >= 12 && h <= 16) return "afternoon";
  if (h >= 17 && h <= 20) return "evening";
  return "tonight";
}
