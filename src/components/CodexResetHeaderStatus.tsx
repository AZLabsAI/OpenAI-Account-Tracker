"use client";

import { useEffect, useState } from "react";
import { useLiveClock } from "@/hooks/useLiveClock";
import { formatCompactWeekdayDateTime, formatWholeDaysAgo, isFutureIsoTime } from "@/lib/format-time";
import type { CodexResetIndicatorStatus, CodexResetStatusResponse } from "@/types/codex-reset";

export const CODEX_RESET_STATUS_PATH = "/api/codex-reset-status";
export const CODEX_RESET_POLL_MS = 60_000;
const CODEX_RESET_DISPLAY_TIME_ZONE = "Africa/Johannesburg";

const FALLBACK_STATUS: CodexResetStatusResponse = {
  status: "unavailable",
  configured: false,
  resetAt: null,
  updatedAt: null,
};

interface CodexResetHeaderModel {
  pillLabel: string;
  metaText: string | null;
  title: string;
  tone: CodexResetIndicatorStatus;
}

function isCodexResetStatusResponse(value: unknown): value is CodexResetStatusResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const sourceOk = candidate.source === undefined
    || candidate.source === "local" || candidate.source === "upstream" || candidate.source === "merged";
  return (
    (candidate.status === "yes" || candidate.status === "no" || candidate.status === "unavailable")
    && typeof candidate.configured === "boolean"
    && (typeof candidate.resetAt === "string" || candidate.resetAt === null)
    && (typeof candidate.updatedAt === "string" || candidate.updatedAt === null)
    && sourceOk
  );
}

export async function loadCodexResetStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<CodexResetStatusResponse> {
  try {
    const response = await fetchImpl(CODEX_RESET_STATUS_PATH, { cache: "no-store" });
    if (!response.ok) return FALLBACK_STATUS;
    const payload = await response.json();
    return isCodexResetStatusResponse(payload) ? payload : FALLBACK_STATUS;
  } catch {
    return FALLBACK_STATUS;
  }
}

export function scheduleCodexResetPolling(
  refresh: () => void,
  intervalMs = CODEX_RESET_POLL_MS,
): ReturnType<typeof setInterval> {
  return setInterval(refresh, intervalMs);
}

export function buildCodexResetHeaderModel(
  status: CodexResetStatusResponse,
  options: { now?: Date; timeZone?: string } = {},
): CodexResetHeaderModel {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? CODEX_RESET_DISPLAY_TIME_ZONE;
  const resetIsFuture = status.resetAt ? isFutureIsoTime(status.resetAt, { now }) : null;
  const resetLabel = status.resetAt
    ? formatCompactWeekdayDateTime(status.resetAt, {
      now,
      timeZone,
      includeTimeZoneName: true,
    })
    : null;
  const updatedLabel = status.updatedAt
    ? formatCompactWeekdayDateTime(status.updatedAt, {
      now,
      timeZone,
      includeTimeZoneName: true,
    })
    : null;
  const daysAgo = status.resetAt && resetIsFuture === false
    ? formatWholeDaysAgo(status.resetAt, {
      now,
      timeZone,
    })
    : null;

  if (status.status === "yes") {
    const sourceSuffix = status.source === "local"
      ? ` · detected on ${status.localAccountCount ?? "your"} account${status.localAccountCount === 1 ? "" : "s"}`
      : status.source === "merged"
        ? " · confirmed locally"
        : "";
    const metaBase = resetLabel && resetIsFuture === false
      ? `Reset ${resetLabel}`
      : updatedLabel
        ? `Updated ${updatedLabel}`
        : null;
    const metaText = metaBase ? `${metaBase}${sourceSuffix}` : (sourceSuffix ? sourceSuffix.replace(/^ · /, "") : null);
    const titleBase = updatedLabel
      ? `Codex reset detected. Last updated ${updatedLabel}.`
      : "Codex reset detected.";
    const title = status.source === "local"
      ? `${titleBase} Detected from your account quotas hitting 100%.`
      : titleBase;
    return {
      pillLabel: status.source === "local" ? "Codex Reset: YES ⚡" : "Codex Reset: YES",
      metaText,
      title,
      tone: "yes",
    };
  }

  if (status.status === "no") {
    const metaText = resetLabel && daysAgo
      ? `Last reset ${resetLabel} · ${daysAgo}`
      : updatedLabel
        ? `Updated ${updatedLabel}`
        : null;
    const title = updatedLabel
      ? `Codex has not reset yet. Last updated ${updatedLabel}.`
      : "Codex has not reset yet.";
    return {
      pillLabel: "Codex Reset: NO",
      metaText,
      title,
      tone: "no",
    };
  }

  const title = updatedLabel
    ? `Codex reset status unavailable. Last updated ${updatedLabel}.`
    : "Codex reset status unavailable.";

  return {
    pillLabel: "Codex Reset: UNKNOWN",
    metaText: null,
    title,
    tone: "unavailable",
  };
}

const TONE_STYLES: Record<CodexResetIndicatorStatus, { badge: string; dot: string; meta: string }> = {
  yes: {
    badge: "border-sky-300/50 bg-[linear-gradient(135deg,rgba(14,165,233,0.78),rgba(37,99,235,0.88),rgba(56,189,248,0.78))] text-white shadow-[0_0_28px_rgba(56,189,248,0.45)] ring-1 ring-sky-300/30 animate-pulse motion-reduce:animate-none",
    dot: "bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]",
    meta: "text-sky-500 dark:text-sky-300 font-medium",
  },
  no: {
    badge: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-500 dark:bg-zinc-400",
    meta: "text-zinc-500 dark:text-zinc-400",
  },
  unavailable: {
    badge: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
    meta: "text-zinc-500 dark:text-zinc-500",
  },
};

export function CodexResetHeaderStatusDisplay({
  status,
}: {
  status: CodexResetStatusResponse;
}) {
  useLiveClock(CODEX_RESET_POLL_MS);
  const model = buildCodexResetHeaderModel(status, {
    now: new Date(),
    timeZone: CODEX_RESET_DISPLAY_TIME_ZONE,
  });
  const styles = TONE_STYLES[model.tone];

  return (
    <div
      className="flex items-center gap-2"
      title={model.title}
      aria-label={model.title}
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium leading-none ${styles.badge}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
        {model.pillLabel}
      </span>
      {model.metaText && (
        <span className={`text-[11px] leading-none ${styles.meta}`}>
          {model.metaText}
        </span>
      )}
    </div>
  );
}

export function CodexResetHeaderStatus() {
  const [status, setStatus] = useState<CodexResetStatusResponse>(FALLBACK_STATUS);

  useEffect(() => {
    let cancelled = false;

    const runRefresh = async () => {
      const nextStatus = await loadCodexResetStatus();
      if (!cancelled) {
        setStatus(nextStatus);
      }
    };

    void runRefresh();
    const intervalId = scheduleCodexResetPolling(() => {
      void runRefresh();
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return <CodexResetHeaderStatusDisplay status={status} />;
}
