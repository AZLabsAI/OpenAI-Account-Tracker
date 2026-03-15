"use client";

import { useState, useCallback } from "react";
import { Account, CODEX_AGENTS, CHATGPT_AGENTS, CodexAgent, ChatGPTAgent, ACCOUNT_TYPES, AccountType, QuotaData } from "@/types";
import { getAccountStatus, formatDate, daysUntilExpiration } from "@/data/accounts";
import { StatusBadge } from "./StatusBadge";
import { UsageBar, QuotaBar } from "./UsageBar";

// ─── Refresh interval presets ────────────────────────────────────────────────

const INTERVAL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Manual only" },
  { value: 5,    label: "Every 5 min" },
  { value: 10,   label: "Every 10 min" },
  { value: 15,   label: "Every 15 min" },
  { value: 30,   label: "Every 30 min" },
  { value: 60,   label: "Every 1 hour" },
  { value: 120,  label: "Every 2 hours" },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  account: Account;
  onToggleStar: (id: string) => void;
  onToggleInUse: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onAssignCodex: (id: string, agents: CodexAgent[]) => void;
  onAssignChatGPT: (id: string, agents: ChatGPTAgent[]) => void;
  onSetAccountType: (id: string, type: AccountType | undefined) => void;
  onQuotaUpdated: (id: string, quotaData: QuotaData, codexHomePath?: string) => void;
  onUpdateSettings: (id: string, patch: Partial<Account>) => void;
}

type LoginState = "idle" | "waiting" | "success" | "error";
type QuotaState = "idle" | "loading" | "error";

// ─── Main component ─────────────────────────────────────────────────────────

