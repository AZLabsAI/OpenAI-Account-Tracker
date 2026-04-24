import { NextResponse } from "next/server";
import { fetchCodexResetStatusFromSource } from "@/lib/codex-reset-status";
import { getRecentQuotaSnapshots } from "@/lib/db";
import { detectLocalCodexReset, DEFAULT_OPTIONS } from "@/lib/local-codex-reset";
import type { CodexResetStatusResponse } from "@/types/codex-reset";

export async function GET() {
  const now = new Date();
  const since = new Date(now.getTime() - DEFAULT_OPTIONS.eligibilityWindowHours * 3_600_000).toISOString();

  // Kick off upstream + local read in parallel. Local read is cheap (SQLite) but
  // upstream is a network call; no reason to sequence them.
  const [upstream, snapshots] = await Promise.all([
    fetchCodexResetStatusFromSource(),
    Promise.resolve().then(() => {
      try { return getRecentQuotaSnapshots(since); }
      catch { return []; }
    }),
  ]);

  const local = detectLocalCodexReset(snapshots, now);

  let merged: CodexResetStatusResponse;
  if (local.detected) {
    // Local evidence wins — it's ground truth from our own accounts.
    const bothAgree = upstream.status === "yes";
    merged = {
      status: "yes",
      configured: true,
      resetAt: local.detectedAt,
      updatedAt: now.toISOString(),
      source: bothAgree ? "merged" : "local",
      localAccountCount: local.accountCount,
    };
  } else {
    merged = { ...upstream, source: "upstream" };
  }

  return NextResponse.json(merged, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
