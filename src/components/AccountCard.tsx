"use client";

import { useState } from "react";
import { Account, CODEX_AGENTS, CHATGPT_AGENTS, CodexAgent, ChatGPTAgent, ACCOUNT_TYPES, AccountType } from "@/types";
import {
  getAccountStatus,
  formatDate,
  daysUntilExpiration,
} from "@/data/accounts";
import { StatusBadge } from "./StatusBadge";
import { UsageBar } from "./UsageBar";

interface Props {
  account: Account;
  onToggleStar: (id: string) => void;
  onToggleInUse: (id: string) => void;
  onAssignCodex: (id: string, agents: CodexAgent[]) => void;
  onAssignChatGPT: (id: string, agents: ChatGPTAgent[]) => void;
  onSetAccountType: (id: string, type: AccountType | undefined) => void;
}

export function AccountCard({ account, onToggleStar, onToggleInUse, onAssignCodex, onAssignChatGPT, onSetAccountType }: Props) {
  const [copied, setCopied] = useState(false);
  const status = getAccountStatus(account);
  const daysLeft = daysUntilExpiration(account.expirationDate);
  const initials = account.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isStarred = account.starred;
  const isInUse = account.inUse;

  return (
    <div
      className={`group relative rounded-2xl border p-6 transition-all duration-200 backdrop-blur-sm overflow-hidden ${
        isStarred
          ? "border-amber-500/25 bg-zinc-900/70 hover:border-amber-500/40"
          : isInUse
            ? "border-blue-500/25 bg-zinc-900/70 hover:border-blue-500/40"
            : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
      }`}
    >
      {/* Left accent strip for starred */}
      {isStarred && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 to-amber-600" />
      )}
      {/* Left accent strip for in-use (if not starred) */}
      {isInUse && !isStarred && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-blue-400 to-blue-600" />
      )}

      {/* Top row: avatar + name + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
              isStarred
                ? "bg-gradient-to-br from-amber-400 to-orange-500"
                : isInUse
                  ? "bg-gradient-to-br from-blue-400 to-blue-600"
                  : "bg-gradient-to-br from-emerald-500 to-teal-600"
            }`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-zinc-100 truncate leading-tight">
              {account.name}
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(account.email);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 truncate mt-0.5 transition-colors group/email"
              title="Click to copy email"
            >
              <span className="truncate">{account.email}</span>
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-emerald-400">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 opacity-0 group-hover/email:opacity-100 transition-opacity">
                  <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V8.621a3 3 0 0 0-.879-2.121L9 4.379A3 3 0 0 0 6.879 3.5H5.5Z" />
                  <path d="M4 5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 14h5a1.5 1.5 0 0 0 1.5-1.5V8.621a1.5 1.5 0 0 0-.44-1.06L7.94 5.439A1.5 1.5 0 0 0 6.878 5H4Z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Right side: star + status */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Star toggle */}
          <button
            onClick={() => onToggleStar(account.id)}
            className={`rounded-md p-1 transition-colors ${
              isStarred
                ? "text-amber-400 hover:text-amber-300"
                : "text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100"
            }`}
            title={isStarred ? "Unstar account" : "Star account"}
          >
            {isStarred ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
            )}
          </button>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-zinc-800/80" />

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
        <div>
          <span className="text-zinc-500 text-xs">Subscription</span>
          <p className="font-medium text-zinc-200 text-[13px]">
            {account.subscription}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 text-xs">Expires</span>
          <p className="font-medium text-zinc-200 text-[13px]">
            {formatDate(account.expirationDate)}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 text-xs">Days Remaining</span>
          <p className="font-mono font-semibold text-zinc-200 text-[13px]">
            {daysLeft > 0 ? daysLeft : 0}
          </p>
        </div>
        <div className="space-y-2.5">
          {/* Codex O-Auth – multi */}
          <div>
            <span className="text-zinc-500 text-xs">Codex O-Auth</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {(account.codexAssignedTo ?? []).map((agent) => (
                <span
                  key={agent}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 text-[11px] font-medium text-violet-300"
                >
                  {agent}
                  <button
                    onClick={() =>
                      onAssignCodex(
                        account.id,
                        (account.codexAssignedTo ?? []).filter((a) => a !== agent),
                      )
                    }
                    className="text-violet-400 hover:text-violet-200 transition-colors leading-none"
                    title={`Remove ${agent}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* + button: show dropdown only for unassigned agents */}
              {(account.codexAssignedTo ?? []).length < CODEX_AGENTS.length && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = [...(account.codexAssignedTo ?? []), e.target.value as CodexAgent];
                    onAssignCodex(account.id, next);
                  }}
                  className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage: "none",
                    width: "auto",
                  }}
                  title="Assign to another Codex agent"
                >
                  <option value="">+ Add</option>
                  {CODEX_AGENTS.filter(
                    (a) => !(account.codexAssignedTo ?? []).includes(a)
                  ).map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ChatGPT Assigned To – multi */}
          <div>
            <span className="text-zinc-500 text-xs">ChatGPT Assigned To</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {(account.chatgptAssignedTo ?? []).map((agent) => (
                <span
                  key={agent}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300"
                >
                  {agent}
                  <button
                    onClick={() =>
                      onAssignChatGPT(
                        account.id,
                        (account.chatgptAssignedTo ?? []).filter((a) => a !== agent),
                      )
                    }
                    className="text-emerald-400 hover:text-emerald-200 transition-colors leading-none"
                    title={`Remove ${agent}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {(account.chatgptAssignedTo ?? []).length < CHATGPT_AGENTS.length && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = [...(account.chatgptAssignedTo ?? []), e.target.value as ChatGPTAgent];
                    onAssignChatGPT(account.id, next);
                  }}
                  className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage: "none",
                    width: "auto",
                  }}
                  title="Assign to another ChatGPT device"
                >
                  <option value="">+ Add</option>
                  {CHATGPT_AGENTS.filter(
                    (a) => !(account.chatgptAssignedTo ?? []).includes(a)
                  ).map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
        {account.lastChecked && (
          <div>
            <span className="text-zinc-500 text-xs">Last Checked</span>
            <p className="text-zinc-400 text-[13px]">
              {new Date(account.lastChecked).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Usage limits */}
      {account.usageLimits.length > 0 && (
        <>
          <div className="my-4 h-px bg-zinc-800/80" />
          <div className="space-y-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Usage Limits
            </h4>
            {account.usageLimits.map((limit) => (
              <UsageBar key={limit.label} limit={limit} />
            ))}
          </div>
        </>
      )}

      {/* Account Type — replaces the notes pill */}
      <div className="mt-4">
        <select
          value={account.accountType ?? ""}
          onChange={(e) =>
            onSetAccountType(
              account.id,
              e.target.value ? (e.target.value as AccountType) : undefined,
            )
          }
          className="block w-fit rounded-lg bg-zinc-800/40 px-3 py-2 text-xs text-zinc-500 border-0 outline-none hover:bg-zinc-800/60 focus:bg-zinc-800/60 transition-colors appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
            paddingRight: "24px",
          }}
        >
          <option value="">— Account type —</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Bottom action bar */}
      <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between">
        <button
          onClick={() => onToggleInUse(account.id)}
          className={`text-xs font-medium rounded-md px-2.5 py-1 transition-colors ${
            isInUse
              ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
              : "bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {isInUse ? "✓ In Use" : "Mark In Use"}
        </button>
        <button
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors rounded-md px-2 py-1 hover:bg-zinc-800/60"
          title="Check quota (coming soon)"
          disabled
        >
          Refresh quota
        </button>
      </div>
    </div>
  );
}
