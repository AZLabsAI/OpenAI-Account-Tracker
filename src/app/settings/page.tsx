"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import type { NotificationEventType, NotificationSettings } from "@/types";
import { buildWebNotificationPayload, getNotificationUiMeta } from "@/lib/notification-presentation";

// ─── Types ───────────────────────────────────────────────────────────────────

type LogLevel = "info" | "success" | "warn" | "error";
type LogCategory = "system" | "notification" | "quota" | "login" | "account" | "refresh-all";

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  accountId: string | null;
  accountEmail: string | null;
  detail: string | null;
  durationMs: number | null;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
}

interface SettingsResponse extends NotificationSettings {
  nativeAvailable: boolean;
  nativeMethod: string;
  telegramEnvBotToken: boolean;
  telegramEnvChatId: boolean;
  telegramChatIdFromDb: string | null;
  telegramBotTokenFromDb: boolean;
  channelHealth: Record<"web" | "native" | "telegram", {
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<LogLevel, { label: string; dot: string; bg: string; text: string; border: string }> = {
  info:    { label: "INFO",    dot: "bg-sky-400",     bg: "bg-sky-500/8",     text: "text-sky-400",     border: "border-sky-500/20"    },
  success: { label: "OK",      dot: "bg-emerald-400", bg: "bg-emerald-500/8", text: "text-emerald-400", border: "border-emerald-500/20" },
  warn:    { label: "WARN",    dot: "bg-amber-400",   bg: "bg-amber-500/8",   text: "text-amber-400",   border: "border-amber-500/20"  },
  error:   { label: "ERROR",   dot: "bg-red-400",     bg: "bg-red-500/8",     text: "text-red-400",     border: "border-red-500/20"    },
};

const CATEGORY_CONFIG: Record<LogCategory, { label: string; color: string }> = {
  system:        { label: "System",      color: "text-zinc-400" },
  notification:  { label: "Notification", color: "text-cyan-400" },
  quota:         { label: "Quota",       color: "text-sky-400"  },
  login:         { label: "Login",       color: "text-violet-400" },
  account:       { label: "Account",     color: "text-emerald-400" },
  "refresh-all": { label: "Refresh All", color: "text-amber-400" },
};

const ALL_LEVELS: LogLevel[] = ["info", "success", "warn", "error"];
const ALL_CATEGORIES: LogCategory[] = ["system", "notification", "quota", "login", "account", "refresh-all"];
const EXHAUSTED_REMINDER_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 60, label: "1h" },
  { value: 240, label: "4h" },
  { value: 480, label: "8h" },
  { value: 1440, label: "24h" },
] as const;
const TEST_EVENT_OPTIONS: NotificationEventType[] = [
  "quota_warning",
  "quota_critical",
  "quota_exhausted",
  "quota_reset",
  "account_switch",
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [levelFilter, setLevelFilter] = useState<LogLevel | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | null>(null);
  const [search, setSearch] = useState("");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState<SettingsResponse | null>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; text: string } | null>(null);
  const [testEventType, setTestEventType] = useState<NotificationEventType>("quota_critical");
  // Active settings tab
  const [activeTab, setActiveTab] = useState<"notifications" | "logs" | "data">("notifications");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmClear) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmClear(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClear]);

  const formatTimestamp = useCallback((iso?: string | null) => {
    if (!iso) return "Never";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Never";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  // ── Fetch notification settings ────────────────────────────────────────────
  const fetchNotifSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json() as SettingsResponse;
      setNotifSettings(data);
      // Pre-fill form fields
      if (data.telegramChatId && !data.telegramEnvChatId) {
        setTelegramChatId(data.telegramChatId);
      }
    } catch { /* silent */ }
    setNotifLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json() as SettingsResponse;
        if (cancelled) return;
        setNotifSettings(data);
        if (data.telegramChatId && !data.telegramEnvChatId) {
          setTelegramChatId(data.telegramChatId);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) {
          setNotifLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (levelFilter) params.set("level", levelFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", "500");

    try {
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? null);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [levelFilter, categoryFilter, search]);

  const patchSettings = useCallback(async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error ?? "Failed to update settings");
    }

    await fetchNotifSettings();
    return data;
  }, [fetchNotifSettings]);

  // Initial + filter change
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (levelFilter) params.set("level", levelFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "500");

      try {
        const res = await fetch(`/api/logs?${params}`);
        const data = await res.json();
        if (cancelled) return;
        setLogs(data.logs ?? []);
        setStats(data.stats ?? null);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [levelFilter, categoryFilter, search]);

  // Auto-refresh every 3s
  useEffect(() => {
    if (!autoRefresh || activeTab !== "logs") return;
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs, activeTab]);

  // ── Toggle a boolean setting ───────────────────────────────────────────────
  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await patchSettings({ [key]: !currentValue });
    } catch { /* silent */ }
  };

  // ── Save Telegram credentials ──────────────────────────────────────────────
  const saveTelegramCreds = async () => {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (telegramToken.trim()) body.telegram_bot_token = telegramToken.trim();
      if (telegramChatId.trim()) body.telegram_chat_id = telegramChatId.trim();

      await patchSettings(body);
      setSettingsMsg({ type: "success", text: "Telegram credentials saved successfully" });
      setTelegramToken("");
    } catch (err) {
      setSettingsMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    }
    setSavingSettings(false);
    setTimeout(() => setSettingsMsg(null), 5000);
  };

  // ── Test notification ──────────────────────────────────────────────────────
  const testNotification = async (channel: string) => {
    setTestingChannel(channel);
    setTestResult(null);
    try {
      const res = await fetch(`/api/notifications/test?channel=${channel}&eventType=${testEventType}`, { method: "POST" });
      const data = await res.json() as {
        success: boolean;
        results: Record<string, { success: boolean; error?: string; title?: string; body?: string }>;
      };

      // For web test, fire a browser notification using the realistic payload from the server
      if (channel === "web" || channel === "all") {
        if ("Notification" in window) {
          if (Notification.permission === "default") {
            await Notification.requestPermission();
          }
          if (Notification.permission === "granted") {
            const webData = data.results.web;
            const fallback = buildWebNotificationPayload({
              eventType: testEventType,
              message: "Test notification",
            });
            const n = new Notification(webData?.title ?? fallback.title, {
              body: webData?.body ?? fallback.body,
              icon: "/favicon.ico",
              tag: "oat-test-web",
            });
            n.onclick = () => { window.focus(); n.close(); };
          }
        }
      }

      const channelResult = data.results[channel];
      if (channelResult?.success || data.success) {
        setTestResult({ channel, success: true, text: `${channel} ${getNotificationUiMeta(testEventType).label.toLowerCase()} notification sent!` });
      } else {
        setTestResult({ channel, success: false, text: channelResult?.error ?? "Test failed" });
      }
    } catch (err) {
      setTestResult({ channel, success: false, text: err instanceof Error ? err.message : "Test failed" });
    }
    setTestingChannel(null);
    setTimeout(() => setTestResult(null), 8000);
  };

  // ── Clear logs ─────────────────────────────────────────────────────────────
  const handleClear = async () => {
    await fetch("/api/logs", { method: "DELETE" });
    setConfirmClear(false);
    fetchLogs();
  };

  // ── Toggle detail expansion ────────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              title="Back to Dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
              <p className="text-xs text-zinc-500">Notifications, logs & diagnostics</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("notifications")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "notifications"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              🔔 Notifications
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "logs"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              📋 Logs
            </button>
            <button
              onClick={() => setActiveTab("data")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "data"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              💾 Data
            </button>
          </div>

          {activeTab === "logs" && (
            <div className="flex items-center gap-2">
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  autoRefresh
                    ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 border-zinc-300 dark:border-zinc-700/50 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                {autoRefresh ? "Live" : "Paused"}
              </button>

              {/* Manual refresh */}
              <button
                onClick={fetchLogs}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                title="Refresh now"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Clear logs */}
              <button
                onClick={() => setConfirmClear(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 border border-zinc-300 dark:border-zinc-700/50 hover:border-red-500/20 transition-colors"
              >
                Clear Logs
              </button>
            </div>
          )}
          {activeTab === "notifications" && <div />}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* ═══════════════════════════════════════════════════════════════════
            NOTIFICATIONS TAB
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            {notifLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-600 dark:border-t-zinc-400" />
              </div>
            ) : notifSettings && (
              <>
                {/* Master toggle */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Desktop Notifications</h2>
                      <p className="text-xs text-zinc-500 mt-0.5">Receive alerts when quota thresholds are crossed or reset</p>
                    </div>
                    <ToggleSwitch
                      enabled={notifSettings.notificationsEnabled}
                      onToggle={() => toggleSetting("notifications_enabled", notifSettings.notificationsEnabled)}
                    />
                  </div>
                </div>

                {/* Notification channels */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Test Scenario</h3>
                  <p className="text-[11px] text-zinc-500 mb-4">
                    Choose which real notification shape to preview when testing a channel.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {TEST_EVENT_OPTIONS.map((value) => {
                      const meta = getNotificationUiMeta(value);
                      const active = testEventType === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setTestEventType(value)}
                          className={`rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                            active
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                              : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border-zinc-300 dark:border-zinc-700/40 hover:border-zinc-400 dark:hover:border-zinc-600"
                          }`}
                        >
                          {meta.emoji} {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">

                  {/* ── Web Channel ──────────────────────────────────── */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🌐</span>
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Web</h3>
                      </div>
                      <ToggleSwitch
                        enabled={notifSettings.webEnabled}
                        onToggle={() => toggleSetting("web_enabled", notifSettings.webEnabled)}
                        small
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Browser notifications when the dashboard tab is open. Uses the favicon so you know which app it&apos;s from.
                    </p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`} />
                      <span className="text-zinc-500">
                        {typeof window !== "undefined" && "Notification" in window
                          ? `Permission: ${Notification.permission}`
                          : "Not available"
                        }
                      </span>
                    </div>
                    <div className="space-y-1 text-[10px] text-zinc-500">
                      <p>Last attempt: {formatTimestamp(notifSettings.channelHealth.web.lastAttemptAt)}</p>
                      <p>Last success: {formatTimestamp(notifSettings.channelHealth.web.lastSuccessAt)}</p>
                      {notifSettings.channelHealth.web.lastFailureAt && (
                        <p className="text-amber-500">Last failure: {formatTimestamp(notifSettings.channelHealth.web.lastFailureAt)}</p>
                      )}
                    </div>
                    <TestButton
                      channel="web"
                      testing={testingChannel === "web"}
                      result={testResult?.channel === "web" ? testResult : null}
                      onTest={() => testNotification("web")}
                    />
                  </div>

                  {/* ── Native macOS Channel ─────────────────────────── */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🍎</span>
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Native macOS</h3>
                      </div>
                      <ToggleSwitch
                        enabled={notifSettings.nativeEnabled}
                        onToggle={() => toggleSetting("native_enabled", notifSettings.nativeEnabled)}
                        small
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      macOS Notification Center alerts. Works even when the browser is in the background.
                    </p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-2 w-2 rounded-full ${notifSettings.nativeAvailable ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      <span className="text-zinc-500">
                        {notifSettings.nativeAvailable
                          ? `Available (${notifSettings.nativeMethod})`
                          : "Not available on this platform"
                        }
                      </span>
                    </div>
                    <div className="space-y-1 text-[10px] text-zinc-500">
                      <p>Last attempt: {formatTimestamp(notifSettings.channelHealth.native.lastAttemptAt)}</p>
                      <p>Last success: {formatTimestamp(notifSettings.channelHealth.native.lastSuccessAt)}</p>
                      {notifSettings.channelHealth.native.lastFailureAt && (
                        <p className="text-amber-500">Last failure: {formatTimestamp(notifSettings.channelHealth.native.lastFailureAt)}</p>
                      )}
                    </div>
                    <TestButton
                      channel="native"
                      testing={testingChannel === "native"}
                      result={testResult?.channel === "native" ? testResult : null}
                      onTest={() => testNotification("native")}
                    />
                  </div>

                  {/* ── Telegram Channel ──────────────────────────────── */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✈️</span>
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Telegram</h3>
                      </div>
                      <ToggleSwitch
                        enabled={notifSettings.telegramEnabled}
                        onToggle={() => toggleSetting("telegram_enabled", notifSettings.telegramEnabled)}
                        small
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Send alerts to a Telegram chat via bot. Works anywhere — phone, desktop, web.
                    </p>

                    {/* Status */}
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-2 w-2 rounded-full ${notifSettings.telegramConfigured ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      <span className="text-zinc-500">
                        {notifSettings.telegramConfigured
                          ? `Configured (${notifSettings.telegramSource === "env" ? "from .env" : "from settings"})`
                          : "Not configured"
                        }
                      </span>
                    </div>
                    <div className="space-y-1 text-[10px] text-zinc-500">
                      <p>Last attempt: {formatTimestamp(notifSettings.channelHealth.telegram.lastAttemptAt)}</p>
                      <p>Last success: {formatTimestamp(notifSettings.channelHealth.telegram.lastSuccessAt)}</p>
                      {notifSettings.channelHealth.telegram.lastFailureAt && (
                        <p className="text-amber-500">
                          Last failure: {formatTimestamp(notifSettings.channelHealth.telegram.lastFailureAt)}
                          {notifSettings.channelHealth.telegram.lastError ? ` — ${notifSettings.channelHealth.telegram.lastError}` : ""}
                        </p>
                      )}
                    </div>

                    {/* Credentials form */}
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-1">Bot Token</label>
                        {notifSettings.telegramEnvBotToken ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/40 px-3 py-2 text-[11px] font-mono text-zinc-500 truncate">
                              {notifSettings.telegramBotTokenMasked}
                            </div>
                            <span className="text-[9px] bg-sky-500/10 text-sky-500 dark:text-sky-400 rounded px-1.5 py-0.5 font-medium shrink-0">.env</span>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type={showToken ? "text" : "password"}
                              value={telegramToken}
                              onChange={(e) => setTelegramToken(e.target.value)}
                              placeholder={notifSettings.telegramBotTokenFromDb ? notifSettings.telegramBotTokenMasked ?? "Saved •••" : "7123456789:AAF..."}
                              className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/50 px-3 py-2 pr-9 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-sky-500/50 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
                              title={showToken ? "Hide" : "Show"}
                            >
                              {showToken ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                  <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l10.5 10.5a.75.75 0 1 0 1.06-1.06l-1.527-1.527A7.942 7.942 0 0 0 15.587 8 7.925 7.925 0 0 0 8 3.5a7.897 7.897 0 0 0-3.19.67L3.28 2.22ZM8 5.5a2.5 2.5 0 0 1 2.318 1.568L7.568 10.318A2.5 2.5 0 0 1 8 5.5Z" />
                                  <path d="M.413 8A7.924 7.924 0 0 0 5.7 12.006l-1.225 1.225a.75.75 0 1 0 1.06 1.06l1.527-1.527A7.94 7.94 0 0 0 8 12.5 7.925 7.925 0 0 0 15.587 8a7.942 7.942 0 0 0-.838-1.64l1.032-1.032a.75.75 0 0 0-1.06-1.06L13.5 5.488A7.925 7.925 0 0 0 .413 8Z" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                                  <path fillRule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.238.006.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-1">Chat ID</label>
                        {notifSettings.telegramEnvChatId ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/40 px-3 py-2 text-[11px] font-mono text-zinc-500">
                              {notifSettings.telegramChatId}
                            </div>
                            <span className="text-[9px] bg-sky-500/10 text-sky-500 dark:text-sky-400 rounded px-1.5 py-0.5 font-medium shrink-0">.env</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={telegramChatId}
                            onChange={(e) => setTelegramChatId(e.target.value)}
                            placeholder={notifSettings.telegramChatIdFromDb ?? "-1001234567890"}
                            className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/50 px-3 py-2 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-sky-500/50 transition-colors"
                          />
                        )}
                      </div>

                      {/* Save + message */}
                      {!notifSettings.telegramEnvBotToken && (
                        <button
                          onClick={saveTelegramCreds}
                          disabled={savingSettings || (!telegramToken.trim() && !telegramChatId.trim())}
                          className="w-full rounded-lg px-3 py-2 text-[11px] font-medium bg-sky-500/10 text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingSettings ? "Validating & saving…" : "Save Credentials"}
                        </button>
                      )}

                      {settingsMsg && (
                        <p className={`text-[11px] ${settingsMsg.type === "success" ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                          {settingsMsg.text}
                        </p>
                      )}

                      {/* Info about env vars */}
                      {(notifSettings.telegramEnvBotToken || notifSettings.telegramEnvChatId) && (
                        <p className="text-[10px] text-zinc-500 flex items-start gap-1.5 leading-relaxed">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-sky-500 dark:text-sky-400 shrink-0 mt-0.5">
                            <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-6 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM8 3a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4A.75.75 0 0 1 8 3Z" clipRule="evenodd" />
                          </svg>
                          Values loaded from environment variables (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Remove from .env.local to configure here instead.
                        </p>
                      )}
                    </div>

                    <TestButton
                      channel="telegram"
                      testing={testingChannel === "telegram"}
                      result={testResult?.channel === "telegram" ? testResult : null}
                      onTest={() => testNotification("telegram")}
                      disabled={!notifSettings.telegramConfigured}
                    />
                  </div>
                </div>

                {/* ── Quiet Hours ──────────────────────────────────────── */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Quiet Hours</h3>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Suppress delivery during these hours. Events are still recorded and visible in the bell dropdown.
                      </p>
                    </div>
                    <ToggleSwitch
                      enabled={notifSettings.quietHoursEnabled}
                      onToggle={() => toggleSetting("quiet_hours_enabled", notifSettings.quietHoursEnabled)}
                      small
                    />
                  </div>

                  {notifSettings.quietHoursEnabled && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">From</span>
                      <input
                        type="time"
                        defaultValue={notifSettings.quietHoursStart}
                        onBlur={(e) => {
                          void patchSettings({ quiet_hours_start: e.target.value }).catch(() => {});
                        }}
                        className="rounded-lg bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/50 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:border-sky-500/50"
                      />
                      <span className="text-xs text-zinc-500">to</span>
                      <input
                        type="time"
                        defaultValue={notifSettings.quietHoursEnd}
                        onBlur={(e) => {
                          void patchSettings({ quiet_hours_end: e.target.value }).catch(() => {});
                        }}
                        className="rounded-lg bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/50 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:border-sky-500/50"
                      />
                    </div>
                  )}
                </div>

                {/* ── Alert Thresholds ─────────────────────────────────── */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Alert When Remaining Drops To</h3>
                  <p className="text-[11px] text-zinc-500 mb-4">
                    Get notified when quota remaining falls to these levels. 0% = fully depleted alarm.
                  </p>
                  <div className="flex items-center gap-2">
                    {[
                      { value: 15, label: "15%", severity: "warning" },
                      { value: 10, label: "10%", severity: "warning" },
                      { value: 5,  label: "5%",  severity: "critical" },
                      { value: 0,  label: "0% (depleted)", severity: "exhausted" },
                    ].map(({ value, label, severity }) => {
                      const active = notifSettings.defaultThresholds.includes(value);
                      return (
                        <button
                          key={value}
                          onClick={() => {
                            const newThresholds = active
                              ? notifSettings.defaultThresholds.filter((x) => x !== value)
                              : [...notifSettings.defaultThresholds, value].sort((a, b) => b - a);
                            void patchSettings({ default_thresholds: newThresholds }).catch(() => {});
                          }}
                          className={`rounded-lg px-4 py-2 text-sm font-mono font-medium border transition-colors ${
                            active
                              ? severity === "exhausted"
                                ? "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20"
                                : severity === "critical"
                                  ? "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/20"
                                  : "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20"
                              : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border-zinc-300 dark:border-zinc-700/40 hover:border-zinc-400 dark:hover:border-zinc-600"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Repeat Depleted Alerts (Optional)</h3>
                  <p className="text-[11px] text-zinc-500 mb-4">
                    By default the first depleted alert fires once, then the app stays quiet and keeps checking for recovery in the background. Turn this on only if you want repeated depleted reminders too.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {EXHAUSTED_REMINDER_OPTIONS.map(({ value, label }) => {
                      const active = notifSettings.exhaustedReminderMins === value;
                      return (
                        <button
                          key={value}
                          onClick={() => {
                            void patchSettings({ exhausted_reminder_mins: value }).catch(() => {});
                          }}
                          className={`rounded-lg px-4 py-2 text-sm font-mono font-medium border transition-colors ${
                            active
                              ? "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20"
                              : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border-zinc-300 dark:border-zinc-700/40 hover:border-zinc-400 dark:hover:border-zinc-600"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── How It Works ─────────────────────────────────────── */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 p-6">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">How Notifications Work</h3>
                  <div className="grid gap-3 md:grid-cols-2 text-[11px] text-zinc-500 leading-relaxed">
                    <div className="flex gap-2">
                      <span className="text-base">📊</span>
                      <p>Every quota refresh compares old vs. new remaining %. Each notification shows <strong>both</strong> 5-hour and Weekly status.</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base">⚠️</span>
                      <p>Alerts fire when remaining drops below your thresholds (15%, 10%, 5%). Warning and critical levels still fire once per cycle.</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base">🚨</span>
                      <p>When a quota hits 0% remaining, you get one <strong>alarm-level</strong> alert. After that, the app checks depleted accounts in the background and alerts again when quota returns.</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base">✅</span>
                      <p>When usage drops from ≥90% to below 50%, a reset notification fires so you know you&apos;re back at full capacity, even if the account was not marked as in use.</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            LOGS TAB
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "logs" && (
          <>
            {/* Stats bar */}
            {stats && (
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-500 font-mono">{stats.total} total</span>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                {ALL_LEVELS.map((lvl) => (
                  <span key={lvl} className="flex items-center gap-1">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${LEVEL_CONFIG[lvl].dot}`} />
                    <span className={LEVEL_CONFIG[lvl].text}>{stats.byLevel[lvl] ?? 0}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Level pills */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-600 uppercase tracking-wider mr-1">Level</span>
                {ALL_LEVELS.map((lvl) => {
                  const active = levelFilter === lvl;
                  const cfg = LEVEL_CONFIG[lvl];
                  return (
                    <button
                      key={lvl}
                      onClick={() => setLevelFilter(active ? null : lvl)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                        active
                          ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                          : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border-zinc-300 dark:border-zinc-700/40 hover:text-zinc-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              <span className="text-zinc-300 dark:text-zinc-700">·</span>

              {/* Category pills */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-600 uppercase tracking-wider mr-1">Cat</span>
                {ALL_CATEGORIES.map((cat) => {
                  const active = categoryFilter === cat;
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(active ? null : cat)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                        active
                          ? `bg-zinc-200 dark:bg-zinc-100 text-zinc-900 border-zinc-400 dark:border-zinc-300`
                          : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 border-zinc-300 dark:border-zinc-700/40 hover:text-zinc-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              <span className="text-zinc-300 dark:text-zinc-700">·</span>

              {/* Search */}
              <div className="relative">
                <label htmlFor="logs-search" className="sr-only">
                  Search logs
                </label>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 dark:text-zinc-600 pointer-events-none" aria-hidden="true">
                  <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                </svg>
                <input
                  id="logs-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search logs…"
                  aria-label="Search logs"
                  className="w-48 rounded-md bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-300 dark:border-zinc-700/40 pl-7 pr-3 py-1 text-[11px] text-zinc-800 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    aria-label="Clear log search"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Active filter clear */}
              {(levelFilter || categoryFilter || search) && (
                <button
                  onClick={() => { setLevelFilter(null); setCategoryFilter(null); setSearch(""); }}
                  className="text-[11px] text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400 transition-colors"
                >
                  Clear all ×
                </button>
              )}
            </div>

            {/* Log table */}
            <div
              ref={scrollRef}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 overflow-hidden"
            >
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-600 dark:border-t-zinc-400" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <p className="text-sm text-zinc-500">No logs yet</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1">Logs will appear when you refresh quota, sign in, or manage accounts</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40">
                  {logs.map((entry) => (
                    <LogRow
                      key={entry.id}
                      entry={entry}
                      expanded={expandedIds.has(entry.id)}
                      onToggle={() => toggleExpand(entry.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            DATA TAB
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "data" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Export Accounts</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Download all account data as a JSON file for backup or migration.</p>
              <a
                href="/api/accounts/export"
                download
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-xs font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                Export JSON
              </a>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Import Accounts</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Upload a previously exported JSON file to restore or merge accounts.</p>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImporting(true);
                  setImportResult(null);
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const res = await fetch("/api/accounts/import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    const result = await res.json();
                    if (res.ok) {
                      setImportResult(`Successfully imported ${result.imported} account(s).`);
                    } else {
                      setImportResult(`Error: ${result.error || "Unknown error"}`);
                    }
                  } catch {
                    setImportResult("Error: Invalid JSON file.");
                  } finally {
                    setImporting(false);
                    if (importFileRef.current) importFileRef.current.value = "";
                  }
                }}
              />
              <button
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                {importing ? "Importing…" : "Import JSON"}
              </button>
              {importResult && (
                <p className={`mt-3 text-xs ${importResult.startsWith("Error") ? "text-red-500" : "text-emerald-500"}`}>
                  {importResult}
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmClear(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-logs-title"
            className="rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-2xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="clear-logs-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Clear all logs?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
              {stats?.total ?? 0} log entries will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-red-500/15 text-red-500 dark:text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle Switch Component ─────────────────────────────────────────────────

function ToggleSwitch({ enabled, onToggle, small }: { enabled: boolean; onToggle: () => void; small?: boolean }) {
  const size = small ? "h-5 w-9" : "h-6 w-11";
  const dotSize = small ? "h-3.5 w-3.5" : "h-4 w-4";
  const translate = small ? (enabled ? "translate-x-4" : "translate-x-0.5") : (enabled ? "translate-x-5" : "translate-x-0.5");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex shrink-0 ${size} items-center rounded-full transition-colors motion-reduce:transition-none ${
        enabled ? "bg-sky-500" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block ${dotSize} rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${translate}`}
      />
    </button>
  );
}

// ─── Test Button Component ───────────────────────────────────────────────────

function TestButton({
  channel,
  testing,
  result,
  onTest,
  disabled,
}: {
  channel: string;
  testing: boolean;
  result: { success: boolean; text: string } | null;
  onTest: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={onTest}
        disabled={testing || disabled}
        className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 border border-zinc-300 dark:border-zinc-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {testing ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-400 border-t-zinc-200" />
            Testing…
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M3.75 2a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 3.75 2Zm8.03 2.22a.75.75 0 0 0-1.06 0L6.97 8l3.75 3.78a.75.75 0 0 0 1.06-1.06L8.81 8l2.97-2.72a.75.75 0 0 0 0-1.06Z" />
            </svg>
            Test {channel.charAt(0).toUpperCase() + channel.slice(1)}
          </>
        )}
      </button>
      {result && (
        <p className={`text-[10px] text-center ${result.success ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
          {result.success ? "✓" : "✗"} {result.text}
        </p>
      )}
    </div>
  );
}

// ─── Individual Log Row ──────────────────────────────────────────────────────

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lvl = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.info;
  const cat = CATEGORY_CONFIG[entry.category as LogCategory] ?? CATEGORY_CONFIG.system;

  const ts = new Date(entry.timestamp);
  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const hasDetail = Boolean(entry.detail);

  // Try to pretty-format detail
  let detailContent = entry.detail ?? "";
  try {
    const parsed = JSON.parse(detailContent);
    detailContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Already a string, keep as-is
  }

  return (
    <div className={`group ${lvl.bg} transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-start gap-3"
      >
        {/* Timestamp column */}
        <div className="shrink-0 w-28 font-mono text-[11px] text-zinc-400 dark:text-zinc-500 pt-0.5">
          <span className="text-zinc-400 dark:text-zinc-600">{dateStr}</span>{" "}
          <span>{timeStr}</span>
        </div>

        {/* Level badge */}
        <span className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider border ${lvl.bg} ${lvl.text} ${lvl.border}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${lvl.dot}`} />
          {lvl.label}
        </span>

        {/* Category */}
        <span className={`shrink-0 text-[11px] font-medium w-20 ${cat.color}`}>
          {cat.label}
        </span>

        {/* Message */}
        <span className="flex-1 text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {entry.message}
        </span>

        {/* Account email tag */}
        {entry.accountEmail && (
          <span className="shrink-0 text-[10px] font-mono text-zinc-500 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800/80 rounded px-1.5 py-0.5">
            {entry.accountEmail}
          </span>
        )}

        {/* Duration */}
        {entry.durationMs != null && (
          <span className="shrink-0 text-[10px] font-mono text-zinc-500 dark:text-zinc-600">
            {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Expand icon */}
        {hasDetail && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`shrink-0 h-3 w-3 text-zinc-400 dark:text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="px-4 pb-3 pt-0 ml-32">
          <pre className="text-[11px] font-mono text-zinc-500 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
            {detailContent}
          </pre>
        </div>
      )}
    </div>
  );
}
