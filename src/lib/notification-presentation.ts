import type { NotificationEventType, QuotaData } from "@/types";

export type NotificationChannel = "web" | "native" | "telegram";

export interface NotificationPreview {
  id?: number;
  eventType: NotificationEventType;
  message: string;
}

export interface NotificationUiMeta {
  emoji: string;
  label: string;
  color: string;
  webTitle: string;
}

export interface NotificationRenderContext {
  eventType: NotificationEventType;
  accountName: string;
  accountEmail?: string;
  triggerWindow?: "primary" | "secondary" | null;
  remainingPercent?: number;
  quota?: QuotaData;
  previousName?: string;
  timestampLabel?: string;
}

const UI_META: Record<NotificationEventType, NotificationUiMeta> = {
  quota_exhausted: { emoji: "⛔", color: "text-red-400", label: "Exhausted", webTitle: "⛔ Quota Depleted" },
  quota_critical: { emoji: "🔴", color: "text-orange-400", label: "Critical", webTitle: "🔴 Quota Critical" },
  quota_warning: { emoji: "⚠️", color: "text-amber-400", label: "Warning", webTitle: "⚠️ Quota Warning" },
  quota_reset: { emoji: "✅", color: "text-emerald-400", label: "Replenished", webTitle: "✅ Quota Replenished" },
  account_switch: { emoji: "🔄", color: "text-blue-400", label: "Switch", webTitle: "🔄 Account Switched" },
};

function windowLabel(windowKey: "primary" | "secondary" | null | undefined): string {
  return windowKey === "primary" ? "5-hour" : "Weekly";
}

function formatTimeUntil(resetsAtUnix: number | null | undefined): string {
  if (!resetsAtUnix) return "unknown";
  const ms = resetsAtUnix * 1000 - Date.now();
  if (ms <= 0) return "any moment";
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remainMins}m`;
  return `${mins}m`;
}

function fmtWindow(label: string, usedPercent: number | null | undefined): string {
  if (usedPercent == null) return `${label}: no data`;
  const used = Math.round(usedPercent);
  const left = Math.round(100 - usedPercent);
  if (used >= 100) return `${label}: DEPLETED`;
  return `${label}: ${used}% used (${left}% left)`;
}

function bothWindowsSummary(quota?: QuotaData): string {
  if (!quota) return "5-hour: no data · Weekly: no data";
  return `${fmtWindow("5-hour", quota.primary?.usedPercent)} · ${fmtWindow("Weekly", quota.secondary?.usedPercent)}`;
}

function quotaLines(quota?: QuotaData) {
  return {
    fiveHour: fmtWindow("5-hour", quota?.primary?.usedPercent),
    weekly: fmtWindow("Weekly", quota?.secondary?.usedPercent),
  };
}

function resetWindowFor(context: NotificationRenderContext) {
  if (!context.quota || !context.triggerWindow) return undefined;
  return context.triggerWindow === "primary" ? context.quota.primary : context.quota.secondary;
}

export function getNotificationUiMeta(eventType: NotificationEventType): NotificationUiMeta {
  return UI_META[eventType];
}

export function buildWebNotificationPayload(preview: NotificationPreview) {
  return {
    title: getNotificationUiMeta(preview.eventType).webTitle,
    body: preview.message,
    tag: `oat-${preview.eventType}-${preview.id ?? Date.now()}`,
  };
}

export function renderNativeNotification(context: NotificationRenderContext): { title: string; message: string } {
  const targetWindow = resetWindowFor(context);
  const resetsIn = formatTimeUntil(targetWindow?.resetsAt);
  const summary = bothWindowsSummary(context.quota);

  switch (context.eventType) {
    case "quota_exhausted": {
      const lines = [`${windowLabel(context.triggerWindow)} quota is DEPLETED!`];
      if (context.triggerWindow === "primary" && context.quota?.secondary) {
        lines.push(`Weekly: ${Math.round(100 - context.quota.secondary.usedPercent)}% left`);
      } else if (context.triggerWindow === "secondary" && context.quota?.primary) {
        lines.push(`5-hour: ${Math.round(100 - context.quota.primary.usedPercent)}% left`);
      }
      lines.push(`Resets in ${resetsIn}`);
      return {
        title: `🚨 DEPLETED — ${context.accountName}`,
        message: lines.join("\n"),
      };
    }
    case "quota_reset":
      return {
        title: `✅ Replenished — ${context.accountName}`,
        message: `${windowLabel(context.triggerWindow)} quota replenished.\n${context.remainingPercent ?? 0}% remaining.\n${summary}`,
      };
    case "quota_critical":
      return {
        title: `🔴 Critical — ${context.accountName}`,
        message: `${summary}\nResets in ${resetsIn}`,
      };
    case "quota_warning":
      return {
        title: `⚠️ Warning — ${context.accountName}`,
        message: `${summary}\nResets in ${resetsIn}`,
      };
    case "account_switch":
      return {
        title: "🔄 Account Switched",
        message: `Now using: ${context.accountName}${context.previousName ? `\nWas: ${context.previousName}` : ""}`,
      };
  }
}

export function renderTelegramNotification(context: NotificationRenderContext): string {
  const now = context.timestampLabel ?? new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const { fiveHour, weekly } = quotaLines(context.quota);
  const targetWindow = resetWindowFor(context);
  const resetsIn = formatTimeUntil(targetWindow?.resetsAt);

  switch (context.eventType) {
    case "quota_exhausted":
      return `🚨🚨🚨 *QUOTA DEPLETED*
━━━━━━━━━━━━━━━━
*${context.accountName}*
${windowLabel(context.triggerWindow)} quota is completely exhausted!

📊 ${fiveHour}
📊 ${weekly}
⏱ Resets in ${resetsIn}

📧 ${context.accountEmail ?? "unknown"}
🕐 ${now}`;
    case "quota_reset":
      return `✅ *QUOTA REPLENISHED — ${context.accountName}*
━━━━━━━━━━━━━━━━
${windowLabel(context.triggerWindow)} quota replenished.
${context.remainingPercent ?? 0}% remaining

📊 ${fiveHour}
📊 ${weekly}
⏱ Resets in ${resetsIn}

📧 ${context.accountEmail ?? "unknown"}
🕐 ${now}`;
    case "quota_critical":
    case "quota_warning": {
      const heading = context.eventType === "quota_critical" ? "🔴 *CRITICAL" : "⚠️ *WARNING";
      return `${heading} — ${context.accountName}*
━━━━━━━━━━━━━━━━
${context.remainingPercent ?? 0}% ${windowLabel(context.triggerWindow)} remaining

📊 ${fiveHour}
📊 ${weekly}
⏱ Resets in ${resetsIn}

📧 ${context.accountEmail ?? "unknown"}
🕐 ${now}`;
    }
    case "account_switch":
      return `🔄 *Active Codex Account Changed*
━━━━━━━━━━━━━━━━
Now: *${context.accountName}*${context.accountEmail ? ` (${context.accountEmail})` : ""}${context.previousName ? `\nWas: ${context.previousName}` : ""}

🕐 ${now}`;
  }
}
