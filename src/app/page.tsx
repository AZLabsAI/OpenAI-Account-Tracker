"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getSortedAccounts } from "@/data/accounts";
import { Account, CodexAgent, ChatGPTAgent, AccountType, QuotaData } from "@/types";
import { AccountCard, DashboardStats, AddAccountCard, NotificationBell } from "@/components";
import { ThemeToggle } from "@/components/ThemeToggle";

async function persist(id: string, patch: Partial<Account>) {
  await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

type Filter = "all" | "in-use" | "starred" | "pinned" | "has-quota" | "no-quota";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "in-use",    label: "In Use" },
  { key: "starred",   label: "Starred" },
  { key: "pinned",    label: "Pinned" },
  { key: "has-quota", label: "Has Quota" },
  { key: "no-quota",  label: "No Quota" },
];

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [spinLevel, setSpinLevel] = useState(0);

  // Spin decay — level drops by 1 every 2s when not clicking
  useEffect(() => {
    if (spinLevel === 0) return;
    const timer = setTimeout(() => setSpinLevel((l) => Math.max(l - 1, 0)), 2000);
    return () => clearTimeout(timer);
  }, [spinLevel]);

  // ── Web Notifications: request permission on mount ─────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /** Fire a browser Web Notification for a notification event */
  const fireWebNotification = useCallback((event: { eventType: string; message: string; id?: number }) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const iconMap: Record<string, string> = {
      quota_exhausted: "⛔",
      quota_critical: "🔴",
      quota_warning: "⚠️",
      quota_reset: "✅",
      account_switch: "🔄",
    };
    const emoji = iconMap[event.eventType] ?? "🔔";

    const n = new Notification(`${emoji} OpenAI Account Tracker`, {
      body: event.message,
      icon: "/favicon.ico",
      tag: `oat-${event.eventType}-${event.id ?? Date.now()}`,
      silent: false,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };

    // Mark as delivered via web
    if (event.id) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      }).catch(() => {});
    }
  }, []);

  // ── Sync inUse flags with whichever account is logged into ~/.codex ────────
  const syncActiveCodex = useCallback(async (currentAccounts?: Account[]) => {
    try {
      const res = await fetch("/api/accounts/active-codex");
      if (!res.ok) return;
      const data = await res.json() as {
        activeEmail: string | null;
        matchedAccountId: string | null;
      };
      if (!data.activeEmail) return;

      // Update local state to reflect whichever account is active
      setAccounts((prev) => {
        const base = currentAccounts ?? prev;
        let changed = false;
        const next = base.map((a) => {
          const shouldBeInUse = a.id === data.matchedAccountId;
          if (a.inUse !== shouldBeInUse) {
            changed = true;
            return { ...a, inUse: shouldBeInUse };
          }
          return a;
        });
        return changed ? next : base;
      });
    } catch { /* silent — detection is best-effort */ }
  }, []);

  // Load from SQLite on mount, then immediately sync active Codex account
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        setLoading(false);
        // Sync active account right after initial load
        syncActiveCodex(data);
      });
  }, [syncActiveCodex]);

  // Poll ~/.codex/auth.json every 30s to detect account switches
  useEffect(() => {
    const interval = setInterval(() => syncActiveCodex(), 30_000);
    return () => clearInterval(interval);
  }, [syncActiveCodex]);

  // ── Derived: sorted → filtered → searched ─────────────────────────────────
  const sorted = getSortedAccounts(accounts);

  const filtered = useMemo(() => {
    let result = sorted;

    // Filter
    if (filter === "in-use")    result = result.filter((a) => a.inUse);
    if (filter === "starred")   result = result.filter((a) => a.starred);
    if (filter === "pinned")    result = result.filter((a) => a.pinned);
    if (filter === "has-quota") result = result.filter((a) => a.quotaData);
    if (filter === "no-quota")  result = result.filter((a) => !a.quotaData);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.accountType ?? "").toLowerCase().includes(q) ||
          a.subscription.toLowerCase().includes(q),
      );
    }

    return result;
  }, [sorted, filter, search]);

  // ── Client-side log helper ──────────────────────────────────────────────────
  const emitLog = useCallback((level: string, category: string, message: string, extra?: Record<string, unknown>) => {
    fetch("/api/logs/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, category, message, ...extra }),
    }).catch(() => {});
  }, []);

  // ── Refresh All ────────────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    const eligible = accounts.filter((a) => a.codexHomePath);
    if (eligible.length === 0) return;

    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: eligible.length });

    emitLog("info", "refresh-all", `Refresh All started — ${eligible.length} account(s)`, {
      detail: { accountIds: eligible.map((a) => a.id), emails: eligible.map((a) => a.email) },
    });

    const t0 = Date.now();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < eligible.length; i++) {
      const acc = eligible[i];
      try {
        const res = await fetch(`/api/accounts/${acc.id}/quota`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const data = await res.json() as QuotaData & { notifications?: Array<{ id: number; eventType: string; message: string }> };
          const { notifications: newNotifs, ...quotaData } = data;
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === acc.id
                ? { ...a, quotaData, lastChecked: new Date().toISOString() }
                : a,
            ),
          );
          // Fire Web Notifications
          if (newNotifs) {
            for (const n of newNotifs) fireWebNotification(n);
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      setRefreshProgress({ done: i + 1, total: eligible.length });
    }

    const durationMs = Date.now() - t0;

    if (failCount === 0) {
      emitLog("success", "refresh-all", `Refresh All completed — ${successCount}/${eligible.length} succeeded in ${(durationMs / 1000).toFixed(1)}s`, { durationMs });
    } else {
      emitLog("warn", "refresh-all", `Refresh All finished — ${successCount} succeeded, ${failCount} failed out of ${eligible.length} in ${(durationMs / 1000).toFixed(1)}s`, { durationMs });
    }

    setRefreshingAll(false);
    setRefreshProgress(null);
  }, [accounts, emitLog, fireWebNotification]);

  // ── Account mutations ─────────────────────────────────────────────────────

  const toggleStar = useCallback((id: string) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, starred: !a.starred };
        persist(id, { starred: updated.starred });
        return updated;
      }),
    );
  }, []);

  const toggleInUse = useCallback((id: string) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, inUse: !a.inUse };
        persist(id, { inUse: updated.inUse });
        return updated;
      }),
    );
  }, []);

  const togglePin = useCallback((id: string) => {
    setAccounts((prev) => {
      const account = prev.find((a) => a.id === id);
      if (!account) return prev;

      const isPinning = !account.pinned;
      let nextOrder = 0;

      if (isPinning) {
        const maxPinOrder = prev
          .filter((a) => a.pinned)
          .reduce((max, a) => Math.max(max, a.pinOrder ?? 0), 0);
        nextOrder = maxPinOrder + 1;
      }

      return prev.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, pinned: isPinning, pinOrder: isPinning ? nextOrder : 0 };
        persist(id, { pinned: updated.pinned, pinOrder: updated.pinOrder });
        return updated;
      });
    });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    fetch(`/api/accounts/${id}`, { method: "DELETE" }).then(() => {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    });
  }, []);

  const assignCodexAgent = useCallback((id: string, agents: CodexAgent[]) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        persist(id, { codexAssignedTo: agents });
        return { ...a, codexAssignedTo: agents };
      }),
    );
  }, []);

  const assignChatGPTAgent = useCallback((id: string, agents: ChatGPTAgent[]) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        persist(id, { chatgptAssignedTo: agents });
        return { ...a, chatgptAssignedTo: agents };
      }),
    );
  }, []);

  const setAccountType = useCallback((id: string, type: AccountType | undefined) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        persist(id, { accountType: type });
        return { ...a, accountType: type };
      }),
    );
  }, []);

  const updateQuota = useCallback((id: string, quotaData: QuotaData, codexHomePath?: string) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        return {
          ...a,
          quotaData,
          lastChecked: new Date().toISOString(),
          ...(codexHomePath ? { codexHomePath } : {}),
        };
      }),
    );
  }, []);

  const addAccount = useCallback((account: Account) => {
    setAccounts((prev) => [...prev, account]);
  }, []);

  const updateSettings = useCallback((id: string, patch: Partial<Account>) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        persist(id, patch);
        return { ...a, ...patch };
      }),
    );
  }, []);

  // ── Auto-refresh timer ────────────────────────────────────────────────────
  // Runs a single 30s interval that checks all accounts with a refreshIntervalMins
  // and fires a quota refresh when enough time has elapsed since their last fetch.
  const autoRefreshingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const acc of accounts) {
        if (!acc.refreshIntervalMins || !acc.codexHomePath) continue;
        if (autoRefreshingRef.current.has(acc.id)) continue; // already in-flight

        const fetchedAt = acc.quotaData?.fetchedAt ? new Date(acc.quotaData.fetchedAt).getTime() : 0;
        const elapsed = (now - fetchedAt) / 60_000; // minutes

        if (elapsed >= acc.refreshIntervalMins) {
          autoRefreshingRef.current.add(acc.id);
          fetch(`/api/accounts/${acc.id}/quota`, { method: "POST", signal: AbortSignal.timeout(30_000) })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json() as QuotaData & { notifications?: Array<{ id: number; eventType: string; message: string }> };
                const { notifications: newNotifs, ...quotaData } = data;
                setAccounts((prev) =>
                  prev.map((a) =>
                    a.id === acc.id
                      ? { ...a, quotaData, lastChecked: new Date().toISOString() }
                      : a,
                  ),
                );
                // Fire Web Notifications from auto-refresh
                if (newNotifs) {
                  for (const n of newNotifs) fireWebNotification(n);
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              autoRefreshingRef.current.delete(acc.id);
            });
        }
      }
    }, 30_000); // check every 30 seconds

    return () => clearInterval(interval);
  }, [accounts, fireWebNotification]);

  // Count signed-in accounts for the Refresh All button
  const signedInCount = accounts.filter((a) => a.codexHomePath).length;

  return (
    <div className="min-h-screen bg-white dark:bg-transparent text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSpinLevel((l) => Math.min(l + 1, 7))}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white cursor-pointer hover:shadow-lg hover:shadow-white/10 transition-shadow"
              title="🥚"
              style={{
                animation: `spin ${spinLevel === 0 ? 8 : Math.max(2 - spinLevel * 0.25, 0.15)}s linear infinite`,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
                  fill="#000"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Account Tracker
              </h1>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                OpenAI subscription management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Refresh All */}
            {signedInCount > 0 && (
              <button
                onClick={refreshAll}
                disabled={refreshingAll}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshingAll ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-sky-800 border-t-sky-400" />
                    {refreshProgress
                      ? `${refreshProgress.done}/${refreshProgress.total}`
                      : "Refreshing…"
                    }
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
                    </svg>
                    Refresh All
                  </>
                )}
              </button>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Notification bell */}
            <NotificationBell />

            {/* Settings link */}
            <a
              href="/settings"
              className="rounded-lg p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
              title="Settings & Logs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </a>

            <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
              {accounts.length} account{accounts.length !== 1 && "s"}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-10">

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-600 dark:border-t-zinc-400" />
          </div>
        ) : (
          <>
            <DashboardStats accounts={accounts} />

            <section>
              {/* Search + Filter bar */}
              <div className="mb-6 space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Accounts</h2>
                  <div className="flex-1" />
                  {/* Search input */}
                  <div className="relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none"
                    >
                      <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search accounts…"
                      className="w-56 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 pl-8 pr-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:bg-zinc-50 dark:focus:bg-zinc-800 transition-colors"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {FILTERS.map(({ key, label }) => {
                    const active = filter === key;
                    // Count for each filter
                    let count = accounts.length;
                    if (key === "in-use")    count = accounts.filter((a) => a.inUse).length;
                    if (key === "starred")   count = accounts.filter((a) => a.starred).length;
                    if (key === "pinned")    count = accounts.filter((a) => a.pinned).length;
                    if (key === "has-quota") count = accounts.filter((a) => a.quotaData).length;
                    if (key === "no-quota")  count = accounts.filter((a) => !a.quotaData).length;

                    return (
                      <button
                        key={key}
                        onClick={() => setFilter(active ? "all" : key)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-zinc-100 text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {label}
                        <span className={`ml-1.5 ${active ? "text-zinc-500" : "text-zinc-600"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {filtered.length === 0 && (search || filter !== "all") ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-16 text-center">
                  <p className="text-zinc-500 text-sm">No accounts match your search.</p>
                  <button
                    onClick={() => { setSearch(""); setFilter("all"); }}
                    className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      onToggleStar={toggleStar}
                      onToggleInUse={toggleInUse}
                      onTogglePin={togglePin}
                      onDelete={deleteAccount}
                      onAssignCodex={assignCodexAgent}
                      onAssignChatGPT={assignChatGPTAgent}
                      onSetAccountType={setAccountType}
                      onQuotaUpdated={updateQuota}
                      onUpdateSettings={updateSettings}
                    />
                  ))}
                  <AddAccountCard onAdded={addAccount} />
                </div>
              )}
            </section>

            <footer className="border-t border-zinc-800/60 pt-8 pb-12 text-center text-xs text-zinc-600">
              <p>Click &ldquo;Sign In&rdquo; on any card to connect live quota tracking via Codex OAuth</p>
            </footer>
          </>
        )}
      </main>

      {/* Site footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800/40 py-4 mt-8">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-600">
          <span>v0.0.1 Beta</span>
          <span>
            Created by{" "}
            <a
              href="https://azlabs.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              AZ Labs
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
