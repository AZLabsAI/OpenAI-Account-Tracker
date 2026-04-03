"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Account } from "@/types";

interface CommandPaletteProps {
  accounts: Account[];
  onRefresh: (id: string) => void;
  onToggleStar: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export function CommandPalette({
  accounts,
  onRefresh,
  onToggleStar,
  onTogglePin,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, openPalette]);

  const results = useMemo(() => {
    const items: { id: string; type: "account" | "action"; label: string; sub: string; action: () => void }[] = [];

    const q = query.toLowerCase();
    const matched = accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.accountType ?? "").toLowerCase().includes(q),
    );

    for (const a of matched.slice(0, 8)) {
      items.push({
        id: a.id,
        type: "account",
        label: a.name,
        sub: a.email,
        action: () => { onRefresh(a.id); setOpen(false); },
      });

      if (q.includes("star") || q.includes("fav")) {
        items.push({
          id: `star-${a.id}`,
          type: "action",
          label: `${a.starred ? "Unstar" : "Star"} ${a.name}`,
          sub: a.email,
          action: () => { onToggleStar(a.id); setOpen(false); },
        });
      }

      if (q.includes("pin")) {
        items.push({
          id: `pin-${a.id}`,
          type: "action",
          label: `${a.pinned ? "Unpin" : "Pin"} ${a.name}`,
          sub: a.email,
          action: () => { onTogglePin(a.id); setOpen(false); },
        });
      }
    }

    return items;
  }, [accounts, query, onRefresh, onToggleStar, onTogglePin]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[active]) {
        e.preventDefault();
        results[active].action();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [results, active],
  );

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/60">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-zinc-400 shrink-0">
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search accounts, actions…"
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">No results</p>
          )}
          {results.map((item, idx) => (
            <button
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setActive(idx)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                idx === active
                  ? "bg-zinc-100 dark:bg-zinc-800/60"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs ${
                item.type === "action"
                  ? "bg-sky-500/10 text-sky-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              }`}>
                {item.type === "action" ? "⚡" : item.label.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {item.label}
                </p>
                <p className="text-xs text-zinc-500 truncate">{item.sub}</p>
              </div>
              {idx === active && (
                <kbd className="shrink-0 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                  ↵
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
