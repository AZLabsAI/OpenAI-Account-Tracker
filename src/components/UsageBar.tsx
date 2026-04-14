"use client";

/**
 * UsageBar — renders a single quota window as a labelled progress bar
 * with an interactive SVG sparkline history chart.
 *
 * Accepts either:
 *   - A static `UsageLimit` (legacy / manually entered)
 *   - A live `QuotaWindow` from the Codex app-server
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UsageLimit, QuotaData } from "@/types";
import { formatQuotaFetchedLabel } from "@/lib/format-time";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bucket {
  label: string;
  remaining: number | null;
}

interface ChartPoint {
  x: number;
  y: number;
  index: number;
  label: string;
  remaining: number;
}

interface QuotaHistoryItem {
  fetchedAt: string;
  primaryPct: number | null;
  weeklyPct: number | null;
}

type Trend = "rising" | "falling" | "stable";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_H = 40;
const CHART_PAD_X = 2;
const CHART_PAD_Y = 4;
const TREND_SLOPE_THRESHOLD = 2;

const TREND_CONFIG: Record<Trend, { icon: string; label: string; className: string }> = {
  rising:  { icon: "↑", label: "Recovering", className: "text-emerald-500 dark:text-emerald-400" },
  falling: { icon: "↓", label: "Depleting",  className: "text-amber-500 dark:text-amber-400" },
  stable:  { icon: "→", label: "Stable",     className: "text-zinc-400 dark:text-zinc-500" },
};

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

export function QuotaBar({ quotaData, accountId }: QuotaBarProps) {
  const { primary, secondary, fetchedAt } = quotaData;
  const [history, setHistory] = useState<QuotaHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);

    async function fetchHistory() {
      try {
        const res = await fetch(`/api/accounts/${accountId}/history`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setHistory(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch quota history", err);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    fetchHistory();

    return () => { cancelled = true; };
  }, [accountId, fetchedAt]);

  const fetchedLabel = formatQuotaFetchedLabel(fetchedAt);

  // Stable "now" reference — only changes when fetchedAt changes
  const now = useMemo(() => new Date(), [fetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const primaryBuckets = useMemo(
    () => buildHourlyBuckets(history, now, 24),
    [history, now],
  );

  const secondaryBuckets = useMemo(
    () => buildDailyBuckets(history, now, 14),
    [history, now],
  );

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
          historyLoading={historyLoading}
        />
      )}
      {secondary && (
        <QuotaWindow
          slot="secondary"
          label={quotaLabelFor(secondary, "secondary")}
          window={secondary}
          buckets={secondaryBuckets}
          historyLoading={historyLoading}
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
  historyLoading,
}: {
  slot: "primary" | "secondary";
  label: string;
  window: NonNullable<QuotaData["primary"]>;
  buckets: Bucket[];
  historyLoading: boolean;
}) {
  const remainingPct = 100 - Math.max(0, Math.min(100, w.usedPercent));
  const resetsLabel = formatBalanceResetLabel(w.resetsAt);
  const trend = useMemo(() => calculateTrend(buckets), [buckets]);
  const trendCfg = TREND_CONFIG[trend];
  const filledCount = buckets.filter(b => b.remaining != null).length;
  const hasHistory = filledCount >= 2;

  return (
    <div className="space-y-1">
      {/* Label + Trend indicator */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
          {label}
        </p>
        {hasHistory && (
          <span className={`flex items-center gap-1 text-[10px] font-medium ${trendCfg.className}`}>
            <span>{trendCfg.icon}</span>
            <span>{trendCfg.label}</span>
          </span>
        )}
      </div>

      {/* Large percentage */}
      <p className="leading-none text-zinc-900 dark:text-zinc-50">
        <span className="tabular-nums text-[1.45rem] font-semibold tracking-[-0.03em]">
          {remainingPct}%
        </span>
        {" "}
        <span className="ml-1.5 text-[0.95rem] font-medium text-zinc-700 dark:text-zinc-200">
          remaining
        </span>
      </p>

      {/* Progress bar */}
      <BarTrack
        remainingPct={remainingPct}
        barColor="bg-emerald-500 dark:bg-emerald-400"
        trackColor="bg-zinc-200 dark:bg-zinc-200/90"
        heightClassName="h-3"
        ariaLabel={`${label}, ${remainingPct}% remaining`}
      />

      {/* Sparkline chart or skeleton */}
      {historyLoading ? (
        <SparklineSkeleton />
      ) : hasHistory ? (
        <SparklineChart
          buckets={buckets}
          slot={slot}
          currentRemaining={remainingPct}
        />
      ) : null}

      {/* Reset label */}
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {resetsLabel ? `Resets ${resetsLabel}` : "Reset time unavailable"}
      </p>
    </div>
  );
}

// ─── Sparkline: Loading skeleton ──────────────────────────────────────────────

function SparklineSkeleton() {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800/30 animate-pulse" />
      <div className="h-10 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/30 animate-pulse" />
    </div>
  );
}

