"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getSortedAccounts } from "@/data/accounts";
import { Account, CodexAgent, ChatGPTAgent, AccountType, QuotaData } from "@/types";
import { AccountCard, DashboardStats, AddAccountCard } from "@/components";

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

  // Load from SQLite on mount
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        setLoading(false);
      });
  }, []);

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

  // ── Refresh All ────────────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    const eligible = accounts.filter((a) => a.codexHomePath);
    if (eligible.length === 0) return;

    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: eligible.length });

    for (let i = 0; i < eligible.length; i++) {
      const acc = eligible[i];
      try {
        const res = await fetch(`/api/accounts/${acc.id}/quota`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const quotaData: QuotaData = await res.json();
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === acc.id
                ? { ...a, quotaData, lastChecked: new Date().toISOString() }
                : a,
            ),
          );
        }
      } catch {
        // Skip failed ones
      }
      setRefreshProgress({ done: i + 1, total: eligible.length });
    }

    setRefreshingAll(false);
    setRefreshProgress(null);
  }, [accounts]);

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

  // Count signed-in accounts for the Refresh All button
  const signedInCount = accounts.filter((a) => a.codexHomePath).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
                  fill="#000"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                Account Tracker
              </h1>
              <p className="text-xs text-zinc-500">
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

            <span className="text-xs text-zinc-600 font-mono">
              {accounts.length} account{accounts.length !== 1 && "s"}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-10">

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          </div>
        ) : (
          <>
            <DashboardStats accounts={accounts} />

            <section>
              {/* Search + Filter bar */}
              <div className="mb-6 space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-zinc-100">Accounts</h2>
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
                      className="w-56 rounded-lg bg-zinc-800/50 border border-zinc-700/50 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
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
                            : "bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
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
                <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center">
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
    </div>
  );
}
