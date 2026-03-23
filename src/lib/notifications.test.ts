import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, NotificationEvent, NotificationSettings, QuotaData } from "@/types";

const {
  getLatestUnresolvedEvent,
  hasUnresolvedEvent,
  insertNotificationEvent,
  markNotificationDelivered,
  getNotificationSettings,
  isQuietHours,
  getTelegramCredentials,
  sendTelegram,
  sendNative,
  logInfo,
  logSuccess,
  logWarn,
} = vi.hoisted(() => ({
  getLatestUnresolvedEvent: vi.fn(),
  hasUnresolvedEvent: vi.fn(),
  insertNotificationEvent: vi.fn(),
  markNotificationDelivered: vi.fn(),
  getNotificationSettings: vi.fn(),
  isQuietHours: vi.fn(),
  getTelegramCredentials: vi.fn(),
  sendTelegram: vi.fn(),
  sendNative: vi.fn(),
  logInfo: vi.fn(),
  logSuccess: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("./db", () => ({
  getLatestUnresolvedEvent,
  hasUnresolvedEvent,
  insertNotificationEvent,
  markNotificationDelivered,
}));

vi.mock("./notify-settings", () => ({
  getNotificationSettings,
  isQuietHours,
  getTelegramCredentials,
}));

vi.mock("./notify-telegram", () => ({
  sendTelegram,
}));

vi.mock("./notify-native", () => ({
  sendNative,
}));

vi.mock("./logger", () => ({
  logInfo,
  logSuccess,
  logWarn,
}));

import { detectTransitions, processTransitions } from "./notifications";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_notify",
    name: "Notify Account",
    email: "notify@example.com",
    subscription: "ChatGPT Plus",
    expirationDate: "2026-04-01",
    usageLimits: [],
    ...overrides,
  };
}

function makeQuotaData(primaryUsed: number | null, secondaryUsed: number | null): QuotaData {
  return {
    fetchedAt: "2026-03-19T12:00:00.000Z",
    email: "notify@example.com",
    primary: primaryUsed === null ? null : {
      usedPercent: primaryUsed,
      resetsAt: 1_800_000_000,
      windowDurationSecs: 18_000,
    },
    secondary: secondaryUsed === null ? null : {
      usedPercent: secondaryUsed,
      resetsAt: 1_800_500_000,
      windowDurationSecs: 604_800,
    },
  };
}

function makeEvent(id = 1): NotificationEvent {
  return {
    id,
    accountId: "acc_notify",
    eventType: "quota_exhausted",
    window: "primary",
    usedPercent: 100,
    message: "depleted",
    createdAt: "2026-03-19T12:00:00.000Z",
    acknowledged: false,
    deliveredWeb: false,
    deliveredNative: false,
    deliveredTelegram: false,
    telegramMessageId: null,
  };
}

function makeSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    notificationsEnabled: true,
    webEnabled: true,
    nativeEnabled: true,
    telegramEnabled: true,
    telegramConfigured: true,
    telegramSource: "db",
    telegramBotTokenMasked: null,
    telegramChatId: "123",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    defaultThresholds: [15, 10, 5, 0],
    exhaustedReminderMins: 0,
    ...overrides,
  };
}

