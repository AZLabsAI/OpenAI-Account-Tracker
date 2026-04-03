"use client";

import { useState, useEffect, useCallback } from "react";

interface KeyboardShortcutsProps {
  onFocusSearch: () => void;
  onRefreshAll: () => void;
}

const SHORTCUTS = [
  { keys: ["⌘", "K"], desc: "Command palette" },
  { keys: ["/"], desc: "Focus search" },
  { keys: ["R"], desc: "Refresh all accounts" },
  { keys: ["?"], desc: "Show this help" },
  { keys: ["Esc"], desc: "Close dialogs / clear search" },
];

export function KeyboardShortcuts({ onFocusSearch, onRefreshAll }: KeyboardShortcutsProps) {
  const [showHelp, setShowHelp] = useState(false);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (e.key === "?" && !inInput) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (showHelp) { setShowHelp(false); return; }
      }
      if (inInput) return;

      if (e.key === "/") {
        e.preventDefault();
        onFocusSearch();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onRefreshAll();
      }
    },
    [onFocusSearch, onRefreshAll, showHelp],
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setShowHelp(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Keyboard Shortcuts</h2>
        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center min-w-[24px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-1 text-xs font-mono text-zinc-600 dark:text-zinc-400"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(false)}
          className="mt-5 w-full rounded-lg px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
