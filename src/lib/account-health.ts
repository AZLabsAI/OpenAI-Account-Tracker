import type { Account, AccountStatus, QuotaStatus, SubscriptionStatus } from "@/types";

export interface DerivedAccountHealth {
  quotaStatus: QuotaStatus;
  subscriptionStatus: SubscriptionStatus;
  accountStatus: AccountStatus;
}

function daysUntilExpiration(expirationDate?: string | null): number | null {
  if (!expirationDate) return null;

  const now = new Date();
  const exp = new Date(expirationDate);
  if (isNaN(exp.getTime())) return null;

  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getQuotaStatus(account: Account): QuotaStatus {
  if (
    (account.quotaData?.primary?.usedPercent ?? 0) >= 100
    || (account.quotaData?.secondary?.usedPercent ?? 0) >= 100
  ) {
    return "waiting-refresh";
  }

  if ((account.quotaData?.secondary?.usedPercent ?? 0) >= 95) {
    return "weekly-warning";
  }

  return "normal";
}

export function getSubscriptionStatus(account: Account): SubscriptionStatus {
  if (!account.expirationDate) return "active";

  const exp = new Date(account.expirationDate);
  if (isNaN(exp.getTime())) return "unknown";

  const remainingDays = daysUntilExpiration(account.expirationDate);
  if (remainingDays === null) return "unknown";
  if (remainingDays < 0) return "expired";
  if (remainingDays <= 5) return "expiring";

  return "active";
}

export function getAccountStatus(account: Account): AccountStatus {
  const quotaStatus = getQuotaStatus(account);
  if (quotaStatus === "waiting-refresh") return "waiting-refresh";
  if (account.inUse) return "in-use";
  if (quotaStatus === "weekly-warning") return "expiring-soon";

  const subscriptionStatus = getSubscriptionStatus(account);
  if (subscriptionStatus === "expired") return "expired";
  if (subscriptionStatus === "unknown") return "unknown";

  return "active";
}

export function getDerivedAccountHealth(account: Account): DerivedAccountHealth {
  const quotaStatus = getQuotaStatus(account);
  const subscriptionStatus = getSubscriptionStatus(account);

  return {
    quotaStatus,
    subscriptionStatus,
    accountStatus: getAccountStatus(account),
  };
}

export function getSortRank(account: Account): number {
  const quotaStatus = getQuotaStatus(account);
  if (quotaStatus === "waiting-refresh") return 2;
  if (quotaStatus === "weekly-warning") return 1;
  return 0;
}

export function getExpiryBorderUrgency(account: Account): "default" | "warning" | "critical" {
  const remainingDays = daysUntilExpiration(account.expirationDate);
  if (remainingDays !== null && remainingDays <= 2) return "critical";
  if (remainingDays !== null && remainingDays <= 5) return "warning";
  return "default";
}
