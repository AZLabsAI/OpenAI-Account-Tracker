import { AccountStatus } from "@/types";

interface Props {
  status: AccountStatus;
}

const config: Record<
  AccountStatus,
  { label: string; dot: string; bg: string; text: string; pulse?: boolean }
> = {
  "in-use": {
    label: "In Use",
    dot: "bg-blue-400",
    bg: "bg-blue-400/10 border border-blue-400/20",
    text: "text-blue-400",
    pulse: true,
  },
  active: {
    label: "Active",
    dot: "bg-emerald-400",
    bg: "bg-emerald-400/10",
    text: "text-emerald-400",
  },
  "waiting-refresh": {
    label: "Waiting for Refresh",
    dot: "bg-orange-400",
    bg: "bg-orange-400/10 border border-orange-400/20",
    text: "text-orange-400",
  },
  "expiring-soon": {
    label: "Expiring Soon",
    dot: "bg-amber-400",
    bg: "bg-amber-400/10",
    text: "text-amber-400",
  },
  expired: {
    label: "Expired",
    dot: "bg-red-400",
    bg: "bg-red-400/10",
    text: "text-red-400",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-zinc-500",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
  },
};

export function StatusBadge({ status }: Props) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {c.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${c.dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${c.dot}`} />
      </span>
      {c.label}
    </span>
  );
}
