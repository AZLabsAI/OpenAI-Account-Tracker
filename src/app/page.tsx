"use client";

import { useState } from "react";
import { accounts as initialAccounts, getSortedAccounts } from "@/data/accounts";
import { Account, CodexAgent, ChatGPTAgent } from "@/types";
import { AccountCard, DashboardStats } from "@/components";

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const sorted = getSortedAccounts(accounts);

  function toggleStar(id: string) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, starred: !a.starred } : a)),
    );
  }

  function toggleInUse(id: string) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, inUse: !a.inUse } : a)),
    );
  }

  function assignCodexAgent(id: string, agent: CodexAgent | undefined) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, codexAssignedTo: agent } : a)),
    );
  }

  function assignChatGPTAgent(id: string, agent: ChatGPTAgent | undefined) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, chatgptAssignedTo: agent } : a)),
    );
  }

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

          <span className="text-xs text-zinc-600 font-mono">
            {accounts.length} account{accounts.length !== 1 && "s"}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-10">
        <DashboardStats accounts={accounts} />

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-zinc-100">Accounts</h2>
            <p className="text-xs text-zinc-600">
              Click ☆ to star · Click &ldquo;Mark In Use&rdquo; for active sessions
            </p>
          </div>

          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center">
              <p className="text-zinc-500">
                No accounts yet. Add your first account in{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-300">
                  src/data/accounts.ts
                </code>
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onToggleStar={toggleStar}
                  onToggleInUse={toggleInUse}
                  onAssignCodex={assignCodexAgent}
                  onAssignChatGPT={assignChatGPTAgent}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-zinc-800/60 pt-8 pb-12 text-center text-xs text-zinc-600">
          <p>
            To add accounts, edit{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-400">
              src/data/accounts.ts
            </code>{" "}
            · Quota checking automation coming soon
          </p>
        </footer>
      </main>
    </div>
  );
}