// ─── Sparkline: Interactive SVG area chart ────────────────────────────────────

function SparklineChart({
  buckets,
  slot,
  currentRemaining,
}: {
  buckets: Bucket[];
  slot: "primary" | "secondary";
  currentRemaining: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const hoveredRef = useRef<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  // Measure container width for 1:1 viewBox mapping (no distortion)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reveal animation (respects prefers-reduced-motion)
  useEffect(() => {
    if (width === 0) return;
    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = prefersReduced ? 0 : 60;
    const timer = setTimeout(() => setIsRevealed(true), delay);
    return () => clearTimeout(timer);
  }, [width]);

  // Chart geometry — depends on measured width
  const chartW = width - CHART_PAD_X * 2;
  const chartH = CHART_H - CHART_PAD_Y * 2;

  // Map buckets to chart coordinates
  const allPoints = useMemo(() => {
    if (width === 0) return [];
    const count = buckets.length;
    return buckets.map((b, i) => {
      const x = CHART_PAD_X + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2);
      const remaining = b.remaining != null ? Math.max(0, Math.min(100, b.remaining)) : null;
      return {
        x,
        y: remaining != null ? CHART_PAD_Y + chartH - (remaining / 100) * chartH : null,
        index: i,
        label: b.label,
        remaining: b.remaining,
      };
    });
  }, [buckets, width, chartW, chartH]);

  const filledPoints = useMemo(
    () => allPoints.filter((p): p is ChartPoint => p.y != null),
    [allPoints],
  );

  // Build smooth SVG paths
  const { linePath, areaPath } = useMemo(() => {
    if (filledPoints.length < 2) return { linePath: "", areaPath: "" };
    const line = buildSmoothPath(filledPoints);
    const last = filledPoints[filledPoints.length - 1];
    const first = filledPoints[0];
    const bottom = CHART_H - CHART_PAD_Y;
    const area = `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
    return { linePath: line, areaPath: area };
  }, [filledPoints]);

  // Color based on current quota level
  const chartColor = useMemo(() => sparklineColorFor(currentRemaining), [currentRemaining]);

  // Efficient hover: only re-render when bucket index changes
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (width === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (buckets.length - 1));
    if (idx !== hoveredRef.current) {
      hoveredRef.current = idx;
      setHoveredIndex(idx);
    }
  }, [width, buckets.length]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setHoveredIndex(null);
  }, []);

  const hoveredPoint = hoveredIndex != null ? allPoints[hoveredIndex] ?? null : null;
  const timeLabel = slot === "primary" ? "Last 24 Hours" : "Last 14 Days";
  const gradientId = `sp-grad-${slot}`;

  return (
    <div ref={containerRef} className="relative mt-2">
      {/* Time axis labels */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
          {timeLabel}
        </span>
        <div className="flex items-center gap-2.5 text-[9px] tabular-nums text-zinc-400 dark:text-zinc-600">
          <span>{buckets[0]?.label}</span>
          <span className="text-zinc-300 dark:text-zinc-700">→</span>
          <span>{buckets[buckets.length - 1]?.label}</span>
        </div>
      </div>

      {/* Chart */}
      {width > 0 && filledPoints.length >= 2 && (
        <>
          <svg
            viewBox={`0 0 ${width} ${CHART_H}`}
            width={width}
            height={CHART_H}
            className="rounded-md transition-[opacity,clip-path] duration-700 ease-out motion-reduce:transition-none overflow-visible"
            style={{
              opacity: isRevealed ? 1 : 0,
              clipPath: isRevealed ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            role="img"
            aria-label={`${timeLabel} quota trend. ${filledPoints.length} data points.`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor.rgb} stopOpacity={0.25} />
                <stop offset="100%" stopColor={chartColor.rgb} stopOpacity={0.03} />
              </linearGradient>
            </defs>

            {/* Subtle grid lines */}
            {[25, 50, 75].map(pct => {
              const y = CHART_PAD_Y + chartH - (pct / 100) * chartH;
              return (
                <line
                  key={pct}
                  x1={CHART_PAD_X} y1={y}
                  x2={width - CHART_PAD_X} y2={y}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-zinc-200/60 dark:stroke-zinc-800/40"
                  strokeDasharray="2 3"
                />
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradientId})`} />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={chartColor.rgb}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover guideline */}
            {hoveredPoint && hoveredPoint.y != null && (
              <line
                x1={hoveredPoint.x} y1={CHART_PAD_Y}
                x2={hoveredPoint.x} y2={CHART_H - CHART_PAD_Y}
                stroke={chartColor.rgb}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="2 2"
                opacity={0.4}
              />
            )}

            {/* Data point dots — show on hover */}
            {filledPoints.map(p => {
              const isHovered = hoveredIndex === p.index;
              return (
                <circle
                  key={p.index}
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 3.5 : 0}
                  fill={chartColor.rgb}
                  stroke="white"
                  strokeWidth={isHovered ? 1.5 : 0}
                  style={{ transition: "r 0.12s ease-out, stroke-width 0.12s ease-out" }}
                />
              );
            })}

            {/* Invisible hover capture — full rect */}
            <rect x={0} y={0} width={width} height={CHART_H} fill="transparent" cursor="crosshair" />
          </svg>

          {/* Custom tooltip */}
          {hoveredPoint && (
            <SparklineTooltip
              point={hoveredPoint}
              totalBuckets={buckets.length}
              color={chartColor}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sparkline: Tooltip ───────────────────────────────────────────────────────

function SparklineTooltip({
  point,
  totalBuckets,
  color,
}: {
  point: { label: string; remaining: number | null; index: number };
  totalBuckets: number;
  color: { rgb: string };
}) {
  const leftPct = totalBuckets > 1
    ? (point.index / (totalBuckets - 1)) * 100
    : 50;

  // Clamp to prevent overflow at edges
  const clampedLeft = Math.max(8, Math.min(92, leftPct));

  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{ left: `${clampedLeft}%`, bottom: `${CHART_H + 4}px`, transform: "translateX(-50%)" }}
    >
      <div className="rounded-lg bg-zinc-900 dark:bg-zinc-800 border border-zinc-700/80 dark:border-zinc-600/60 px-2.5 py-1.5 shadow-xl shadow-black/20">
        <p className="text-[10px] font-medium text-zinc-400 whitespace-nowrap">
          {point.label}
        </p>
        {point.remaining != null ? (
          <p className="text-[12px] font-bold tabular-nums whitespace-nowrap" style={{ color: color.rgb }}>
            {Math.round(point.remaining)}% remaining
          </p>
        ) : (
          <p className="text-[11px] text-zinc-600 italic whitespace-nowrap">No data</p>
        )}
      </div>
      {/* Arrow */}
      <div className="flex justify-center -mt-[1px]">
        <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-800 border-r border-b border-zinc-700/80 dark:border-zinc-600/60 rotate-45" />
      </div>
    </div>
  );
}