export function AccountCard({
  account,
  onToggleStar,
  onToggleInUse,
  onTogglePin,
  onDelete,
  onAssignCodex,
  onAssignChatGPT,
  onSetAccountType,
  onQuotaUpdated,
  onUpdateSettings,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const [loginState, setLoginState] = useState<LoginState>("idle");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [quotaState, setQuotaState] = useState<QuotaState>("idle");
  const [quotaError, setQuotaError] = useState<string | null>(null);

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
  const isPinned = account.pinned;
  const hasCodexHome = Boolean(account.codexHomePath);

  const dropdownArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`;

  // ── Sign In (OAuth login) ──────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    setLoginState("waiting");
    setLoginError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(6 * 60 * 1000),
      });
      const data = await res.json();
      if (data.success) {
        setLoginState("success");
        if (data.quotaData) onQuotaUpdated(account.id, data.quotaData, data.codexHomePath);
        setTimeout(() => setLoginState("idle"), 3000);
      } else {
        setLoginState("error");
        setLoginError(data.error ?? "Sign in failed");
      }
    } catch (err) {
      setLoginState("error");
      setLoginError(err instanceof Error ? err.message : "Sign in failed");
    }
  }, [account.id, onQuotaUpdated]);

  // ── Refresh Quota ─────────────────────────────────────────────────────────
  const handleRefreshQuota = useCallback(async () => {
    setQuotaState("loading");
    setQuotaError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/quota`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      if (res.ok) {
        setQuotaState("idle");
        onQuotaUpdated(account.id, data as QuotaData);
      } else {
        setQuotaState("error");
        setQuotaError(data.error ?? "Quota fetch failed");
      }
    } catch (err) {
      setQuotaState("error");
      setQuotaError(err instanceof Error ? err.message : "Quota fetch failed");
    }
  }, [account.id, onQuotaUpdated]);

  // ── Card border style (shared by both faces) ──────────────────────────────
  const borderClass = isPinned
    ? "border-violet-500/30 hover:border-violet-500/50"
    : isStarred
      ? "border-amber-500/25 hover:border-amber-500/40"
      : isInUse
        ? "border-blue-500/25 hover:border-blue-500/40"
        : "border-zinc-800 hover:border-zinc-700";

  // ── Accent strip ──────────────────────────────────────────────────────────
  const accentStrip = isPinned
    ? <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-violet-400 to-violet-600 rounded-l-2xl" />
    : isStarred
      ? <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 to-amber-600 rounded-l-2xl" />
      : isInUse
        ? <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-blue-400 to-blue-600 rounded-l-2xl" />
        : null;

  return (
    <>
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-zinc-100 mb-1">Delete account?</h3>
            <p className="text-sm text-zinc-400 mb-5">
              <span className="font-medium text-zinc-200">{account.email}</span> will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDelete(false); onDelete(account.id); }}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D flip container */}
      <div className="[perspective:1200px]">
        <div
          className={`relative transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* ═══════════════════════════════════════════════════════════════════
              FRONT FACE
              ═══════════════════════════════════════════════════════════════════ */}
          <div
            className={`group relative rounded-2xl border p-6 bg-zinc-900/60 backdrop-blur-sm overflow-hidden [backface-visibility:hidden] ${borderClass}`}
          >
            {accentStrip}

            {/* Top row: avatar + name + actions */}
            <div className="flex items-start justify-between gap-3">
              {/* Left: avatar + name + email */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    isPinned
                      ? "bg-gradient-to-br from-violet-400 to-violet-600"
                      : isStarred
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

              {/* Right: pin + star + delete + status */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Pin */}
                <button
                  onClick={() => onTogglePin(account.id)}
                  className={`rounded-md p-1 transition-colors ${
                    isPinned
                      ? "text-violet-400 hover:text-violet-300"
                      : "text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100"
                  }`}
                  title={isPinned ? "Unpin account" : "Pin account"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                  </svg>
                </button>
                {/* Star */}
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
                {/* Delete */}
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-md p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors"
                  title="Delete account"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
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
                <p className="font-medium text-zinc-200 text-[13px]">{account.subscription}</p>
              </div>
              <div>
                <span className="text-zinc-500 text-xs">Expires</span>
                <p className="font-medium text-zinc-200 text-[13px]">{formatDate(account.expirationDate)}</p>
              </div>
              <div>
                <span className="text-zinc-500 text-xs">Days Remaining</span>
                <p className="font-mono font-semibold text-zinc-200 text-[13px]">{daysLeft > 0 ? daysLeft : 0}</p>
              </div>
              <div className="space-y-2.5">
                {/* Codex O-Auth – multi */}
                <div>
                  <span className="text-zinc-500 text-xs">Codex O-Auth</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(account.codexAssignedTo ?? []).map((agent) => (
                      <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 text-[11px] font-medium text-violet-300">
                        {agent}
                        <button
                          onClick={() => onAssignCodex(account.id, (account.codexAssignedTo ?? []).filter((a) => a !== agent))}
                          className="text-violet-400 hover:text-violet-200 transition-colors leading-none"
                        >×</button>
                      </span>
                    ))}
                    {(account.codexAssignedTo ?? []).length < CODEX_AGENTS.length && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onAssignCodex(account.id, [...(account.codexAssignedTo ?? []), e.target.value as CodexAgent]);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                        style={{ backgroundImage: "none", width: "auto" }}
                      >
                        <option value="">+ Add</option>
                        {CODEX_AGENTS.filter((a) => !(account.codexAssignedTo ?? []).includes(a)).map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
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
                      <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                        {agent}
                        <button
                          onClick={() => onAssignChatGPT(account.id, (account.chatgptAssignedTo ?? []).filter((a) => a !== agent))}
                          className="text-emerald-400 hover:text-emerald-200 transition-colors leading-none"
                        >×</button>
                      </span>
                    ))}
                    {(account.chatgptAssignedTo ?? []).length < CHATGPT_AGENTS.length && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onAssignChatGPT(account.id, [...(account.chatgptAssignedTo ?? []), e.target.value as ChatGPTAgent]);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                        style={{ backgroundImage: "none", width: "auto" }}
                      >
                        <option value="">+ Add</option>
                        {CHATGPT_AGENTS.filter((a) => !(account.chatgptAssignedTo ?? []).includes(a)).map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
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
                    {new Date(account.lastChecked).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              )}
            </div>

            {/* Static usage limits — only shown when no live quota data */}
            {account.usageLimits.length > 0 && !account.quotaData && (
              <>
                <div className="my-4 h-px bg-zinc-800/80" />
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Usage Limits</h4>
                  {account.usageLimits.map((limit) => (
                    <UsageBar key={limit.label} limit={limit} />
                  ))}
                </div>
              </>
            )}

            {/* Live quota data */}
            {account.quotaData && (
              <>
                <div className="my-4 h-px bg-zinc-800/80" />
                <QuotaBar quotaData={account.quotaData} />
              </>
            )}

            {/* Quota error inline */}
            {quotaState === "error" && quotaError && (
              <p className="mt-2 text-[11px] text-red-400">{quotaError}</p>
            )}

            {/* Account Type */}
            <div className="mt-4">
              <select
                value={account.accountType ?? ""}
                onChange={(e) => onSetAccountType(account.id, e.target.value ? (e.target.value as AccountType) : undefined)}
                className="block w-fit rounded-lg bg-zinc-800/40 px-3 py-2 text-xs text-zinc-500 border-0 outline-none hover:bg-zinc-800/60 focus:bg-zinc-800/60 transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: dropdownArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
              >
                <option value="">— Account type —</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Bottom action bar */}
            <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between gap-2">
              {/* Left: Mark In Use */}
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

              {/* Right: Sign In + Refresh Quota */}
              <div className="flex items-center gap-2">
                <SignInButton
                  state={loginState}
                  error={loginError}
                  hasCodexHome={hasCodexHome}
                  onClick={handleSignIn}
                />
                {hasCodexHome && (
                  <RefreshQuotaButton
                    state={quotaState}
                    fetchedAt={account.quotaData?.fetchedAt}
                    onClick={handleRefreshQuota}
                  />
                )}
              </div>
            </div>

            {/* Login error inline */}
            {loginState === "error" && loginError && (
              <p className="mt-2 text-[11px] text-red-400 leading-snug">{loginError}</p>
            )}

            {/* ── Flip trigger zone ──────────────────────────────────────── */}
            <button
              onClick={() => setFlipped(true)}
              className="mt-3 -mx-6 -mb-6 px-6 py-3 w-[calc(100%+48px)] flex items-center justify-center gap-2 cursor-pointer
                         bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(113,113,122,0.06)_4px,rgba(113,113,122,0.06)_5px)]
                         border-t border-zinc-800/40
                         text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30
                         transition-colors group/flip"
              title="Flip card to view settings"
            >
              {/* Grip dots */}
              <div className="flex gap-[3px]">
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
              </div>
              <span className="text-[10px] uppercase tracking-widest font-medium opacity-0 group-hover/flip:opacity-100 transition-opacity">
                Settings
              </span>
              <div className="flex gap-[3px]">
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
              </div>
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BACK FACE
              ═══════════════════════════════════════════════════════════════════ */}
          <div
            className={`absolute inset-0 rounded-2xl border p-6 bg-zinc-900/80 backdrop-blur-sm overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col ${borderClass}`}
          >
            {accentStrip}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                    isPinned
                      ? "bg-gradient-to-br from-violet-400 to-violet-600"
                      : isStarred
                        ? "bg-gradient-to-br from-amber-400 to-orange-500"
                        : isInUse
                          ? "bg-gradient-to-br from-blue-400 to-blue-600"
                          : "bg-gradient-to-br from-emerald-500 to-teal-600"
                  }`}
                >
                  {initials}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{account.name}</h3>
                  <p className="text-[11px] text-zinc-500">Card Settings</p>
                </div>
              </div>

              {/* Gear icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-600">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </div>

            <div className="h-px bg-zinc-800/80 mb-5" />

            {/* Settings content */}
            <div className="flex-1 space-y-5 overflow-y-auto min-h-0">

              {/* ── Auto-refresh interval ─────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Auto-Refresh Interval
                </label>
                <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed">
                  Automatically fetch live quota at a regular interval. Requires a signed-in Codex OAuth session.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {INTERVAL_OPTIONS.map(({ value, label }) => {
                    const isActive = (value === null && !account.refreshIntervalMins)
                      || (value === account.refreshIntervalMins);
                    const isDisabled = value !== null && !hasCodexHome;
                    return (
                      <button
                        key={String(value)}
                        disabled={isDisabled}
                        onClick={() => {
                          if (isActive) return;
                          onUpdateSettings(account.id, { refreshIntervalMins: value });
                        }}
                        className={`rounded-lg px-2.5 py-2 text-[11px] font-medium border transition-colors text-left
                          ${isActive
                            ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                            : isDisabled
                              ? "bg-zinc-800/20 text-zinc-700 border-zinc-800/30 cursor-not-allowed"
                              : "bg-zinc-800/40 text-zinc-400 border-zinc-700/40 hover:border-zinc-600 hover:text-zinc-200 cursor-pointer"
                          }`}
                        title={isDisabled ? "Sign in first to enable auto-refresh" : ""}
                      >
                        {isActive && (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400 mr-1.5 animate-pulse" />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
                {!hasCodexHome && (
                  <p className="mt-2 text-[10px] text-zinc-600 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-zinc-600">
                      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm.75-10.25v.01a.75.75 0 0 1-1.5 0v-.01a.75.75 0 0 1 1.5 0ZM8 12a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 0-1.5 0v3.5c0 .414.336.75.75.75Z" clipRule="evenodd" />
                    </svg>
                    Sign in on the front of this card first to unlock auto-refresh.
                  </p>
                )}
              </div>

              {/* ── Current status summary ────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Connection Status
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className={`inline-block h-2 w-2 rounded-full ${hasCodexHome ? "bg-emerald-400" : "bg-zinc-600"}`} />
                    <span className={hasCodexHome ? "text-emerald-300" : "text-zinc-500"}>
                      {hasCodexHome ? "Codex OAuth linked" : "Not linked"}
                    </span>
                  </div>
                  {account.quotaData?.fetchedAt && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className={`inline-block h-2 w-2 rounded-full ${staleness(account.quotaData.fetchedAt) === "fresh" ? "bg-sky-400" : staleness(account.quotaData.fetchedAt) === "aging" ? "bg-amber-400" : "bg-orange-400"}`} />
                      <span className="text-zinc-400">
                        Last fetched {timeAgo(account.quotaData.fetchedAt)}
                      </span>
                    </div>
                  )}
                  {account.refreshIntervalMins && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                      <span className="text-sky-300">
                        Auto-refresh every {account.refreshIntervalMins} min
                      </span>
                    </div>
                  )}
                  {account.codexHomePath && (
                    <div className="mt-2 rounded-md bg-zinc-800/40 px-2.5 py-1.5 text-[10px] font-mono text-zinc-600 truncate" title={account.codexHomePath}>
                      {account.codexHomePath}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Flip back trigger zone ─────────────────────────────────── */}
            <button
              onClick={() => setFlipped(false)}
              className="mt-4 -mx-6 -mb-6 px-6 py-3 w-[calc(100%+48px)] flex items-center justify-center gap-2 cursor-pointer
                         bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(113,113,122,0.06)_4px,rgba(113,113,122,0.06)_5px)]
                         border-t border-zinc-800/40
                         text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30
                         transition-colors group/flip"
              title="Flip back to card"
            >
              <div className="flex gap-[3px]">
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
              </div>
              <span className="text-[10px] uppercase tracking-widest font-medium opacity-0 group-hover/flip:opacity-100 transition-opacity">
                Back
              </span>
              <div className="flex gap-[3px]">
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function staleness(fetchedAt?: string): "fresh" | "aging" | "stale" {
  if (!fetchedAt) return "stale";
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageMins = ageMs / 60_000;
  if (ageMins < 30)  return "fresh";
  if (ageMins < 120) return "aging";
  return "stale";
}

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Sign In Button ───────────────────────────────────────────────────────────

