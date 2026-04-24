"use client";

/**
 * Sparkline — switchable quota-history visualization.
 *
 * Three styles:
 *   "bars"  — Pulse Bars (default): discrete vertical bars, per-bar color
 *   "wave"  — Gradient Wave: smooth bézier area chart
 *   "dots"  — Dot Trail: connected dots, thin line, faint fill
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { SparklineStyle } from "@/types";

// ─── Public interface ────────────────────────────────────────────────────────

export interface Bucket {
  label: string;
  remaining: number | null;
  interpolated?: boolean;
}

interface Props {
  style?: SparklineStyle;
  buckets: Bucket[];
  remainingPct: number;
  gradientId: string;
}

export function Sparkline({ style = "bars", ...rest }: Props) {
  switch (style) {
    case "wave": return <WaveSparkline {...rest} />;
    case "dots": return <DotsSparkline {...rest} />;
    default:     return <BarsSparkline {...rest} />;
  }
}

// ─── Shared hover hook ───────────────────────────────────────────────────────

function useSparkHover(n: number) {
  const [hovered, setHovered] = useState<number | null>(null);
  const last = useRef<number | null>(null);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement | HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (n - 1));
    if (idx !== last.current) { last.current = idx; setHovered(idx); }
  }, [n]);

  const onLeave = useCallback(() => { last.current = null; setHovered(null); }, []);
  return { hovered, onMove, onLeave };
}

// ─── Shared tooltip ──────────────────────────────────────────────────────────

function Tip({ bucket, leftPct, color }: { bucket: Bucket; leftPct: number; color: string }) {
  return (
    <div className="absolute bottom-full mb-1.5 pointer-events-none z-10"
      style={{ left: `${Math.max(8, Math.min(92, leftPct))}%`, transform: "translateX(-50%)" }}>
      <div className="rounded-lg bg-zinc-900 border border-zinc-600/50 px-2.5 py-1.5 shadow-xl text-center whitespace-nowrap">
        <span className="text-[10px] text-zinc-400">{bucket.label}</span>
        {bucket.remaining != null ? (
          <span className="text-[12px] font-bold tabular-nums ml-1.5" style={{ color }}>
            {bucket.interpolated ? "~" : ""}{Math.round(bucket.remaining)}%
            {bucket.interpolated && <span className="text-[9px] font-normal text-zinc-500 ml-1">est.</span>}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600 ml-1.5">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Color helper ────────────────────────────────────────────────────────────

function hue(pct: number) {
  return pct <= 10 ? "#ef4444" : pct <= 30 ? "#f59e0b" : "#10b981";
}

// ─── Point mapper (shared by Wave + Dots) ────────────────────────────────────

function usePoints(buckets: Bucket[]) {
  return useMemo(() => {
    const n = buckets.length;
    return buckets
      .map((b, i) => {
        if (b.remaining == null) return null;
        const r = Math.max(0, Math.min(100, b.remaining));
        return { x: n > 1 ? (i / (n - 1)) * 100 : 50, y: 100 - r, i, remaining: r };
      })
      .filter(Boolean) as { x: number; y: number; i: number; remaining: number }[];
  }, [buckets]);
}

// ═════════════════════════════════════════════════════════════════════════════
//  BARS — Pulse Bars (default)
// ═════════════════════════════════════════════════════════════════════════════

function BarsSparkline({ buckets }: Omit<Props, "style">) {
  const { hovered, onMove, onLeave } = useSparkHover(buckets.length);
  const hBucket = hovered != null ? buckets[hovered] : null;
  const hLeft = hovered != null && buckets.length > 1 ? (hovered / (buckets.length - 1)) * 100 : null;

  return (
    <div className="relative mt-2">
      <div className="flex items-end gap-[2px] cursor-crosshair" style={{ height: "36px" }}
        onMouseMove={onMove} onMouseLeave={onLeave} role="img" aria-label="Quota trend bars">
        {buckets.map((b, i) => {
          const active = hovered === i;
          if (b.remaining == null) {
            return <div key={i} className="flex-1 rounded-t-[2px] bg-zinc-800/40" style={{ height: "3px" }} />;
          }
          const r = Math.max(0, Math.min(100, b.remaining));
          const c = hue(r);
          const baseOpacity = b.interpolated ? 0.32 : 0.65;
          return (
            <div key={i} className="flex-1 rounded-t-[2px] transition-all duration-100"
              style={{
                height: `${Math.max(8, r)}%`,
                backgroundColor: c,
                opacity: active ? 1 : baseOpacity,
                filter: active ? "brightness(1.2)" : undefined,
                boxShadow: active ? `0 0 8px ${c}40` : undefined,
              }} />
          );
        })}
      </div>
      {hBucket && hLeft != null && (
        <Tip bucket={hBucket} leftPct={hLeft}
          color={hBucket.remaining != null ? hue(hBucket.remaining) : "#71717a"} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  WAVE — Gradient Wave (smooth bézier area chart)
// ═════════════════════════════════════════════════════════════════════════════

function WaveSparkline({ buckets, remainingPct, gradientId: id }: Omit<Props, "style">) {
  const { hovered, onMove, onLeave } = useSparkHover(buckets.length);
  const points = usePoints(buckets);

  const { line, area } = useMemo(() => {
    if (points.length < 2) return { line: "", area: "" };
    let l = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], c = points[i];
      const cx = (p.x + c.x) / 2;
      l += ` C ${cx} ${p.y}, ${cx} ${c.y}, ${c.x} ${c.y}`;
    }
    const last = points[points.length - 1], first = points[0];
    return { line: l, area: `${l} L ${last.x} 100 L ${first.x} 100 Z` };
  }, [points]);

  const color = hue(remainingPct);
  const hBucket = hovered != null ? buckets[hovered] : null;
  const hLeft = hovered != null && buckets.length > 1 ? (hovered / (buckets.length - 1)) * 100 : null;

  if (points.length < 2) return null;

  return (
    <div className="relative mt-2">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full cursor-crosshair rounded-md"
        style={{ height: "48px" }} onMouseMove={onMove} onMouseLeave={onLeave}
        role="img" aria-label="Quota trend">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map(v => (
          <line key={v} x1="0" y1={100 - v} x2="100" y2={100 - v}
            strokeWidth="1" vectorEffect="non-scaling-stroke"
            className="stroke-zinc-700/30" strokeDasharray="2 3" />
        ))}
        <path d={area} fill={`url(#${id}-g)`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5"
          vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {hLeft != null && (
          <line x1={hLeft} y1="0" x2={hLeft} y2="100"
            stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"
            strokeDasharray="2 2" opacity="0.5" />
        )}
      </svg>
      {hovered != null && hBucket?.remaining != null && (() => {
        const r = Math.max(0, Math.min(100, hBucket.remaining));
        return <div className="absolute w-2 h-2 rounded-full pointer-events-none ring-2 ring-zinc-900"
          style={{ left: `${hLeft}%`, top: `${((100 - r) / 100) * 48}px`, transform: "translate(-50%,-50%)", backgroundColor: color }} />;
      })()}
      {hBucket && hLeft != null && <Tip bucket={hBucket} leftPct={hLeft} color={color} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  DOTS — Dot Trail (connected dots, thin line, faint fill)
// ═════════════════════════════════════════════════════════════════════════════

function DotsSparkline({ buckets, remainingPct, gradientId: id }: Omit<Props, "style">) {
  const { hovered, onMove, onLeave } = useSparkHover(buckets.length);
  const points = usePoints(buckets);

  const { poly, area } = useMemo(() => {
    if (points.length < 2) return { poly: "", area: "" };
    const p = points.map(pt => `${pt.x},${pt.y}`).join(" ");
    const first = points[0], last = points[points.length - 1];
    const a = `M${first.x},${first.y} ${points.slice(1).map(pt => `L${pt.x},${pt.y}`).join(" ")} L${last.x},100 L${first.x},100 Z`;
    return { poly: p, area: a };
  }, [points]);

  const color = hue(remainingPct);
  const hBucket = hovered != null ? buckets[hovered] : null;
  const hLeft = hovered != null && buckets.length > 1 ? (hovered / (buckets.length - 1)) * 100 : null;
  const H = 44;

  if (points.length < 2) return null;

  return (
    <div className="relative mt-2">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full cursor-crosshair rounded-md"
        style={{ height: `${H}px` }} onMouseMove={onMove} onMouseLeave={onLeave}
        role="img" aria-label="Quota trend">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="50" x2="100" y2="50"
          strokeWidth="1" vectorEffect="non-scaling-stroke"
          className="stroke-zinc-700/25" strokeDasharray="4 4" />
        <path d={area} fill={`url(#${id}-g)`} />
        <polyline points={poly} fill="none" stroke={color} strokeWidth="1"
          vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </svg>
      {/* CSS-positioned dots (avoids SVG distortion from preserveAspectRatio=none) */}
      {points.map(p => {
        const active = hovered === p.i;
        const est = buckets[p.i]?.interpolated;
        return (
          <div key={p.i} className="absolute pointer-events-none transition-all duration-100"
            style={{
              left: `${(p.i / (buckets.length - 1)) * 100}%`,
              top: `${((100 - p.remaining) / 100) * H}px`,
              transform: "translate(-50%,-50%)",
              width: active ? "9px" : est ? "4px" : "5px",
              height: active ? "9px" : est ? "4px" : "5px",
              borderRadius: "50%",
              backgroundColor: est && !active ? "transparent" : color,
              opacity: active ? 1 : est ? 0.45 : 0.75,
              boxShadow: active ? `0 0 6px ${color}60` : undefined,
              border: active
                ? "1.5px solid rgba(255,255,255,0.9)"
                : est ? `1px solid ${color}` : "1px solid rgba(0,0,0,0.3)",
            }} />
        );
      })}
      {hBucket && hLeft != null && <Tip bucket={hBucket} leftPct={hLeft} color={color} />}
    </div>
  );
}
