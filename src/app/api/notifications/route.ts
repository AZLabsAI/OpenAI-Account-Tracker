/**
 * GET    /api/notifications           — List notification events
 * PATCH  /api/notifications           — Acknowledge one or all events
 * DELETE /api/notifications           — Clear all notification events
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getNotificationEvents,
  acknowledgeNotificationEvent,
  clearNotificationEvents,
  getUnacknowledgedCount,
  getDb,
  markNotificationDelivered,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const unacknowledgedOnly = url.searchParams.get("unacknowledged") === "true";
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const events = getNotificationEvents({ limit, unacknowledgedOnly });
  const unacknowledgedCount = getUnacknowledgedCount();

  return NextResponse.json({ events, unacknowledgedCount });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: number;
      acknowledgeAll?: boolean;
      deliveredChannel?: "web" | "native" | "telegram";
      telegramMessageId?: number;
    };

    if (body.acknowledgeAll) {
      const db = getDb();
      db.prepare("UPDATE notification_events SET acknowledged = 1 WHERE acknowledged = 0").run();
      return NextResponse.json({ success: true });
    }

    if (body.id && body.deliveredChannel) {
      markNotificationDelivered(body.id, body.deliveredChannel, body.telegramMessageId);
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      acknowledgeNotificationEvent(body.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Provide id or acknowledgeAll" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to acknowledge" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const count = clearNotificationEvents();
  return NextResponse.json({ success: true, cleared: count });
}