// ─── Bucket builders (pure, memoizable) ───────────────────────────────────────

function buildHourlyBuckets(history: QuotaHistoryItem[], now: Date, count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const bucketEnd = new Date(now.getTime() - i * 3_600_000);
    const bucketStart = new Date(now.getTime() - (i + 1) * 3_600_000);

    const snapshot = history.find(s => {
      if (s.primaryPct == null) return false;
      const t = new Date(s.fetchedAt).getTime();
      return t > bucketStart.getTime() && t <= bucketEnd.getTime();
    });

    const hour = bucketEnd.getHours();
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;

    return { label: `${hour12}:00 ${ampm}`, remaining: snapshot?.primaryPct ?? null };
  }).reverse();
}

function buildDailyBuckets(history: QuotaHistoryItem[], now: Date, count: number): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const bucketStart = new Date(now.getTime() - i * 86_400_000);
    bucketStart.setHours(0, 0, 0, 0);
    const bucketEnd = new Date(bucketStart.getTime() + 86_400_000);

    const snapshot = history.find(s => {
      if (s.weeklyPct == null) return false;
      const t = new Date(s.fetchedAt).getTime();
      return t >= bucketStart.getTime() && t < bucketEnd.getTime();
    });

    const month = bucketStart.toLocaleString("default", { month: "short" });
    const day = bucketStart.getDate();

    return { label: `${month} ${day}`, remaining: snapshot?.weeklyPct ?? null };
  }).reverse();
}

// ─── Trend calculation (linear regression slope) ──────────────────────────────

function calculateTrend(buckets: Bucket[]): Trend {
  const filled = buckets.filter(b => b.remaining != null).map(b => b.remaining!);
  if (filled.length < 3) return "stable";

  // Use last 5 points for a responsive trend signal
  const recent = filled.slice(-Math.min(5, filled.length));
  const n = recent.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recent[i];
    sumXY += i * recent[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return "stable";
  const slope = (n * sumXY - sumX * sumY) / denom;

  if (slope > TREND_SLOPE_THRESHOLD) return "rising";
  if (slope < -TREND_SLOPE_THRESHOLD) return "falling";
  return "stable";
}

// ─── SVG path builder — smooth cubic bezier ───────────────────────────────────

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Horizontal midpoint control points create smooth S-curves
    const cpx = (prev.x + curr.x) / 2;
    path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return path;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function sparklineColorFor(remainingPct: number): { rgb: string } {
  if (remainingPct <= 10) return { rgb: "rgb(239, 68, 68)" };   // red-500
  if (remainingPct <= 30) return { rgb: "rgb(245, 158, 11)" };  // amber-500
  return { rgb: "rgb(16, 185, 129)" };                           // emerald-500
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
  if (usedPct >= 90) return { barColor: "bg-red-500",    textColor: "text-red-400" };
  if (usedPct >= 60) return { barColor: "bg-amber-400",  textColor: "text-amber-400" };
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
