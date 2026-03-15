import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs, getLogStats } from "@/lib/logger";
import type { LogLevel, LogCategory } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const level    = url.searchParams.get("level") as LogLevel | null;
    const category = url.searchParams.get("category") as LogCategory | null;
    const search   = url.searchParams.get("search") || undefined;
    const limit    = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const before   = url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined;

    const logs = getLogs({
      level:    level ?? undefined,
      category: category ?? undefined,
      search,
      limit,
      before,
    });

    const stats = getLogStats();

    return NextResponse.json({ logs, stats });
  } catch (err) {
    console.error("[GET /api/logs]", err);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const deleted = clearLogs();
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error("[DELETE /api/logs]", err);
    return NextResponse.json({ error: "Failed to clear logs" }, { status: 500 });
  }
}
