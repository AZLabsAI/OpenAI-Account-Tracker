export type CodexResetIndicatorStatus = "yes" | "no" | "unavailable";

export type CodexResetSource = "local" | "upstream" | "merged";

export interface CodexResetStatusResponse {
  status: CodexResetIndicatorStatus;
  configured: boolean;
  resetAt: string | null;
  updatedAt: string | null;
  source?: CodexResetSource;
  /** Number of local accounts that observed the reset, when source="local". */
  localAccountCount?: number;
}
