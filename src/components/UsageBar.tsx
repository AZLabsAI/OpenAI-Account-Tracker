import { UsageLimit } from "@/types";

interface Props {
  limit: UsageLimit;
}

export function UsageBar({ limit }: Props) {
  const pct = Math.max(0, Math.min(100, limit.remainingPct));

  // Color coding: green ≥ 60, amber 30-59, red < 30
  const barColor =
    pct >= 60
      ? "bg-emerald-500"
      : pct >= 30
        ? "bg-amber-400"
        : "bg-red-500";

  const textColor =
    pct >= 60
      ? "text-emerald-400"
      : pct >= 30
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400 font-medium">{limit.label}</span>
        <span className={`font-mono font-semibold ${textColor}`}>
          {pct}%
        </span>
      </div>

      {/* Bar track */}
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Meta row */}
      {(limit.resetsAt || limit.total !== undefined) && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          {limit.resetsAt && <span>Resets: {limit.resetsAt}</span>}
          {limit.total !== undefined && limit.used !== undefined && (
            <span>
              {limit.used} / {limit.total} used
            </span>
          )}
        </div>
      )}
    </div>
  );
}
