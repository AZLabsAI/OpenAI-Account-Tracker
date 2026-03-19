"use client";

import { useEffect, useState } from "react";
import { Account, ACCOUNT_TYPES, AccountType, SubscriptionTier } from "@/types";

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  "ChatGPT Plus",
  "ChatGPT Pro",
  "ChatGPT Team",
  "ChatGPT Enterprise",
  "Free",
  "API Pay-As-You-Go",
  "API Scale",
];

interface Props {
  onAdded: (account: Account) => void;
}

export function AddAccountCard({ onAdded }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Ghost trigger card */}
      <button
        onClick={() => setOpen(true)}
        className="group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700/40 bg-transparent p-6 text-center transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-500/60 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 min-h-[120px] w-full"
      >
        {/* Plus ring */}
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/40 text-zinc-500 transition-all duration-300 group-hover:border-zinc-500/70 group-hover:bg-zinc-700/40 group-hover:text-zinc-300 group-hover:scale-110">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </div>
        <span className="text-sm font-medium text-zinc-600 transition-colors duration-200 group-hover:text-zinc-400">
          Add account
        </span>
      </button>

      {/* Modal */}
      {open && (
        <AddAccountModal
          onClose={() => setOpen(false)}
          onAdded={(account) => {
            setOpen(false);
            onAdded(account);
          }}
        />
      )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (account: Account) => void;
}) {
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [subscription, setSubscription] = useState<SubscriptionTier>("ChatGPT Plus");
  const [expirationDate, setExpDate]  = useState("");
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const requiresExpirationDate = subscription !== "Free";

  useEffect(() => {
    if (!requiresExpirationDate && expirationDate) {
      setExpDate("");
    }
  }, [requiresExpirationDate, expirationDate]);

  const canSubmit = Boolean(
    name.trim() &&
    email.trim() &&
    subscription &&
    (!requiresExpirationDate || expirationDate),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subscription,
          expirationDate: requiresExpirationDate ? expirationDate : null,
          accountType: accountType || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create account");
        return;
      }
      const account: Account = await res.json();
      onAdded(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Add account</h2>
            <p className="text-xs text-zinc-500 mt-0.5">New OpenAI account to track</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Name */}
          <Field label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Work Account"
              autoFocus
              className={inputCls}
            />
          </Field>

          {/* Email */}
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="account@example.com"
              className={inputCls}
            />
          </Field>

          {/* Subscription + Expiry side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subscription" required>
              <select
                value={subscription}
                onChange={(e) => setSubscription(e.target.value as SubscriptionTier)}
                className={selectCls}
              >
                {SUBSCRIPTION_TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="Expires" required={requiresExpirationDate}>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpDate(e.target.value)}
                disabled={!requiresExpirationDate}
                aria-disabled={!requiresExpirationDate}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Account type */}
          <Field label="Account type">
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType | "")}
              className={selectCls}
            >
              <option value="">— Optional —</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-zinc-400 border-t-zinc-900" />
                  Adding…
                </>
              ) : (
                "Add account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="text-zinc-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors";

const selectCls =
  "w-full rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors appearance-none cursor-pointer";
