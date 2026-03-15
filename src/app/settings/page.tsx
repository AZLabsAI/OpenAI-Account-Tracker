"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type LogLevel = "info" | "success" | "warn" | "error";
type LogCategory = "system" | "quota" | "login" | "account" | "refresh-all";

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  accountId: string | null;
  accountEmail: string | null;
  detail: string | null;
  durationMs: number | null;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<LogLevel, { label: string; dot: string; bg: string; text: string; border: string }> = {
  info:    { label: "INFO",    dot: "bg-sky-400",     bg: "bg-sky-500/8",     text: "text-sky-400",     border: "border-sky-500/20"    },
  success: { label: "OK",      dot: "bg-emerald-400", bg: "bg-emerald-500/8", text: "text-emerald-400", border: "border-emerald-500/20" },
  warn:    { label: "WARN",    dot: "bg-amber-400",   bg: "bg-amber-500/8",   text: "text-amber-400",   border: "border-amber-500/20"  },
  error:   { label: "ERROR",   dot: "bg-red-400",     bg: "bg-red-500/8",     text: "text-red-400",     border: "border-red-500/20"    },
};

const CATEGORY_CONFIG: Record<LogCategory, { label: string; color: string }> = {
  system:        { label: "System",      color: "text-zinc-400" },
  quota:         { label: "Quota",       color: "text-sky-400"  },
  login:         { label: "Login",       color: "text-violet-400" },
  account:       { label: "Account",     color: "text-emerald-400" },
  "refresh-all": { label: "Refresh All", color: "text-amber-400" },
};

const ALL_LEVELS: LogLevel[] = ["info", "success", "warn", "error"];
const ALL_CATEGORIES: LogCategory[] = ["system", "quota", "login", "account", "refresh-all"];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [levelFilter, setLevelFilter] = useState<LogLevel | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | null>(null);
  const [search, setSearch] = useState("");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (levelFilter) params.set("level", levelFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", "500");

    try {
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? null);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [levelFilter, categoryFilter, search]);

  // Initial + filter change
  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 3s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs]);

  // ── Clear logs ─────────────────────────────────────────────────────────────
  const handleClear = async () => {
    await fetch("/api/logs", { method: "DELETE" });
    setConfirmClear(false);
    fetchLogs();
  };

  // ── Toggle detail expansion ────────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-200"
              title="Back to Dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </a>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
              <p className="text-xs text-zinc-500">System logs & diagnostics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                autoRefresh
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-zinc-800/60 text-zinc-500 border-zinc-700/50 hover:text-zinc-300"
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              {autoRefresh ? "Live" : "Paused"}
            </button>

            {/* Manual refresh */}
            <button
              onClick={fetchLogs}
              className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
              title="Refresh now"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Clear logs */}
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-zinc-700/50 hover:border-red-500/20 transition-colors"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-zinc-500 font-mono">{stats.total} total</span>
            <span className="text-zinc-700">|</span>
            {ALL_LEVELS.map((lvl) => (
              <span key={lvl} className="flex items-center gap-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${LEVEL_CONFIG[lvl].dot}`} />
                <span className={LEVEL_CONFIG[lvl].text}>{stats.byLevel[lvl] ?? 0}</span>
              </span>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Level pills */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-1">Level</span>
            {ALL_LEVELS.map((lvl) => {
              const active = levelFilter === lvl;
              const cfg = LEVEL_CONFIG[lvl];
              return (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(active ? null : lvl)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                    active
                      ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                      : "bg-zinc-800/40 text-zinc-500 border-zinc-700/40 hover:text-zinc-300"
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <span className="text-zinc-700">·</span>

          {/* Category pills */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-1">Cat</span>
            {ALL_CATEGORIES.map((cat) => {
              const active = categoryFilter === cat;
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(active ? null : cat)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                    active
                      ? `bg-zinc-100 text-zinc-900 border-zinc-300`
                      : "bg-zinc-800/40 text-zinc-500 border-zinc-700/40 hover:text-zinc-300"
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <span className="text-zinc-700">·</span>

          {/* Search */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600 pointer-events-none">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs…"
              className="w-48 rounded-md bg-zinc-800/40 border border-zinc-700/40 pl-7 pr-3 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </div>

          {/* Active filter clear */}
          {(levelFilter || categoryFilter || search) && (
            <button
              onClick={() => { setLevelFilter(null); setCategoryFilter(null); setSearch(""); }}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear all ×
            </button>
          )}
        </div>

        {/* Log table */}
        <div
          ref={scrollRef}
          className="rounded-xl border border-zinc-800/60 bg-zinc-950/50 overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-10 w-10 text-zinc-700 mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p className="text-sm text-zinc-500">No logs yet</p>
              <p className="text-xs text-zinc-600 mt-1">Logs will appear when you refresh quota, sign in, or manage accounts</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {logs.map((entry) => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedIds.has(entry.id)}
                  onToggle={() => toggleExpand(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-zinc-100 mb-1">Clear all logs?</h3>
            <p className="text-sm text-zinc-400 mb-5">
              {stats?.total ?? 0} log entries will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual Log Row ──────────────────────────────────────────────────────

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lvl = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.info;
  const cat = CATEGORY_CONFIG[entry.category as LogCategory] ?? CATEGORY_CONFIG.system;

  const ts = new Date(entry.timestamp);
  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const hasDetail = Boolean(entry.detail);

  // Try to pretty-format detail
  let detailContent = entry.detail ?? "";
  try {
    const parsed = JSON.parse(detailContent);
    detailContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Already a string, keep as-is
  }

  return (
    <div className={`group ${lvl.bg} transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-start gap-3"
      >
        {/* Timestamp column */}
        <div className="shrink-0 w-28 font-mono text-[11px] text-zinc-500 pt-0.5">
          <span className="text-zinc-600">{dateStr}</span>{" "}
          <span>{timeStr}</span>
        </div>

        {/* Level badge */}
        <span className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider border ${lvl.bg} ${lvl.text} ${lvl.border}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${lvl.dot}`} />
          {lvl.label}
        </span>

        {/* Category */}
        <span className={`shrink-0 text-[11px] font-medium w-20 ${cat.color}`}>
          {cat.label}
        </span>

        {/* Message */}
        <span className="flex-1 text-[12px] text-zinc-300 leading-relaxed">
          {entry.message}
        </span>

        {/* Account email tag */}
        {entry.accountEmail && (
          <span className="shrink-0 text-[10px] font-mono text-zinc-600 bg-zinc-800/80 rounded px-1.5 py-0.5">
            {entry.accountEmail}
          </span>
        )}

        {/* Duration */}
        {entry.durationMs != null && (
          <span className="shrink-0 text-[10px] font-mono text-zinc-600">
            {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Expand icon */}
        {hasDetail && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`shrink-0 h-3 w-3 text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="px-4 pb-3 pt-0 ml-32">
          <pre className="text-[11px] font-mono text-zinc-500 bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
            {detailContent}
          </pre>
        </div>
      )}
    </div>
  );
}
