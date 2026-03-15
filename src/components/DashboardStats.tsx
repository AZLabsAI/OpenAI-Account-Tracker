import { Account } from "@/types";
import { getAccountStatus } from "@/data/accounts";

interface Props {
  accounts: Account[];
}

export function DashboardStats({ accounts }: Props) {
  const total = accounts.length;
  const starred = accounts.filter((a) => a.starred).length;
  const inUse = accounts.filter((a) => a.inUse).length;
  const active = accounts.filter((a) => {
    const s = getAccountStatus(a);
    return s === "active" || s === "in-use";
  }).length;
  const expiringSoon = accounts.filter(
    (a) => getAccountStatus(a) === "expiring-soon",
  ).length;

  const stats: { label: string; value: number; accent: string }[] = [
    { label: "Total Accounts", value: total, accent: "text-zinc-100" },
    { label: "Starred", value: starred, accent: "text-amber-400" },
    { label: "In Use", value: inUse, accent: "text-blue-400" },
    { label: "Active", value: active, accent: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4"
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
