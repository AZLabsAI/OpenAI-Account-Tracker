"use client";

import Image from "next/image";
import { useState, useCallback, useRef, useEffect } from "react";
import { Account, CodexAgent, ChatGPTAgent, ACCOUNT_TYPES, AccountType, SUBSCRIPTION_TIERS, SubscriptionTier } from "@/types";
import { formatDate, daysUntilExpiration } from "@/data/accounts";
import { getAccentStripClass, getAvatarAccentClass } from "@/lib/account-accent";
import { formatLastFetchedAgo } from "@/lib/format-time";
import { getAccountStatus, getExpiryBorderUrgency } from "@/lib/account-health";
import type { LoginState, QuotaState } from "@/hooks/useAccountRefreshController";
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
  onSignIn: (id: string) => void;
  onRefreshQuota: (id: string) => void;
  loginState: LoginState;
  loginError: string | null;
  quotaState: QuotaState;
  quotaError: string | null;
  onUpdateSettings: (id: string, patch: Partial<Account>) => void;
  availableCodexAgents: CodexAgent[];
  availableChatGPTAgents: ChatGPTAgent[];
  onUpdateCodexAgentOptions: (agents: CodexAgent[]) => void;
  onUpdateChatGPTAgentOptions: (agents: ChatGPTAgent[]) => void;
  showInUseAutoRefreshNotice?: boolean;
}

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
  onSignIn,
  onRefreshQuota,
  loginState,
  loginError,
  quotaState,
  quotaError,
  onUpdateSettings,
  availableCodexAgents,
  availableChatGPTAgents,
  onUpdateCodexAgentOptions,
  onUpdateChatGPTAgentOptions,
  showInUseAutoRefreshNotice = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(account.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [codexAgentInput, setCodexAgentInput] = useState("");
  const [chatgptAgentInput, setChatgptAgentInput] = useState("");
  const [editSubscription, setEditSubscription] = useState(account.subscription);
  const [editExpiry, setEditExpiry] = useState(account.expirationDate ?? "");
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const status = getAccountStatus(account);
  const daysLeft = daysUntilExpiration(account.expirationDate);
  const expiryLabel = formatDate(account.expirationDate);
  const daysRemainingLabel = daysLeft === null ? "—" : `${Math.max(daysLeft, 0)}`;
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
  const codexOptionsForAssign = availableCodexAgents.filter(
    (agent) => !(account.codexAssignedTo ?? []).some((value) => value.toLowerCase() === agent.toLowerCase()),
  );
  const chatgptOptionsForAssign = availableChatGPTAgents.filter(
    (agent) => !(account.chatgptAssignedTo ?? []).some((value) => value.toLowerCase() === agent.toLowerCase()),
  );

  const dropdownArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`;

  useEffect(() => {
    setEditName(account.name);
    setIsEditingName(false);
  }, [account.name]);

  useEffect(() => {
    setEditSubscription(account.subscription);
  }, [account.subscription]);

  useEffect(() => {
    setEditExpiry(account.expirationDate ?? "");
  }, [account.expirationDate]);

  const requiresExpirationDate = editSubscription !== "Free";

  useEffect(() => {
    if (!requiresExpirationDate && editExpiry) {
      setEditExpiry("");
      setExpiryError(null);
    }
  }, [editExpiry, requiresExpirationDate]);

  const saveSubscription = useCallback(() => {
    if (editSubscription === account.subscription) return;
    const normalizedExpiry = editExpiry.trim();
    if (requiresExpirationDate && !normalizedExpiry) {
      setExpiryError("Expiry date required for paid plans");
      return;
    }
    onUpdateSettings(account.id, {
      subscription: editSubscription,
      ...(editSubscription === "Free" ? { expirationDate: null } : {}),
    });
    setExpiryError(null);
  }, [account.id, account.subscription, editExpiry, editSubscription, onUpdateSettings, requiresExpirationDate]);

  const saveExpiry = useCallback(() => {
    const value = editExpiry.trim() || null;
    if (value === (account.expirationDate ?? null)) return;
    // Basic sanity check
    if (value && isNaN(new Date(value).getTime())) {
      setExpiryError("Invalid date");
      return;
    }
    setExpiryError(null);
    onUpdateSettings(account.id, { expirationDate: value });
  }, [account.id, account.expirationDate, editExpiry, onUpdateSettings]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const saveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty");
      return;
    }
    if (trimmed === account.name) {
      setNameError(null);
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    setNameError(null);
    try {
      onUpdateSettings(account.id, { name: trimmed });
      setIsEditingName(false);
    } catch {
      setNameError("Failed to save name");
    } finally {
      setSavingName(false);
    }
  }, [account.id, account.name, editName, onUpdateSettings]);

  const addUniqueAgent = useCallback((existing: string[], rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return existing;
    if (existing.some((value) => value.toLowerCase() === trimmed.toLowerCase())) return existing;
    return [...existing, trimmed];
  }, []);

  const addCodexAgentOptionAndAssign = useCallback(() => {
    const nextOptions = addUniqueAgent(availableCodexAgents, codexAgentInput);
    const nextAssigned = addUniqueAgent(account.codexAssignedTo ?? [], codexAgentInput);

    if (nextOptions !== availableCodexAgents) {
      onUpdateCodexAgentOptions(nextOptions);
    }
    if (nextAssigned !== (account.codexAssignedTo ?? [])) {
      onAssignCodex(account.id, nextAssigned);
    }
    if (nextOptions !== availableCodexAgents || nextAssigned !== (account.codexAssignedTo ?? [])) {
      setCodexAgentInput("");
    }
  }, [account.codexAssignedTo, account.id, addUniqueAgent, availableCodexAgents, codexAgentInput, onAssignCodex, onUpdateCodexAgentOptions]);

  const addChatGPTAgentOptionAndAssign = useCallback(() => {
    const nextOptions = addUniqueAgent(availableChatGPTAgents, chatgptAgentInput);
    const nextAssigned = addUniqueAgent(account.chatgptAssignedTo ?? [], chatgptAgentInput);

    if (nextOptions !== availableChatGPTAgents) {
      onUpdateChatGPTAgentOptions(nextOptions);
    }
    if (nextAssigned !== (account.chatgptAssignedTo ?? [])) {
      onAssignChatGPT(account.id, nextAssigned);
    }
    if (nextOptions !== availableChatGPTAgents || nextAssigned !== (account.chatgptAssignedTo ?? [])) {
      setChatgptAgentInput("");
    }
  }, [account.chatgptAssignedTo, account.id, addUniqueAgent, availableChatGPTAgents, chatgptAgentInput, onAssignChatGPT, onUpdateChatGPTAgentOptions]);

  // ── Card border style (shared by both faces) ──────────────────────────────
  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    // Max 512 KB for data URL storage
    if (file.size > 512 * 1024) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onUpdateSettings(account.id, { avatarUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }, [account.id, onUpdateSettings]);

  const baseBorderClass = isPinned
    ? "border-violet-300 hover:border-violet-400 dark:border-violet-500/30 dark:hover:border-violet-500/50"
    : isStarred
      ? "border-amber-300 hover:border-amber-400 dark:border-amber-500/25 dark:hover:border-amber-500/40"
      : isInUse
        ? "border-blue-300 hover:border-blue-400 dark:border-blue-500/25 dark:hover:border-blue-500/40"
        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700";

  const urgencyBorderClass = getExpiryBorderUrgency(account) === "critical"
    ? "border-red-400 hover:border-red-500 dark:border-red-500/40 dark:hover:border-red-500/60"
    : getExpiryBorderUrgency(account) === "warning"
      ? "border-orange-400 hover:border-orange-500 dark:border-orange-500/40 dark:hover:border-orange-500/60"
      : null;

  const borderClass = urgencyBorderClass ?? baseBorderClass;

  // ── Accent strip (shared helper) ───────────────────────────────────────────
  const accentStripClass = getAccentStripClass(account);
  const accentStrip = accentStripClass ? <div className={accentStripClass} /> : null;
  const avatarAccentClass = getAvatarAccentClass(account);

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  return (
    <>
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDelete(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" className="text-base font-semibold text-zinc-100 mb-1">
              Delete account?
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
              <span className="font-medium text-zinc-200">{account.email}</span> will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
          className={`relative transition-transform duration-500 motion-reduce:duration-0 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* ═══════════════════════════════════════════════════════════════════
              FRONT FACE
              ═══════════════════════════════════════════════════════════════════ */}
          <div
            className={`group relative rounded-2xl border p-6 bg-white dark:bg-zinc-900/60 shadow-sm dark:shadow-none backdrop-blur-sm overflow-hidden [backface-visibility:hidden] ${borderClass}`}
          >
            {accentStrip}

            {/* Top row: avatar + name + actions */}
            <div className="flex items-start justify-between gap-3">
              {/* Left: avatar + name + email */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Hidden file input for avatar */}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white overflow-hidden group/avatar cursor-pointer ${
                    !account.avatarUrl ? avatarAccentClass : ""
                  }`}
                  title="Click to change avatar"
                >
                  {account.avatarUrl ? (
                    <Image
                      src={account.avatarUrl}
                      alt={account.name}
                      width={44}
                      height={44}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                  {/* Upload overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                    </svg>
                  </div>
                </button>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                    {account.name}
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(account.email);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 truncate mt-0.5 transition-colors group/email"
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
                  type="button"
                  onClick={() => onTogglePin(account.id)}
                  className={`rounded-md p-1 transition-colors ${
                    isPinned
                      ? "text-violet-400 hover:text-violet-300"
                      : "text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  }`}
                  title={isPinned ? "Unpin account" : "Pin account"}
                >
                  {isPinned ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                      <path d="M12 17v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M12 17v5" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                    </svg>
                  )}
                </button>
                {/* Star */}
                <button
                  type="button"
                  onClick={() => onToggleStar(account.id)}
                  className={`rounded-md p-1 transition-all ${
                    isStarred
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  }`}
                  style={isStarred ? { filter: "drop-shadow(0 0 4px rgba(251,191,36,0.5)) drop-shadow(0 0 8px rgba(251,191,36,0.25))" } : undefined}
                  title={isStarred ? "Unstar account" : "Star account"}
                >
                  {isStarred ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z" />
                    </svg>
                  )}
                </button>
                <StatusBadge status={status} />
              </div>
            </div>

            {/* Divider */}
            <div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800/80" />

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <div>
                <span className="text-zinc-500 dark:text-zinc-500 text-xs">Subscription</span>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 text-[13px]">{account.subscription}</p>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-zinc-500 text-xs">Expires</span>
                <p className="font-medium text-zinc-800 dark:text-zinc-200 text-[13px]">{expiryLabel}</p>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-zinc-500 text-xs">Days Remaining</span>
                <p className="font-mono font-semibold text-zinc-800 dark:text-zinc-200 text-[13px]">{daysRemainingLabel}</p>
              </div>
              <div className="space-y-2.5">
                {/* Codex OAuth – multi */}
                <div>
                  <span className="text-zinc-500 dark:text-zinc-500 text-xs">Codex OAuth</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(account.codexAssignedTo ?? []).map((agent) => (
                      <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 text-[11px] font-medium text-violet-300">
                        {agent}
                        <button
                          type="button"
                          onClick={() => onAssignCodex(account.id, (account.codexAssignedTo ?? []).filter((a) => a !== agent))}
                          className="text-violet-400 hover:text-violet-200 transition-colors leading-none"
                          aria-label={`Remove Codex agent ${agent}`}
                        >×</button>
                      </span>
                    ))}
                    {codexOptionsForAssign.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onAssignCodex(account.id, [...(account.codexAssignedTo ?? []), e.target.value as CodexAgent]);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                        style={{ backgroundImage: "none", width: "auto" }}
                      >
                        <option value="">+ Add</option>
                        {codexOptionsForAssign.map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                {/* ChatGPT Assigned To – multi */}
                <div>
                  <span className="text-zinc-500 dark:text-zinc-500 text-xs">ChatGPT Assigned To</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(account.chatgptAssignedTo ?? []).map((agent) => (
                      <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                        {agent}
                        <button
                          type="button"
                          onClick={() => onAssignChatGPT(account.id, (account.chatgptAssignedTo ?? []).filter((a) => a !== agent))}
                          className="text-emerald-400 hover:text-emerald-200 transition-colors leading-none"
                          aria-label={`Remove ChatGPT agent ${agent}`}
                        >×</button>
                      </span>
                    ))}
                    {chatgptOptionsForAssign.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onAssignChatGPT(account.id, [...(account.chatgptAssignedTo ?? []), e.target.value as ChatGPTAgent]);
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 outline-none transition-colors appearance-none cursor-pointer"
                        style={{ backgroundImage: "none", width: "auto" }}
                      >
                        <option value="">+ Add</option>
                        {chatgptOptionsForAssign.map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              {account.lastChecked && (
                <div>
                  <span className="text-zinc-500 dark:text-zinc-500 text-xs">Last Checked</span>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[13px]">
                    {new Date(account.lastChecked).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              )}
            </div>

            {/* Static usage limits — only shown when no live quota data */}
            {account.usageLimits.length > 0 && !account.quotaData && (
              <>
                <div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800/80" />
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">Usage Limits</h4>
                  {account.usageLimits.map((limit) => (
                    <UsageBar key={limit.label} limit={limit} />
                  ))}
                </div>
              </>
            )}

            {/* Live quota data */}
            {account.quotaData && (
              <>
                <div className="my-4 h-px bg-zinc-200 dark:bg-zinc-800/80" />
                <QuotaBar quotaData={account.quotaData} accountId={account.id} />
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
                className="block w-fit rounded-lg bg-zinc-100 dark:bg-zinc-800/40 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-500 border-0 outline-none hover:bg-zinc-200 dark:hover:bg-zinc-800/60 focus:bg-zinc-200 dark:focus:bg-zinc-800/60 transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: dropdownArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
              >
                <option value="">— Account type —</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {showInUseAutoRefreshNotice && (
              <div className="mt-4 rounded-lg border border-sky-500/15 bg-sky-500/5 px-2.5 py-1.5 text-[11px] text-sky-600 dark:text-sky-300">
                Auto-refresh set to every 5 min
              </div>
            )}

            {/* Bottom action bar */}
            <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between gap-2">
              {/* Left: Mark In Use */}
              <button
                onClick={() => onToggleInUse(account.id)}
                className={`text-xs font-medium rounded-md px-2.5 py-1 transition-colors ${
                  isInUse
                    ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                    : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {isInUse ? "✓ In Use" : "Mark In Use"}
              </button>

              {/* Right: Sign In + Refresh Quota */}
              <div className="flex items-center gap-2">
                <SignInButton
                  state={loginState}
                  hasCodexHome={hasCodexHome}
                  onClick={() => onSignIn(account.id)}
                />
                {hasCodexHome && (
                  <RefreshQuotaButton
                    state={quotaState}
                    fetchedAt={account.quotaData?.fetchedAt}
                    onClick={() => onRefreshQuota(account.id)}
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
                         border-t border-zinc-200 dark:border-zinc-800/40
                         text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/30
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
            className={`absolute inset-0 rounded-2xl border p-6 bg-white dark:bg-zinc-900/80 shadow-sm dark:shadow-none backdrop-blur-sm overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col ${borderClass}`}
          >
            {accentStrip}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white overflow-hidden ${
                    !account.avatarUrl ? avatarAccentClass : ""
                  }`}
                >
                  {account.avatarUrl ? (
                    <Image
                      src={account.avatarUrl}
                      alt={account.name}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                          if (nameError) setNameError(null);
                        }}
                        onBlur={() => { void saveName(); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveName();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditName(account.name);
                            setNameError(null);
                            setIsEditingName(false);
                          }
                        }}
                        className="w-52 max-w-full rounded-md bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/50 px-2.5 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500/50 transition-colors"
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { void saveName(); }}
                        disabled={savingName}
                        className="rounded-md px-2 py-1 text-[10px] font-medium bg-sky-500/10 text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingName ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditName(account.name);
                        setNameError(null);
                        setIsEditingName(true);
                      }}
                      className="group/name flex items-center gap-1 max-w-full text-left"
                      title="Click to edit account name"
                    >
                      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover/name:text-sky-500 dark:group-hover/name:text-sky-400 transition-colors">
                        {account.name}
                      </h3>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-zinc-400 opacity-0 group-hover/name:opacity-100 transition-opacity">
                        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 2.474l-7.19 7.19a1.75 1.75 0 0 1-.772.444l-2.32.664a.75.75 0 0 1-.927-.927l.664-2.32a1.75 1.75 0 0 1 .444-.772l7.19-7.19ZM12.426 4.96 11.04 3.573l-6.94 6.94a.25.25 0 0 0-.064.11l-.378 1.323 1.323-.378a.25.25 0 0 0 .11-.064l6.94-6.94Z" />
                      </svg>
                    </button>
                  )}
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-500">Card Settings</p>
                  {nameError && (
                    <p className="mt-1 text-[11px] text-red-400">{nameError}</p>
                  )}
                </div>
              </div>

              {/* Gear icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-600">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </div>

            <div className="h-px bg-zinc-200 dark:bg-zinc-800/80 mb-5" />

            {/* Settings content */}
            <div className="flex-1 space-y-5 overflow-y-auto min-h-0">

              {/* ── Subscription Settings ────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Subscription
                </label>
                <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed">
                  Change the subscription tier and keep the expiry date in sync with the current plan.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={editSubscription}
                    onChange={(e) => {
                      setEditSubscription(e.target.value as SubscriptionTier);
                      if (expiryError) setExpiryError(null);
                    }}
                    className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2.5 py-1.5 text-[12px] text-zinc-800 dark:text-zinc-200 outline-none focus:border-sky-500/50 dark:focus:border-sky-500/50 transition-colors appearance-none cursor-pointer"
                    style={{ backgroundImage: dropdownArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: "24px" }}
                  >
                    {SUBSCRIPTION_TIERS.map((tier) => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                  <button
                    onClick={saveSubscription}
                    disabled={editSubscription === account.subscription}
                    className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Save plan
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Current: <span className="text-zinc-400">{account.subscription}</span>
                </p>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Subscription Expiry
                </label>
                <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed">
                  Update the expiry date after renewing your subscription.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editExpiry}
                    onChange={(e) => {
                      setEditExpiry(e.target.value);
                      if (expiryError) setExpiryError(null);
                    }}
                    disabled={!requiresExpirationDate}
                    aria-disabled={!requiresExpirationDate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveExpiry(); }
                    }}
                    className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2.5 py-1.5 text-[12px] text-zinc-800 dark:text-zinc-200 outline-none focus:border-sky-500/50 dark:focus:border-sky-500/50 transition-colors"
                  />
                  <button
                    onClick={saveExpiry}
                    disabled={!requiresExpirationDate || editExpiry === (account.expirationDate ?? "")}
                    className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Save date
                  </button>
                </div>
                {!requiresExpirationDate && (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Free accounts do not require an expiry date.
                  </p>
                )}
                {account.expirationDate && (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Current: <span className="text-zinc-400">{expiryLabel}</span>
                    {daysLeft !== null && (
                      <span className={`ml-1.5 font-medium ${
                        daysLeft <= 0 ? "text-red-400" : daysLeft <= 7 ? "text-orange-400" : "text-zinc-400"
                      }`}>
                        ({daysLeft <= 0 ? "expired" : `${daysLeft}d left`})
                      </span>
                    )}
                  </p>
                )}
                {expiryError && (
                  <p className="mt-1 text-[11px] text-red-400">{expiryError}</p>
                )}
              </div>

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
                            ? "bg-sky-500/15 text-sky-400 dark:text-sky-300 border-sky-500/30"
                            : isDisabled
                              ? "bg-zinc-100 dark:bg-zinc-800/20 text-zinc-400 dark:text-zinc-700 border-zinc-200 dark:border-zinc-800/30 cursor-not-allowed"
                              : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700/40 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
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
                    <span className={hasCodexHome ? "text-emerald-300" : "text-zinc-500 dark:text-zinc-500"}>
                      {hasCodexHome ? "Codex OAuth linked" : "Not linked"}
                    </span>
                  </div>
                  {account.quotaData?.fetchedAt && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className={`inline-block h-2 w-2 rounded-full ${staleness(account.quotaData.fetchedAt) === "fresh" ? "bg-sky-400" : staleness(account.quotaData.fetchedAt) === "aging" ? "bg-amber-400" : "bg-orange-400"}`} />
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Last fetched {formatLastFetchedAgo(account.quotaData.fetchedAt)}
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
                    <div className="mt-2 rounded-md bg-zinc-100 dark:bg-zinc-800/40 px-2.5 py-1.5 text-[10px] font-mono text-zinc-600 truncate" title={account.codexHomePath}>
                      {account.codexHomePath}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Assignment settings ─────────────────────────────── */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Assignment Options
                </label>
                <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed">
                  Add your own Codex OAuth and ChatGPT labels here. They are stored locally and then appear in the front-card + Add menus.
                </p>

                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Saved Codex OAuth Options</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {availableCodexAgents.map((agent) => (
                        <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 text-[11px] font-medium text-violet-300">
                          {agent}
                          <button
                            onClick={() => onUpdateCodexAgentOptions(availableCodexAgents.filter((value) => value !== agent))}
                            className="text-violet-400 hover:text-violet-200 transition-colors leading-none"
                            title="Remove saved option"
                          >×</button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={codexAgentInput}
                        onChange={(e) => setCodexAgentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCodexAgentOptionAndAssign();
                          }
                        }}
                        placeholder="Add Codex OAuth option"
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-violet-400 dark:focus:border-violet-500/60"
                      />
                      <button
                        onClick={addCodexAgentOptionAndAssign}
                        className="rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-violet-400 dark:hover:border-violet-500/60 hover:text-zinc-900 dark:hover:text-white transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Saved ChatGPT Assigned To Options</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {availableChatGPTAgents.map((agent) => (
                        <span key={agent} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                          {agent}
                          <button
                            onClick={() => onUpdateChatGPTAgentOptions(availableChatGPTAgents.filter((value) => value !== agent))}
                            className="text-emerald-400 hover:text-emerald-200 transition-colors leading-none"
                            title="Remove saved option"
                          >×</button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={chatgptAgentInput}
                        onChange={(e) => setChatgptAgentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addChatGPTAgentOptionAndAssign();
                          }
                        }}
                        placeholder="Add ChatGPT assignment option"
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-emerald-400 dark:focus:border-emerald-500/60"
                      />
                      <button
                        onClick={addChatGPTAgentOptionAndAssign}
                        className="rounded-md border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800/70 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:text-zinc-900 dark:hover:text-white transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Danger zone ──────────────────────────────────────── */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Danger Zone
                </label>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/15 hover:border-red-500/30 transition-colors w-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Delete this account
                </button>
              </div>
            </div>

            {/* ── Flip back trigger zone ─────────────────────────────────── */}
            <button
              onClick={() => setFlipped(false)}
              className="mt-4 -mx-6 -mb-6 px-6 py-3 w-[calc(100%+48px)] flex items-center justify-center gap-2 cursor-pointer
                         bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(113,113,122,0.06)_4px,rgba(113,113,122,0.06)_5px)]
                         border-t border-zinc-200 dark:border-zinc-800/40
                         text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/30
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

// ─── Sign In Button ───────────────────────────────────────────────────────────

function SignInButton({
  state,
  hasCodexHome,
  onClick,
}: {
  state: LoginState;
  hasCodexHome: boolean;
  onClick: () => void;
}) {
  if (state === "waiting") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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
          ? "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700/60"
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
