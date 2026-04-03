import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Account } from "@/types";

export async function POST(req: Request) {
  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON array of accounts" }, { status: 400 });
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO accounts (
      id, name, email, subscription, expirationDate,
      usageLimits, starred, inUse, pinned, pinOrder,
      notes, lastChecked, avatarUrl, accountType,
      codexAssignedTo, chatgptAssignedTo,
      codexHomePath, quotaData, refreshIntervalMins
    ) VALUES (
      @id, @name, @email, @subscription, @expirationDate,
      @usageLimits, @starred, @inUse, @pinned, @pinOrder,
      @notes, @lastChecked, @avatarUrl, @accountType,
      @codexAssignedTo, @chatgptAssignedTo,
      @codexHomePath, @quotaData, @refreshIntervalMins
    ) ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      subscription = excluded.subscription,
      expirationDate = excluded.expirationDate,
      usageLimits = excluded.usageLimits,
      starred = excluded.starred,
      inUse = excluded.inUse,
      pinned = excluded.pinned,
      pinOrder = excluded.pinOrder,
      notes = excluded.notes,
      accountType = excluded.accountType,
      codexAssignedTo = excluded.codexAssignedTo,
      chatgptAssignedTo = excluded.chatgptAssignedTo
  `);

  let imported = 0;
  const run = db.transaction((accounts: Account[]) => {
    for (const a of accounts) {
      if (!a.id || !a.email || !a.name) continue;
      upsert.run({
        id:                a.id,
        name:              a.name,
        email:             a.email,
        subscription:      a.subscription ?? "Free",
        expirationDate:    a.expirationDate ?? null,
        usageLimits:       JSON.stringify(a.usageLimits ?? []),
        starred:           a.starred ? 1 : 0,
        inUse:             a.inUse ? 1 : 0,
        pinned:            a.pinned ? 1 : 0,
        pinOrder:          a.pinOrder ?? 0,
        notes:             a.notes ?? null,
        lastChecked:       a.lastChecked ?? null,
        avatarUrl:         a.avatarUrl ?? null,
        accountType:       a.accountType ?? null,
        codexAssignedTo:   JSON.stringify(a.codexAssignedTo ?? []),
        chatgptAssignedTo: JSON.stringify(a.chatgptAssignedTo ?? []),
        codexHomePath:     a.codexHomePath ?? null,
        quotaData:         a.quotaData ? JSON.stringify(a.quotaData) : null,
        refreshIntervalMins: a.refreshIntervalMins ?? null,
      });
      imported++;
    }
  });

  run(body);
  return NextResponse.json({ imported });
}
