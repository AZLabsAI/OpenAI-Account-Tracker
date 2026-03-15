/**
 * UsageBar — renders a single quota window as a labelled progress bar.
 *
 * Accepts either:
 *   - A static `UsageLimit` (legacy / manually entered)
 *   - A live `QuotaWindow` from the Codex app-server
 */

import type { UsageLimit, QuotaData } from "@/types";

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
        <span className={`font-mono font-semibold ${textColor}`}>{pct}%</span>
      </div>
      <BarTrack remainingPct={pct} barColor={barColor} />
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
}

export function QuotaBar({ quotaData }: QuotaBarProps) {
  const { primary, secondary, planType, fetchedAt } = quotaData;

  const fetchedLabel = formatFetchedAt(fetchedAt);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          Live Quota
          {planType && (
            <span className="ml-1.5 normal-case font-normal text-zinc-500 dark:text-zinc-600">· {planType}</span>
          )}
        </h4>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-600">{fetchedLabel}</span>
      </div>

      {primary && (
        <QuotaWindow
          label="5-hour window"
          window={primary}
        />
      )}
      {secondary && (
        <QuotaWindow
          label="Weekly window"
          window={secondary}
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
  label,
  window: w,
}: {
  label: string;
  window: NonNullable<QuotaData["primary"]>;
}) {
  const usedPct = Math.max(0, Math.min(100, w.usedPercent));
  const remainingPct = 100 - usedPct;
  const { barColor, textColor } = colorFor(usedPct);

  const resetsLabel = formatResetsAt(w.resetsAt);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-400 font-medium text-[13px]">{label}</span>
        <span className={`font-mono font-semibold text-[13px] ${textColor}`}>
          {remainingPct}% left
        </span>
      </div>
      <BarTrack remainingPct={remainingPct} barColor={barColor} />
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>{usedPct}% used</span>
        {resetsLabel && <span>Resets {resetsLabel}</span>}
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function BarTrack({ remainingPct, barColor }: { remainingPct: number; barColor: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
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

function formatResetsAt(resetsAt: number | null): string | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt * 1000);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "soon";

  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `in ${diffHrs}h ${diffMins % 60}m`;
  const diffDays = Math.floor(diffHrs / 24);
  return `in ${diffDays}d ${diffHrs % 24}h`;
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