describe("notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00.000Z"));
    getLatestUnresolvedEvent.mockReset();
    hasUnresolvedEvent.mockReset();
    insertNotificationEvent.mockReset();
    markNotificationDelivered.mockReset();
    getNotificationSettings.mockReset();
    isQuietHours.mockReset();
    getTelegramCredentials.mockReset();
    sendTelegram.mockReset();
    sendNative.mockReset();
    logInfo.mockReset();
    logSuccess.mockReset();
    logWarn.mockReset();

    hasUnresolvedEvent.mockReturnValue(false);
    insertNotificationEvent.mockImplementation(() => makeEvent());
    getNotificationSettings.mockReturnValue(makeSettings());
    isQuietHours.mockReturnValue(false);
    getTelegramCredentials.mockReturnValue({ botToken: "token", chatId: "chat" });
    sendNative.mockReturnValue({ success: true, method: "terminal-notifier" });
    sendTelegram.mockResolvedValue({ success: true, messageId: 123, attempts: 1, statusCode: 200 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only the highest-severity threshold crossed per window", () => {
    const transitions = detectTransitions(
      makeAccount(),
      makeQuotaData(80, 20),
      makeQuotaData(96, 20),
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      eventType: "quota_critical",
      triggerWindow: "primary",
      remainingPercent: 4,
    });
  });

  it("detects reset transitions independently from threshold alerts", () => {
    const transitions = detectTransitions(
      makeAccount(),
      makeQuotaData(92, 20),
      makeQuotaData(40, 20),
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.eventType).toBe("quota_reset");
  });

  it("gates exhausted reminders on unresolved events and cooldown", () => {
    const account = makeAccount();
    const quota = makeQuotaData(100, 20);

    getLatestUnresolvedEvent.mockReturnValue(null);
    expect(detectTransitions(account, quota, quota, [15, 10, 5, 0], 240)).toHaveLength(0);

    getLatestUnresolvedEvent.mockReturnValue({ id: 1, createdAt: "2026-03-19T10:30:00.000Z" });
    expect(detectTransitions(account, quota, quota, [15, 10, 5, 0], 240)).toHaveLength(0);

    getLatestUnresolvedEvent.mockReturnValue({ id: 1, createdAt: "2026-03-19T07:00:00.000Z" });
    const transitions = detectTransitions(account, quota, quota, [15, 10, 5, 0], 240);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      eventType: "quota_exhausted",
      triggerWindow: "primary",
      remainingPercent: 0,
      isReminder: true,
    });
  });

  it("does not emit exhausted reminders when repeat reminders are disabled", () => {
    const account = makeAccount();
    const quota = makeQuotaData(100, 20);

    getLatestUnresolvedEvent.mockReturnValue({ id: 1, createdAt: "2026-03-19T07:00:00.000Z" });

    expect(detectTransitions(account, quota, quota, [15, 10, 5, 0], 0)).toHaveLength(0);
  });

  it("honors delivery channel toggles", async () => {
    getNotificationSettings.mockReturnValue(makeSettings({ nativeEnabled: false, telegramEnabled: true }));

    await processTransitions(makeAccount(), [{
      eventType: "quota_warning" as const,
      triggerWindow: "primary" as const,
      quota: makeQuotaData(90, 20),
      remainingPercent: 10,
      message: "warning",
    }]);

    expect(sendNative).not.toHaveBeenCalled();
    expect(sendTelegram).toHaveBeenCalledTimes(1);
  });

  it("records but does not deliver during quiet hours", async () => {
    isQuietHours.mockReturnValue(true);

    await processTransitions(makeAccount(), [{
      eventType: "quota_warning" as const,
      triggerWindow: "primary" as const,
      quota: makeQuotaData(90, 20),
      remainingPercent: 10,
      message: "warning",
    }]);

    expect(sendNative).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("Quiet hours active"),
    );
    expect(logInfo).toHaveBeenCalledWith(
      "notification",
      expect.stringContaining("Delivery skipped during quiet hours"),
      expect.objectContaining({
        detail: expect.objectContaining({
          outcome: "skipped",
          reason: "quiet_hours",
        }),
      }),
    );
  });

  it("logs successful telegram delivery metadata", async () => {
    sendTelegram.mockResolvedValue({ success: true, messageId: 321, attempts: 2, statusCode: 200 });

    await processTransitions(makeAccount(), [{
      eventType: "quota_exhausted" as const,
      triggerWindow: "primary" as const,
      quota: makeQuotaData(100, 20),
      remainingPercent: 0,
      message: "depleted",
    }]);

    expect(markNotificationDelivered).toHaveBeenCalledWith(1, "telegram", 321);
    expect(logSuccess).toHaveBeenCalledWith(
      "notification",
      expect.stringContaining("Delivered quota_exhausted via Telegram"),
      expect.objectContaining({
        detail: expect.objectContaining({
          channel: "telegram",
          outcome: "success",
          attempts: 2,
          statusCode: 200,
        }),
        durationMs: expect.any(Number),
      }),
    );
  });

  it("logs non-retryable telegram failures without marking delivery", async () => {
    sendTelegram.mockResolvedValue({
      success: false,
      error: "chat not found",
      transient: false,
      attempts: 1,
      statusCode: 400,
    });

    await processTransitions(makeAccount(), [{
      eventType: "quota_exhausted" as const,
      triggerWindow: "primary" as const,
      quota: makeQuotaData(100, 20),
      remainingPercent: 0,
      message: "depleted",
    }]);

    expect(markNotificationDelivered).not.toHaveBeenCalledWith(1, "telegram", expect.anything());
    expect(logWarn).toHaveBeenCalledWith(
      "notification",
      expect.stringContaining("Telegram delivery failed for quota_exhausted"),
      expect.objectContaining({
        detail: expect.objectContaining({
          channel: "telegram",
          outcome: "failure",
          reason: "non_retryable_failure",
          attempts: 1,
          statusCode: 400,
        }),
        durationMs: expect.any(Number),
      }),
    );
  });
});
