"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Account, QuotaData } from "@/types";
import { getSortedAccounts } from "@/data/accounts";
import type { NotificationPreview } from "@/lib/notification-presentation";

export function applyNotificationPreviews(
  notifications: NotificationPreview[] | undefined,
  fireWebNotification: (event: NotificationPreview) => void,
) {
  if (!notifications?.length) return;
  for (const notification of notifications) {
    fireWebNotification(notification);
  }
}

export const DEPLETED_RECOVERY_WATCH_INTERVAL_MINS = 15;
export const DEPLETED_RECOVERY_NEAR_RESET_INTERVAL_MINS = 1;
export const DEPLETED_RECOVERY_NEAR_RESET_THRESHOLD_MINS = 10;

export function getRecoveryWatchRefreshIntervalMins(
  account: Pick<Account, "codexHomePath" | "quotaData">,
  now = Date.now(),
): number | null {
  if (!account.codexHomePath || !account.quotaData) return null;

  const depletedWindows = [account.quotaData.primary, account.quotaData.secondary]
    .filter((window): window is NonNullable<QuotaData["primary"]> => Boolean(window && window.usedPercent >= 100));

  if (depletedWindows.length === 0) return null;

  const minutesUntilReset = depletedWindows
    .map((window) => {
      if (!window.resetsAt) return null;
      return Math.ceil((window.resetsAt * 1000 - now) / 60_000);
    })
    .filter((mins): mins is number => mins !== null);

  if (minutesUntilReset.some((mins) => mins <= DEPLETED_RECOVERY_NEAR_RESET_THRESHOLD_MINS)) {
    return DEPLETED_RECOVERY_NEAR_RESET_INTERVAL_MINS;
  }

  return DEPLETED_RECOVERY_WATCH_INTERVAL_MINS;
}

export function getEffectiveRefreshIntervalMins(
  account: Pick<Account, "codexHomePath" | "quotaData" | "refreshIntervalMins">,
  now = Date.now(),
): number | null {
  if (!account.codexHomePath) return null;

  const intervals = [
    account.refreshIntervalMins ?? null,
    getRecoveryWatchRefreshIntervalMins(account, now),
  ].filter((value): value is number => value != null && value > 0);

  if (intervals.length === 0) return null;
  return Math.min(...intervals);
}

export type LoginState = "idle" | "waiting" | "success" | "error";
export type QuotaState = "idle" | "loading" | "error";

type RefreshSource = "manual" | "auto" | "refresh-all";
type RefreshResult = "success" | "error" | "stale";

type LoginResponse = {
  success?: boolean;
  error?: string;
  codexHomePath?: string;
  quotaData?: QuotaData;
  notifications?: NotificationPreview[];
};

type QuotaResponse = QuotaData & {
  error?: string;
  notifications?: NotificationPreview[];
  demoted?: boolean;
};

interface Options {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  emitLog: (level: string, category: string, message: string, extra?: Record<string, unknown>) => void;
  fireWebNotification: (event: NotificationPreview) => void;
}

function updateRecord<T>(prev: Record<string, T>, id: string, value: T) {
  return { ...prev, [id]: value };
}

