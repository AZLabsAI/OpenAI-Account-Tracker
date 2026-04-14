"use client";

/**
 * UsageBar — renders a single quota window as a labelled progress bar.
 *
 * Accepts either:
 *   - A static `UsageLimit` (legacy / manually entered)
 *   - A live `QuotaWindow` from the Codex app-server
 */

import { useEffect, useState } from "react";
import type { UsageLimit, QuotaData } from "@/types";
import { formatQuotaFetchedLabel } from "@/lib/format-time";

// ─── Static UsageLimit bar (existing) ────────────────────────────────────────

interface StaticProps {
  limit: UsageLimit;
}

export function UsageBar({ limit }: StaticProps) {
  const pct = Math.max(0, Math.min(100, limit.remainingPct));
  const { barColor, textColor } = colorFor(100 - pct);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-400 font-medium">{limit.label}</span>
        <span className={`tabular-nums font-semibold ${textColor}`}>{pct}%</span>
      </div>
      <BarTrack
        remainingPct={pct}
        barColor={barColor}
        ariaLabel={`${limit.label} usage, ${pct}% remaining`}
      />
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

// ─── Live QuotaBar — uses QuotaData from the app-server ──────────────────────

interface QuotaBarProps {
  quotaData: QuotaData;
  accountId: string;
}

interface QuotaHistoryItem {
  fetchedAt: string;
  primaryPct: number | null;
  weeklyPct: number | null;
}

export function QuotaBar({ quotaData, accountId }: QuotaBarProps) {
  const { primary, secondary, fetchedAt } = quotaData;
  const [history, setHistory] = useState<QuotaHistoryItem[]>([]);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/accounts/${accountId}/history`);
        if (res.ok) {
          const data = await res.json();
          // Data is returned newest first. We keep it that way for the bucketing logic
          setHistory(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch quota history", err);
      }
    }
    fetchHistory();
  }, [accountId, fetchedAt]);

  const fetchedLabel = formatQuotaFetchedLabel(fetchedAt);

  // Group historical snapshots into buckets
  // For the 5-hour quota, we want 24 hourly buckets.
  // For the weekly quota, we want 14 daily buckets.
  const now = new Date();
  
  // Primary (Hourly) Buckets
  const primaryBuckets: { label: string; remaining: number | null }[] = Array.from({ length: 24 }).map((_, i) => {
    const bucketStart = new Date(now.getTime() - i * 3600000);
    const bucketEnd = new Date(now.getTime() - (i - 1) * 3600000);
    
    // Find the latest snapshot in this bucket that has a primaryPct
    const snapshotInBucket = history.find(s => {
      if (s.primaryPct == null) return false;
      const t = new Date(s.fetchedAt).getTime();
      return t <= bucketEnd.getTime() && t > bucketStart.getTime();
    });

    const hour = bucketStart.getHours();
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;

    return {
      label: `${hour12}:00 ${ampm}`,
      remaining: snapshotInBucket ? snapshotInBucket.primaryPct : null,
    };
  }).reverse(); // Reverse so oldest is left, newest is right

  // Secondary (Daily) Buckets
  const secondaryBuckets: { label: string; remaining: number | null }[] = Array.from({ length: 14 }).map((_, i) => {
    const bucketStart = new Date(now.getTime() - i * 86400000);
    // Align to start of day for cleaner boundaries (optional, but good for daily)
    bucketStart.setHours(0, 0, 0, 0);
    const bucketEnd = new Date(bucketStart.getTime() + 86400000);
    
    // Find the latest snapshot in this bucket that has a weeklyPct
    const snapshotInBucket = history.find(s => {
      if (s.weeklyPct == null) return false;
      const t = new Date(s.fetchedAt).getTime();
      return t < bucketEnd.getTime() && t >= bucketStart.getTime();
    });

    const month = bucketStart.toLocaleString('default', { month: 'short' });
    const day = bucketStart.getDate();

    return {
      label: `${month} ${day}`,
      remaining: snapshotInBucket ? snapshotInBucket.weeklyPct : null,
    };
  }).reverse();

  return (
    <div className="space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          Live Balance
        </h4>
        <span className="text-xs text-zinc-500 dark:text-zinc-600">{fetchedLabel}</span>
      </div>

      {primary && (
        <QuotaWindow
          slot="primary"
          label={quotaLabelFor(primary, "primary")}
          window={primary}
          buckets={primaryBuckets}
        />
      )}
      {secondary && (
        <QuotaWindow
          slot="secondary"
          label={quotaLabelFor(secondary, "secondary")}
          window={secondary}
          buckets={secondaryBuckets}
        />
      )}
      {!primary && !secondary && (
        <p className="text-xs text-zinc-500 italic">No quota data available</p>
      )}
    </div>
  );
}

// ─── Individual window bar ────────────────────────────────────────────────────

function QuotaWindow({
  slot,
  label,
  window: w,
  buckets,
}: {
  slot: "primary" | "secondary";
  label: string;
  window: NonNullable<QuotaData["primary"]>;
  buckets: { label: string; remaining: number | null }[];
}) {
  const remainingPct = 100 - Math.max(0, Math.min(100, w.usedPercent));
  const resetsLabel = formatBalanceResetLabel(w.resetsAt);

  return (
    <div className="space-y-1">
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
            {label}
          </p>
          <p className="leading-none text-zinc-900 dark:text-zinc-50">
            <span className="tabular-nums text-[1.45rem] font-semibold tracking-[-0.03em]">
              {remainingPct}%
            </span>
            {" "}
            <span className="ml-1.5 text-[0.95rem] font-medium text-zinc-700 dark:text-zinc-200">
              remaining
            </span>
          </p>
        </div>

        {/* Sparkline History */}
        {buckets.length > 0 && (
          <div className="flex items-end h-8 gap-[2px] mb-0.5" title={`${slot === 'primary' ? 'Last 24 Hours' : 'Last 14 Days'} Trend`}>
            {buckets.map((bucket, index) => {
              if (bucket.remaining == null) {
                // Render an empty placeholder for buckets with no data
                return (
                  <div
                    key={index}
                    className="w-1 rounded-[1px] bg-zinc-200/50 dark:bg-zinc-800/50"
                    style={{ height: '2px' }}
                    title={`${bucket.label}: No data`}
                  />
                );
              }
              
              const remaining = Math.max(0, Math.min(100, bucket.remaining));
              const { barColor } = colorFor(100 - remaining);
              
              return (
                <div
                  key={index}
                  className={`w-1 rounded-[1px] opacity-60 hover:opacity-100 hover:brightness-110 transition-all cursor-crosshair ${barColor}`}
                  style={{ height: `${remaining}%`, minHeight: '2px' }}
                  title={`${bucket.label}: ${Math.round(remaining)}% remaining`}
                />
              );
            })}
          </div>
        )}
      </div>

      <BarTrack
        remainingPct={remainingPct}
        barColor="bg-emerald-500 dark:bg-emerald-400"
        trackColor="bg-zinc-200 dark:bg-zinc-200/90"
        heightClassName="h-3"
        ariaLabel={`${label}, ${remainingPct}% remaining`}
      />
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {resetsLabel ? `Resets ${resetsLabel}` : "Reset time unavailable"}
      </p>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function BarTrack({
  remainingPct,
  barColor,
  trackColor = "bg-zinc-200 dark:bg-zinc-800",
  heightClassName = "h-2",
  ariaLabel,
}: {
  remainingPct: number;
  barColor: string;
  trackColor?: string;
  heightClassName?: string;
  ariaLabel: string;
}) {
  const v = Math.round(Math.max(0, Math.min(100, remainingPct)));
  return (
    <div
      className={`${heightClassName} w-full rounded-full overflow-hidden ${trackColor}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none ${barColor}`}
        style={{ width: `${remainingPct}%` }}
      />
    </div>
  );
}

function colorFor(usedPct: number): { barColor: string; textColor: string } {
  if (usedPct >= 90) return { barColor: "bg-red-500",    textColor: "text-red-400"    };
  if (usedPct >= 60) return { barColor: "bg-amber-400",  textColor: "text-amber-400"  };
  return               { barColor: "bg-emerald-500", textColor: "text-emerald-400" };
}

function quotaLabelFor(window: NonNullable<QuotaData["primary"]>, slot: "primary" | "secondary"): string {
  const duration = window.windowDurationSecs;
  if (duration != null) {
    if (Math.abs(duration - 18_000) <= 60) return "5 hour usage limit";
    if (Math.abs(duration - 604_800) <= 60) return "Weekly usage limit";
  }
  return slot === "primary" ? "5 hour usage limit" : "Weekly usage limit";
}

function formatBalanceResetLabel(resetsAt: number | null): string | null {
  if (!resetsAt) return null;

  const timeZone = "Africa/Johannesburg";
  const resetDate = new Date(resetsAt * 1000);
  const now = new Date();
  const resetParts = getDateTimeParts(resetDate, timeZone);
  const nowParts = getDateTimeParts(now, timeZone);
  const daysUntil = Math.max(0, differenceInCalendarDays(nowParts, resetParts));
  const timePart = `${resetParts.hour}:${resetParts.minute} ${resetParts.dayPeriod}`;
  const datePart = `${resetParts.weekday}, ${resetParts.month} ${resetParts.day} · ${timePart}`;
  const dayPart = dayPartForHour(resetParts.hour24);

  if (daysUntil === 0) {
    if (dayPart === "tonight") {
      return `tonight at ${timePart}`;
    }

    return `this ${dayPart} at ${timePart}`;
  }

  if (daysUntil === 1) {
    if (dayPart === "tonight") {
      return `tomorrow night on ${datePart}`;
    }

    return `tomorrow ${dayPart} on ${datePart}`;
  }

  return `in ${daysUntil} day${daysUntil === 1 ? "" : "s"} on ${datePart}`;
}

function getDateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour12 = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const hour24 = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value,
  );

  return {
    year,
    month,
    day,
    weekday,
    hour: hour12,
    minute,
    dayPeriod,
    hour24,
  };
}

function differenceInCalendarDays(
  current: { year: number; month: string; day: number },
  target: { year: number; month: string; day: number },
) {
  const monthIndex = (month: string) => {
    const date = new Date(`${month} 1, 2000`);
    return date.getMonth();
  };

  const currentIndex = Date.UTC(current.year, monthIndex(current.month), current.day);
  const targetIndex = Date.UTC(target.year, monthIndex(target.month), target.day);
  return Math.round((targetIndex - currentIndex) / 86_400_000);
}

function dayPartForHour(hour24: number) {
  if (hour24 >= 5 && hour24 <= 11) return "morning";
  if (hour24 >= 12 && hour24 <= 16) return "afternoon";
  if (hour24 >= 17 && hour24 <= 20) return "evening";
  return "tonight";
}
