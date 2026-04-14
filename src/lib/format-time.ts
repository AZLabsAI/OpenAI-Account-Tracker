/**
 * Shared relative-time formatting for quota timestamps (ISO strings).
 */

/** Compact label for quota header — e.g. "5m ago", "3h ago", or short date. */
export function formatQuotaFetchedLabel(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Detailed "last fetched" line — includes minutes within the hour. */
export function formatLastFetchedAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface CalendarFormatOptions {
  now?: Date;
  timeZone?: string;
  includeTimeZoneName?: boolean;
}

function getCalendarDateParts(date: Date, timeZone?: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const year = Number(formatter.formatToParts(date).find((part) => part.type === "year")?.value);
  const month = Number(formatter.formatToParts(date).find((part) => part.type === "month")?.value);
  const day = Number(formatter.formatToParts(date).find((part) => part.type === "day")?.value);

  return { year, month, day };
}

function normalizeTimeZoneName(timeZoneName: string | undefined, timeZone?: string) {
  if (!timeZoneName) return "";
  if (timeZone === "Africa/Johannesburg" && timeZoneName === "GMT+2") {
    return "SAST";
  }
  return timeZoneName;
}

export function formatCompactWeekdayDateTime(
  isoStr: string,
  options: CalendarFormatOptions = {},
): string | null {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: options.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(options.includeTimeZoneName ? { timeZoneName: "short" as const } : {}),
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;
  const timeZoneName = normalizeTimeZoneName(
    parts.find((part) => part.type === "timeZoneName")?.value,
    options.timeZone,
  );

  if (!weekday || !month || !day || !hour || !minute || !dayPeriod) return null;

  return `${weekday}, ${month} ${day} · ${hour}:${minute} ${dayPeriod}${timeZoneName ? ` ${timeZoneName}` : ""}`;
}

export function formatWholeDaysAgo(
  isoStr: string,
  options: CalendarFormatOptions = {},
): string | null {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return null;

  const now = options.now ?? new Date();
  const currentParts = getCalendarDateParts(now, options.timeZone);
  const targetParts = getCalendarDateParts(date, options.timeZone);
  const currentIndex = Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day);
  const targetIndex = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const days = Math.max(0, Math.round((currentIndex - targetIndex) / 86_400_000));

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function isFutureIsoTime(
  isoStr: string,
  options: Pick<CalendarFormatOptions, "now"> = {},
): boolean | null {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return null;
  const now = options.now ?? new Date();
  return date.getTime() > now.getTime();
}