export function useAccountRefreshController({
  accounts,
  setAccounts,
  emitLog,
  fireWebNotification,
}: Options) {
  const [loginStates, setLoginStates] = useState<Record<string, LoginState>>({});
  const [loginErrors, setLoginErrors] = useState<Record<string, string | null>>({});
  const [quotaStates, setQuotaStates] = useState<Record<string, QuotaState>>({});
  const [quotaErrors, setQuotaErrors] = useState<Record<string, string | null>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);

  const accountsRef = useRef(accounts);
  const requestIdsRef = useRef<Map<string, number>>(new Map());
  const inflightRefreshesRef = useRef<Map<string, Promise<RefreshResult>>>(new Map());
  const loginResetTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    const loginResetTimers = loginResetTimersRef.current;
    return () => {
      for (const timer of loginResetTimers.values()) {
        clearTimeout(timer);
      }
      loginResetTimers.clear();
    };
  }, []);

  const beginRequest = useCallback((id: string) => {
    const nextId = (requestIdsRef.current.get(id) ?? 0) + 1;
    requestIdsRef.current.set(id, nextId);
    return nextId;
  }, []);

  const isLatestRequest = useCallback((id: string, requestId: number) => {
    return requestIdsRef.current.get(id) === requestId;
  }, []);

  const applyNotifications = useCallback((notifications?: NotificationPreview[]) => {
    applyNotificationPreviews(notifications, fireWebNotification);
  }, [fireWebNotification]);

  const applyLocalAccountPatch = useCallback((id: string, patch: Partial<Account>) => {
    setAccounts((prev) =>
      prev.map((account) => (account.id === id ? { ...account, ...patch } : account)),
    );
  }, [setAccounts]);

  const applyQuotaSnapshot = useCallback((
    id: string,
    requestId: number,
    quotaData: QuotaData,
    codexHomePath?: string,
  ) => {
    if (!isLatestRequest(id, requestId)) return false;

    applyLocalAccountPatch(id, {
      quotaData,
      lastChecked: new Date().toISOString(),
      ...(codexHomePath ? { codexHomePath } : {}),
    });
    setQuotaStates((prev) => updateRecord(prev, id, "idle"));
    setQuotaErrors((prev) => updateRecord(prev, id, null));
    return true;
  }, [applyLocalAccountPatch, isLatestRequest]);

  const refreshAccount = useCallback(async (
    id: string,
    source: RefreshSource = "manual",
  ): Promise<RefreshResult> => {
    void source;
    const existing = inflightRefreshesRef.current.get(id);
    if (existing) return existing;

    const requestId = beginRequest(id);
    setQuotaStates((prev) => updateRecord(prev, id, "loading"));
    setQuotaErrors((prev) => updateRecord(prev, id, null));

    const promise = (async (): Promise<RefreshResult> => {
      try {
        const res = await fetch(`/api/accounts/${id}/quota`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        });
        const data = await res.json() as QuotaResponse;

        if (!res.ok) {
          throw new Error(data.error ?? "Quota fetch failed");
        }

        const { notifications, demoted, ...quotaData } = data;
        const applied = applyQuotaSnapshot(id, requestId, quotaData as QuotaData);
        if (!applied) return "stale";

        if (demoted) {
          applyLocalAccountPatch(id, {
            inUse: false,
            pinned: false,
            pinOrder: 0,
            starred: false,
          });
        }

        applyNotifications(notifications);
        return "success";
      } catch (err) {
        if (isLatestRequest(id, requestId)) {
          setQuotaStates((prev) => updateRecord(prev, id, "error"));
          setQuotaErrors((prev) => updateRecord(
            prev,
            id,
            err instanceof Error ? err.message : "Quota fetch failed",
          ));
        }
        return "error";
      } finally {
        inflightRefreshesRef.current.delete(id);
      }
    })();

    inflightRefreshesRef.current.set(id, promise);
    return promise;
  }, [applyLocalAccountPatch, applyNotifications, applyQuotaSnapshot, beginRequest, isLatestRequest]);

  const resetLoginStateLater = useCallback((id: string, requestId: number) => {
    const existing = loginResetTimersRef.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      if (!isLatestRequest(id, requestId)) return;
      setLoginStates((prev) => updateRecord(prev, id, "idle"));
    }, 3000);

    loginResetTimersRef.current.set(id, timer);
  }, [isLatestRequest]);

  const signInAccount = useCallback(async (id: string) => {
    const requestId = beginRequest(id);
    setLoginStates((prev) => updateRecord(prev, id, "waiting"));
    setLoginErrors((prev) => updateRecord(prev, id, null));

    try {
      const res = await fetch(`/api/accounts/${id}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(6 * 60 * 1000),
      });
      const data = await res.json() as LoginResponse;

      if (!data.success) {
        throw new Error(data.error ?? "Sign in failed");
      }

      if (!isLatestRequest(id, requestId)) return;

      if (data.codexHomePath) {
        applyLocalAccountPatch(id, { codexHomePath: data.codexHomePath });
      }
      if (data.quotaData) {
        applyQuotaSnapshot(id, requestId, data.quotaData, data.codexHomePath);
      } else {
        setQuotaStates((prev) => updateRecord(prev, id, "idle"));
        setQuotaErrors((prev) => updateRecord(prev, id, null));
      }

      applyNotifications(data.notifications);
      setLoginStates((prev) => updateRecord(prev, id, "success"));
      setLoginErrors((prev) => updateRecord(prev, id, null));
      resetLoginStateLater(id, requestId);
    } catch (err) {
      if (!isLatestRequest(id, requestId)) return;
      setLoginStates((prev) => updateRecord(prev, id, "error"));
      setLoginErrors((prev) => updateRecord(
        prev,
        id,
        err instanceof Error ? err.message : "Sign in failed",
      ));
    }
  }, [
    applyLocalAccountPatch,
    applyNotifications,
    applyQuotaSnapshot,
    beginRequest,
    isLatestRequest,
    resetLoginStateLater,
  ]);

  const refreshAll = useCallback(async () => {
    const eligible = getSortedAccounts(accountsRef.current).filter((account) => account.codexHomePath);
    if (eligible.length === 0) return;

    setRefreshingAll(true);
    setRefreshProgress({ done: 0, total: eligible.length });

    emitLog("info", "refresh-all", `Refresh All started — ${eligible.length} account(s)`, {
      detail: { accountIds: eligible.map((account) => account.id), emails: eligible.map((account) => account.email) },
    });

    const t0 = Date.now();
    let successCount = 0;
    let failCount = 0;

    for (let index = 0; index < eligible.length; index++) {
      const account = eligible[index];
      const result = await refreshAccount(account.id, "refresh-all");

      if (result === "success" || result === "stale") {
        successCount++;
      } else {
        failCount++;
      }

      setRefreshProgress({ done: index + 1, total: eligible.length });
    }

    const durationMs = Date.now() - t0;
    if (failCount === 0) {
      emitLog(
        "success",
        "refresh-all",
        `Refresh All completed — ${successCount}/${eligible.length} succeeded in ${(durationMs / 1000).toFixed(1)}s`,
        { durationMs },
      );
    } else {
      emitLog(
        "warn",
        "refresh-all",
        `Refresh All finished — ${successCount} succeeded, ${failCount} failed out of ${eligible.length} in ${(durationMs / 1000).toFixed(1)}s`,
        { durationMs },
      );
    }

    setRefreshingAll(false);
    setRefreshProgress(null);
  }, [emitLog, refreshAccount]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const account of accountsRef.current) {
        const refreshIntervalMins = getEffectiveRefreshIntervalMins(account, now);
        if (!refreshIntervalMins) continue;

        const fetchedAt = account.quotaData?.fetchedAt
          ? new Date(account.quotaData.fetchedAt).getTime()
          : 0;
        const elapsedMins = (now - fetchedAt) / 60_000;

        if (elapsedMins >= refreshIntervalMins) {
          void refreshAccount(account.id, "auto");
        }
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [refreshAccount]);

  return {
    loginStates,
    loginErrors,
    quotaStates,
    quotaErrors,
    refreshingAll,
    refreshProgress,
    refreshAll,
    refreshAccount,
    signInAccount,
  };
}
