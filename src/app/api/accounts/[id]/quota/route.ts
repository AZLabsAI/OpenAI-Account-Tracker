/**
 * POST /api/accounts/[id]/quota
 *
 * Fetches live quota data from the Codex app-server and persists it.
 * The account must already be logged in (codexHomePath must have a valid auth.json).
 *
 * Response: QuotaData
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount } from "@/lib/db";
import { fetchQuota } from "@/lib/codex-appserver";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const account = getAccount(id);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!account.codexHomePath) {
      return NextResponse.json(
        { error: "No codexHomePath set — sign in first" },
        { status: 400 },
      );
    }

    const quotaData = await fetchQuota(account.codexHomePath);

    updateAccount(id, {
      quotaData,
      lastChecked: new Date().toISOString(),
    });

    return NextResponse.json(quotaData);

  } catch (err) {
    console.error("[POST /api/accounts/[id]/quota]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quota fetch failed" },
      { status: 500 },
    );
  }
}