function SignInButton({
  state,
  error,
  hasCodexHome,
  onClick,
}: {
  state: LoginState;
  error: string | null;
  hasCodexHome: boolean;
  onClick: () => void;
}) {
  if (state === "waiting") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
        Waiting for browser…
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
        Signed in
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 transition-colors ${
        hasCodexHome
          ? "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60"
          : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
      }`}
      title={hasCodexHome ? "Re-authenticate this account" : "Sign in to enable live quota tracking"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm.75-10.25a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" clipRule="evenodd" />
      </svg>
      {hasCodexHome ? "Re-auth" : "Sign In"}
    </button>
  );
}

// ─── Refresh Quota Button (stale-aware: sky → amber → orange) ─────────────────

const STALE_STYLES = {
  fresh: "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border-sky-500/20",
  aging: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20",
  stale: "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20",
};

function RefreshQuotaButton({
  state,
  fetchedAt,
  onClick,
}: {
  state: QuotaState;
  fetchedAt?: string;
  onClick: () => void;
}) {
  const s = staleness(fetchedAt);

  return (
    <button
      onClick={onClick}
      disabled={state === "loading"}
      className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${STALE_STYLES[s]}`}
      title={
        s === "fresh" ? "Quota is fresh" :
        s === "aging" ? "Quota is getting stale — consider refreshing" :
        "Quota is stale — refresh recommended"
      }
    >
      {state === "loading" ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
          Fetching…
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
          </svg>
          Refresh
        </>
      )}
    </button>
  );
}
