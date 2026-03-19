import { Account } from "@/types";
import { getDerivedAccountHealth } from "@/lib/account-health";

interface Props {
  accounts: Account[];
}

export function DashboardStats({ accounts }: Props) {
  const total = accounts.length;
  const starred = accounts.filter((a) => a.starred).length;
  const inUse = accounts.filter((a) => a.inUse).length;
  const active = accounts.filter((a) => {
    const health = getDerivedAccountHealth(a);
    return a.inUse || (
      health.quotaStatus === "normal"
      && health.subscriptionStatus !== "expired"
      && health.subscriptionStatus !== "unknown"
    );
  }).length;
  const stats: { label: string; value: number; accent: string }[] = [
    { label: "Total Accounts", value: total, accent: "text-zinc-900 dark:text-zinc-100" },
    { label: "Starred", value: starred, accent: "text-amber-500 dark:text-amber-400" },
    { label: "In Use", value: inUse, accent: "text-blue-500 dark:text-blue-400" },
    { label: "Active", value: active, accent: "text-emerald-500 dark:text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-5 py-4 shadow-sm dark:shadow-none"
        >
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            {s.label}
          </p>
          <p className={`mt-1 text-2xl font-bold ${s.accent}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
