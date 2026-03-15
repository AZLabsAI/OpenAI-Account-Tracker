/**
 * POST /api/accounts/[id]/login
 *
 * Starts the Codex OAuth browser login flow for one account.
 * The account must have a `codexHomePath` set in the DB first.
 *
 * Body: { codexHomePath?: string }
 *   — if provided, saves it to the account before starting login
 *   — if omitted, uses the existing codexHomePath from the DB
 *
 * This is a long-running request (waits up to 5 min for browser login).
 * The client should set a long timeout or use the SSE endpoint instead.
 *
 * Response: { success: true, email?: string } | { success: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccount, updateAccount } from "@/lib/db";
import { loginAccount, fetchQuota } from "@/lib/codex-appserver";
import { homedir } from "os";
import { mkdirSync } from "fs";
import path from "path";

export const maxDuration = 310; // 5 min + buffer

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { codexHomePath?: string };

    const account = getAccount(id);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Determine the codexHomePath to use
    let codexHomePath = body.codexHomePath ?? account.codexHomePath;

    // If still not set, auto-generate a default path
    if (!codexHomePath) {
      codexHomePath = path.join(homedir(), ".codex-accounts", id);
    }

    // Ensure the directory exists
    mkdirSync(codexHomePath, { recursive: true });

    // Persist the path in the DB
    updateAccount(id, { codexHomePath });

    // Start the OAuth flow — this opens the browser and waits for completion
    const result = await loginAccount(codexHomePath, 5 * 60 * 1000);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Login succeeded — immediately fetch quota to confirm + get email/plan
    let quotaData;
    try {
      quotaData = await fetchQuota(codexHomePath);
      updateAccount(id, {
        quotaData,
        lastChecked: new Date().toISOString(),
      });
    } catch (qErr) {
      console.warn("[login] quota fetch after login failed (non-fatal):", qErr);
    }

    return NextResponse.json({
      success: true,
      email: quotaData?.email,
      planType: quotaData?.planType,
      quotaData,
    });

  } catch (err) {
    console.error("[POST /api/accounts/[id]/login]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 },
    );
  }
}
