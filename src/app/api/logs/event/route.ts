/**
 * POST /api/logs/event
 *
 * Accepts a single log entry from the client side (e.g. Refresh All progress).
 * Body: { level, category, message, accountId?, accountEmail?, detail? }
 */

import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import type { LogLevel, LogCategory } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      level = "info",
      category = "system",
      message,
      accountId,
      accountEmail,
      detail,
      durationMs,
    } = body as {
      level?: LogLevel;
      category?: LogCategory;
      message: string;
      accountId?: string;
      accountEmail?: string;
      detail?: string | Record<string, unknown>;
      durationMs?: number;
    };

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    log(level, category, message, { accountId, accountEmail, detail, durationMs });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/logs/event]", err);
    return NextResponse.json({ error: "Failed to write log" }, { status: 500 });
  }
}
