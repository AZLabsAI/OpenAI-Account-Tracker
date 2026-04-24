export type CodexResetIndicatorStatus = "yes" | "no" | "unavailable";

export interface CodexResetStatusResponse {
  status: CodexResetIndicatorStatus;
  configured: boolean;
  resetAt: string | null;
  updatedAt: string | null;
}
