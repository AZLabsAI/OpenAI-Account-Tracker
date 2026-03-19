"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import type { NotificationEvent } from "@/types";

// ─── Event type config ───────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  quota_exhausted: { emoji: "⛔", color: "text-red-400",     label: "Exhausted" },
  quota_critical:  { emoji: "🔴", color: "text-orange-400",  label: "Critical" },
  quota_warning:   { emoji: "⚠️",  color: "text-amber-400",   label: "Warning" },
  quota_reset:     { emoji: "✅", color: "text-emerald-400", label: "Replenished" },
  account_switch:  { emoji: "🔄", color: "text-blue-400",    label: "Switch" },
};

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

// ─── Component ───────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json() as { events: NotificationEvent[]; unacknowledgedCount: number };
      setEvents(data.events);
      setUnreadCount(data.unacknowledgedCount);
    } catch { /* silent */ }
  }, []);

  // Poll every 15s
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/notifications?limit=20");
        if (!res.ok || cancelled) return;
        const data = await res.json() as { events: NotificationEvent[]; unacknowledgedCount: number };
        if (cancelled) return;
        setEvents(data.events);
        setUnreadCount(data.unacknowledgedCount);
      } catch {
        // silent
      }
    })();

    const id = setInterval(fetchNotifications, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Mark all as read
  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeAll: true }),
    });
    setUnreadCount(0);
    setEvents((prev) => prev.map((e) => ({ ...e, acknowledged: true })));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1.5 rounded-lg p-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 shadow-xl dark:shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/50">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-sky-500 hover:text-sky-400 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Events list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/40">
            {events.length === 0 ? (
              <div className="py-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 text-zinc-700 mx-auto mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                <p className="text-xs text-zinc-500">No notifications yet</p>
                <p className="text-[10px] text-zinc-600 mt-1">Alerts will appear when quota thresholds are crossed</p>
              </div>
            ) : (
              events.map((event) => {
                const cfg = EVENT_CONFIG[event.eventType] ?? EVENT_CONFIG.quota_warning;
                return (
                  <div
                    key={event.id}
                    className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                      event.acknowledged
                        ? "opacity-60"
                        : "bg-sky-500/[0.03] dark:bg-sky-500/[0.02]"
                    }`}
                  >
                    <span className="text-base leading-none mt-0.5">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        {event.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-[10px] text-zinc-500">{timeAgo(event.createdAt)}</span>
                        {/* Delivery indicators */}
                        <div className="flex items-center gap-1 ml-auto">
                          {event.deliveredNative && (
                            <span className="text-[9px] text-zinc-600 bg-zinc-100 dark:bg-zinc-800 rounded px-1">macOS</span>
                          )}
                          {event.deliveredTelegram && (
                            <span className="text-[9px] text-zinc-600 bg-zinc-100 dark:bg-zinc-800 rounded px-1">TG</span>
                          )}
                          {event.deliveredWeb && (
                            <span className="text-[9px] text-zinc-600 bg-zinc-100 dark:bg-zinc-800 rounded px-1">Web</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!event.acknowledged && (
                      <span className="inline-block h-2 w-2 rounded-full bg-sky-400 shrink-0 mt-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {events.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800/50 px-4 py-2.5 text-center">
              <Link
                href="/settings"
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Notification settings →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
