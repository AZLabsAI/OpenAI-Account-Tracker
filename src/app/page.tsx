"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from "react";
import { getSortedAccounts } from "@/data/accounts";
import { Account, CodexAgent, ChatGPTAgent, AccountType, CODEX_AGENTS, CHATGPT_AGENTS } from "@/types";
import { AccountCard, AddAccountCard, NotificationBell } from "@/components";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAccountRefreshController } from "@/hooks/useAccountRefreshController";
import { buildWebNotificationPayload, NotificationPreview } from "@/lib/notification-presentation";
import { getQuotaStatus } from "@/lib/account-health";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLiveClock } from "@/hooks/useLiveClock";
import { useToast } from "@/components/Toast";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { CodexResetHeaderStatus } from "@/components/CodexResetHeaderStatus";

async function persist(id: string, patch: Partial<Account>) {
  await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    keepalive: true,
  });
}

type Filter = "all" | "in-use" | "not-in-use" | "starred" | "pinned" | "has-quota" | "no-quota";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "in-use",    label: "In Use" },
  { key: "not-in-use", label: "Not In Use" },
  { key: "starred",   label: "Starred" },
  { key: "pinned",    label: "Pinned" },
  { key: "has-quota", label: "Has Quota" },
  { key: "no-quota",  label: "No Quota" },
];

/** Keep in sync with `package.json` version */
const APP_VERSION = "0.0.3-beta";

const SPIN_DECAY_MS = 7000;
const SPIN_LEVEL_MAX = 10;
const SPIN_DURATION_BASE_S = 8;
const SPIN_DURATION_PEAK_S = 1.5;
const SPIN_DURATION_COEFF = 0.18;
const SPIN_DURATION_MIN_S = 0.08;
const ACTIVE_CODEX_POLL_MS = 30_000;
const IN_USE_NOTICE_MS = 2500;

function computeFilterCounts(
  accs: Account[],
  hasUsable: (a: Account) => boolean,
): Record<Filter, number> {
  return {
    all: accs.length,
    "in-use": accs.filter((a) => a.inUse).length,
    "not-in-use": accs.filter((a) => !a.inUse).length,
    starred: accs.filter((a) => a.starred).length,
    pinned: accs.filter((a) => a.pinned).length,
    "has-quota": accs.filter(hasUsable).length,
    "no-quota": accs.filter((a) => a.quotaData && !hasUsable(a)).length,
  };
}

function hasUsableQuota(account: Account) {
  if (!account.quotaData) return false;
  return getQuotaStatus(account) !== "waiting-refresh";
}

