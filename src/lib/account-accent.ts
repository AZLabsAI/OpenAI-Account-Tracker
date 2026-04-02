import type { Account } from "@/types";

export type AccountAccentKind = "pinned" | "starred" | "in-use" | "default";

export function getAccountAccentKind(account: Pick<Account, "pinned" | "starred" | "inUse">): AccountAccentKind {
  if (account.pinned) return "pinned";
  if (account.starred) return "starred";
  if (account.inUse) return "in-use";
  return "default";
}

const STRIP_CLASS: Record<Exclude<AccountAccentKind, "default">, string> = {
  pinned: "absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-violet-400 to-violet-600 rounded-l-2xl",
  starred: "absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 to-amber-600 rounded-l-2xl",
  "in-use": "absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-blue-400 to-blue-600 rounded-l-2xl",
};

const AVATAR_CLASS: Record<AccountAccentKind, string> = {
  pinned: "bg-gradient-to-br from-violet-400 to-violet-600",
  starred: "bg-gradient-to-br from-amber-400 to-orange-500",
  "in-use": "bg-gradient-to-br from-blue-400 to-blue-600",
  default: "bg-gradient-to-br from-emerald-500 to-teal-600",
};

/** Left edge accent strip class, or null when no strip (default state). */
export function getAccentStripClass(account: Pick<Account, "pinned" | "starred" | "inUse">): string | null {
  const k = getAccountAccentKind(account);
  if (k === "default") return null;
  return STRIP_CLASS[k];
}

/** Avatar circle gradient behind initials or image. */
export function getAvatarAccentClass(account: Pick<Account, "pinned" | "starred" | "inUse">): string {
  return AVATAR_CLASS[getAccountAccentKind(account)];
}