function dedupeLabels<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed as T);
  }

  return result;
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [spinLevel, setSpinLevel] = useState(0);
  const [inUseAutoRefreshNotice, setInUseAutoRefreshNotice] = useState<Record<string, boolean>>({});
  const [codexAgentOptions, setCodexAgentOptions] = useState<CodexAgent[]>(CODEX_AGENTS);
  const [chatgptAgentOptions, setChatgptAgentOptions] = useState<ChatGPTAgent[]>(CHATGPT_AGENTS);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useDocumentTitle(accounts);
  useLiveClock();
  const { toast } = useToast();

  // Spin decay — level drops by 1 periodically when not clicking
  useEffect(() => {
    if (spinLevel === 0) return;
    const timer = setTimeout(() => setSpinLevel((l) => Math.max(l - 1, 0)), SPIN_DECAY_MS);
    return () => clearTimeout(timer);
  }, [spinLevel]);

  // ── Web Notifications: request permission on mount ─────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /** Fire a browser Web Notification for a notification event */
  const fireWebNotification = useCallback((event: NotificationPreview) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const payload = buildWebNotificationPayload(event);
    const n = new Notification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      tag: payload.tag,
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
        body: JSON.stringify({ id: event.id, deliveredChannel: "web" }),
      }).catch(() => {});
    }
  }, []);

  // ── Client-side log helper ──────────────────────────────────────────────────
  const emitLog = useCallback((level: string, category: string, message: string, extra?: Record<string, unknown>) => {
    fetch("/api/logs/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, category, message, ...extra }),
    }).catch(() => {});
  }, []);

  const {
    loginStates,
    loginErrors,
    quotaStates,
    quotaErrors,
    refreshingAll,
    refreshProgress,
    refreshAll,
    signInAccount,
    refreshAccount,
  } = useAccountRefreshController({
    accounts,
    setAccounts,
    emitLog,
    fireWebNotification,
  });

  // ── Poll active Codex session for notifications / diagnostics only ─────────
  // Do NOT sync this into the manual `inUse` flag; users can mark multiple
  // accounts as in use independently of the live Codex session.
  const syncActiveCodex = useCallback(async () => {
    try {
      await fetch("/api/accounts/active-codex");
    } catch { /* silent — detection is best-effort */ }
  }, []);

  // Load from SQLite on mount, then immediately sync active Codex account
  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json() as Promise<Account[]>),
      fetch("/api/agent-options")
        .then((r) => r.ok ? r.json() as Promise<{ codexOptions: CodexAgent[]; chatgptOptions: ChatGPTAgent[] }> : null)
        .catch(() => null),
    ]).then(([accountData, agentOptions]) => {
      setAccounts(accountData);
      if (agentOptions) {
        setCodexAgentOptions(dedupeLabels(agentOptions.codexOptions));
        setChatgptAgentOptions(dedupeLabels(agentOptions.chatgptOptions));
      }
      setLoading(false);
      // Poll active Codex for notifications / diagnostics only
      syncActiveCodex();
    });
  }, [syncActiveCodex]);

  // Poll ~/.codex/auth.json periodically to detect account switches
  useEffect(() => {
    const interval = setInterval(() => syncActiveCodex(), ACTIVE_CODEX_POLL_MS);
    return () => clearInterval(interval);
  }, [syncActiveCodex]);

  // ── Derived: sorted → filtered → searched ─────────────────────────────────
  const sorted = getSortedAccounts(accounts);

  const availableCodexAgents = useMemo(
    () => dedupeLabels([...codexAgentOptions, ...accounts.flatMap((account) => account.codexAssignedTo ?? [])]),
    [accounts, codexAgentOptions],
  );

  const availableChatGPTAgents = useMemo(
    () => dedupeLabels([...chatgptAgentOptions, ...accounts.flatMap((account) => account.chatgptAssignedTo ?? [])]),
    [accounts, chatgptAgentOptions],
  );

  const filtered = useMemo(() => {
    let result = sorted;

    // Filter
    if (filter === "in-use")    result = result.filter((a) => a.inUse);
    if (filter === "not-in-use") result = result.filter((a) => !a.inUse);
    if (filter === "starred")   result = result.filter((a) => a.starred);
    if (filter === "pinned")    result = result.filter((a) => a.pinned);
    if (filter === "has-quota") result = result.filter(hasUsableQuota);
    if (filter === "no-quota")  result = result.filter((a) => a.quotaData && !hasUsableQuota(a));

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
    const account = accounts.find((a) => a.id === id);
    const nextInUse = account ? !account.inUse : false;

    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const updated = {
          ...a,
          inUse: nextInUse,
          refreshIntervalMins: nextInUse ? 5 : null,
        };
        persist(id, {
          inUse: updated.inUse,
          refreshIntervalMins: updated.refreshIntervalMins,
        });
        return updated;
      }),
    );

    if (nextInUse) {
      setInUseAutoRefreshNotice((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setInUseAutoRefreshNotice((prev) => ({ ...prev, [id]: false }));
      }, IN_USE_NOTICE_MS);
    }
  }, [accounts]);

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
    setExitingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      fetch(`/api/accounts/${id}`, { method: "DELETE" }).then(() => {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        setExitingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        toast("Account deleted", "success");
      });
    }, 250);
  }, [toast]);

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

  const saveAgentOptions = useCallback(async (patch: { codexOptions?: CodexAgent[]; chatgptOptions?: ChatGPTAgent[] }) => {
    await fetch("/api/agent-options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  const updateCodexAgentOptions = useCallback((agents: CodexAgent[]) => {
    const next = dedupeLabels(agents);
    setCodexAgentOptions(next);
    void saveAgentOptions({ codexOptions: next });
  }, [saveAgentOptions]);

  const updateChatGPTAgentOptions = useCallback((agents: ChatGPTAgent[]) => {
    const next = dedupeLabels(agents);
    setChatgptAgentOptions(next);
    void saveAgentOptions({ chatgptOptions: next });
  }, [saveAgentOptions]);

  const handleDragStart = useCallback((id: string) => setDraggedId(id), []);
  const handleDragOver = useCallback((id: string) => setDragOverId(id), []);

  const handleDrop = useCallback((targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    setAccounts((prev) => {
      const pinned = prev.filter((a) => a.pinned);
      const dragItem = pinned.find((a) => a.id === draggedId);
      const targetItem = pinned.find((a) => a.id === targetId);
      if (!dragItem || !targetItem) return prev;

      const sortedPinned = [...pinned].sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
      const fromIdx = sortedPinned.findIndex((a) => a.id === draggedId);
      const toIdx = sortedPinned.findIndex((a) => a.id === targetId);
      sortedPinned.splice(fromIdx, 1);
      sortedPinned.splice(toIdx, 0, dragItem);

      const updates = new Map<string, number>();
      sortedPinned.forEach((a, i) => updates.set(a.id, i + 1));

      const next = prev.map((a) => {
        const newOrder = updates.get(a.id);
        if (newOrder !== undefined && newOrder !== a.pinOrder) {
          persist(a.id, { pinOrder: newOrder });
          return { ...a, pinOrder: newOrder };
        }
        return a;
      });
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  // Count signed-in accounts for the Refresh All button
  const signedInCount = accounts.filter((a) => a.codexHomePath).length;

  const filterCounts = useMemo(
    () => computeFilterCounts(accounts, hasUsableQuota),
    [accounts],
  );

  const spinDurationS =
    spinLevel === 0
      ? SPIN_DURATION_BASE_S
      : Math.max(SPIN_DURATION_PEAK_S - spinLevel * SPIN_DURATION_COEFF, SPIN_DURATION_MIN_S);

  return (
    <div className="min-h-screen bg-white dark:bg-transparent text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSpinLevel((l) => Math.min(l + 1, SPIN_LEVEL_MAX))}
              className="logo-easter-egg-spin flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-900 cursor-pointer hover:shadow-lg hover:shadow-white/10 transition-shadow"
              title="Spin logo (easter egg)"
              style={{ "--logo-spin-duration": `${spinDurationS}s` } as CSSProperties}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
                  fill="currentColor"
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

            <CodexResetHeaderStatus />

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
          <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/40 p-6 animate-pulse motion-reduce:animate-none"
              >
                <div className="flex gap-3 mb-4">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2 pt-1 min-w-0">
                    <div className="h-4 w-3/4 max-w-[200px] rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-1/2 max-w-[140px] rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 max-w-[90%] rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
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
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search accounts…"
                      className="w-56 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 pl-8 pr-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:bg-zinc-50 dark:focus:bg-zinc-800 transition-colors"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                        aria-label="Clear search"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter pills */}
                <div
                  className="flex items-center gap-1.5 flex-wrap"
                  role="toolbar"
                  aria-label="Filter accounts"
                >
                  {FILTERS.map(({ key, label }) => {
                    const active = filter === key;
                    const count = filterCounts[key];

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(active ? "all" : key)}
                        aria-pressed={active}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {label}
                        {key !== "all" && count > 0 && (
                          <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-semibold leading-none ${
                            active
                              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                          }`}>
                            {count}
                          </span>
                        )}
                        {key === "all" && (
                          <span className={`ml-1.5 ${active ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-500"}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filtered.length === 0 && (search.trim() || filter !== "all") ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-16 text-center flex flex-col items-center gap-4">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-300 dark:text-zinc-700">
                    <rect x="8" y="14" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 22h48" stroke="currentColor" strokeWidth="2" />
                    <circle cx="14" cy="18" r="1.5" fill="currentColor" />
                    <circle cx="19" cy="18" r="1.5" fill="currentColor" />
                    <circle cx="24" cy="18" r="1.5" fill="currentColor" />
                    <path d="M24 32h16M28 38h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-zinc-500 text-sm">
                    {search.trim() && filter !== "all"
                      ? "No accounts match your filters and search."
                      : search.trim()
                        ? "No accounts match your search."
                        : "No accounts match this filter."}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setFilter("all"); }}
                    className="mt-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((account) => (
                    <div
                      key={account.id}
                      className={`transition-all duration-250 ${exitingIds.has(account.id) ? "animate-card-exit" : "animate-card-enter"} ${
                        account.pinned && draggedId ? "cursor-grab" : ""
                      } ${dragOverId === account.id && draggedId !== account.id ? "ring-2 ring-zinc-400 dark:ring-zinc-500 rounded-2xl" : ""}`}
                      draggable={account.pinned}
                      onDragStart={() => handleDragStart(account.id)}
                      onDragOver={(e) => { e.preventDefault(); handleDragOver(account.id); }}
                      onDrop={() => handleDrop(account.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <AccountCard
                        account={account}
                        onToggleStar={toggleStar}
                        onToggleInUse={toggleInUse}
                        onTogglePin={togglePin}
                        onDelete={deleteAccount}
                        onAssignCodex={assignCodexAgent}
                        onAssignChatGPT={assignChatGPTAgent}
                        onSetAccountType={setAccountType}
                        onSignIn={signInAccount}
                        onRefreshQuota={refreshAccount}
                        loginState={loginStates[account.id] ?? "idle"}
                        loginError={loginErrors[account.id] ?? null}
                        quotaState={quotaStates[account.id] ?? "idle"}
                        quotaError={quotaErrors[account.id] ?? null}
                        onUpdateSettings={updateSettings}
                        availableCodexAgents={availableCodexAgents}
                        availableChatGPTAgents={availableChatGPTAgents}
                        onUpdateCodexAgentOptions={updateCodexAgentOptions}
                        onUpdateChatGPTAgentOptions={updateChatGPTAgentOptions}
                        showInUseAutoRefreshNotice={Boolean(inUseAutoRefreshNotice[account.id])}
                      />
                    </div>
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
          <span>v{APP_VERSION}</span>
          <span className="flex items-center gap-3">
            <a
              href="https://github.com/AZLabsAI/OpenAI-Account-Tracker"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
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
          </span>
        </div>
      </footer>
      <CommandPalette
        accounts={accounts}
        onRefresh={refreshAccount}
        onToggleStar={toggleStar}
        onTogglePin={togglePin}
      />
      <KeyboardShortcuts
        onFocusSearch={() => searchInputRef.current?.focus()}
        onRefreshAll={() => { if (signedInCount > 0) refreshAll(); }}
      />
    </div>
  );
}
