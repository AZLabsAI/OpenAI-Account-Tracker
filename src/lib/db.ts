import Database from "better-sqlite3";
import path from "path";
import { accounts as seedAccounts } from "@/data/accounts";
import type { Account } from "@/types";

const DB_PATH = path.join(process.cwd(), "data.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  // Create table if it doesn't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      email             TEXT NOT NULL,
      subscription      TEXT NOT NULL,
      expirationDate    TEXT NOT NULL,
      usageLimits       TEXT NOT NULL DEFAULT '[]',
      starred           INTEGER NOT NULL DEFAULT 0,
      inUse             INTEGER NOT NULL DEFAULT 0,
      notes             TEXT,
      lastChecked       TEXT,
      avatarUrl         TEXT,
      accountType       TEXT,
      codexAssignedTo   TEXT NOT NULL DEFAULT '[]',
      chatgptAssignedTo TEXT NOT NULL DEFAULT '[]'
    )
  `);

  // Seed from accounts.ts if the table is empty
  const count = (_db.prepare("SELECT COUNT(*) as n FROM accounts").get() as { n: number }).n;
  if (count === 0) {
    const insert = _db.prepare(`
      INSERT INTO accounts (
        id, name, email, subscription, expirationDate,
        usageLimits, starred, inUse, notes, lastChecked,
        avatarUrl, accountType, codexAssignedTo, chatgptAssignedTo
      ) VALUES (
        @id, @name, @email, @subscription, @expirationDate,
        @usageLimits, @starred, @inUse, @notes, @lastChecked,
        @avatarUrl, @accountType, @codexAssignedTo, @chatgptAssignedTo
      )
    `);
    const insertMany = _db.transaction((accs: Account[]) => {
      for (const a of accs) {
        insert.run({
          id:                a.id,
          name:              a.name,
          email:             a.email,
          subscription:      a.subscription,
          expirationDate:    a.expirationDate,
          usageLimits:       JSON.stringify(a.usageLimits ?? []),
          starred:           a.starred ? 1 : 0,
          inUse:             a.inUse ? 1 : 0,
          notes:             a.notes ?? null,
          lastChecked:       a.lastChecked ?? null,
          avatarUrl:         a.avatarUrl ?? null,
          accountType:       a.accountType ?? null,
          codexAssignedTo:   JSON.stringify(a.codexAssignedTo ?? []),
          chatgptAssignedTo: JSON.stringify(a.chatgptAssignedTo ?? []),
        });
      }
    });
    insertMany(seedAccounts);
  }

  return _db;
}

/** Deserialise a raw DB row back into an Account */
function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id:                row.id as string,
    name:              row.name as string,
    email:             row.email as string,
    subscription:      row.subscription as Account["subscription"],
    expirationDate:    row.expirationDate as string,
    usageLimits:       JSON.parse(row.usageLimits as string),
    starred:           Boolean(row.starred),
    inUse:             Boolean(row.inUse),
    notes:             (row.notes as string) ?? undefined,
    lastChecked:       (row.lastChecked as string) ?? undefined,
    avatarUrl:         (row.avatarUrl as string) ?? undefined,
    accountType:       (row.accountType as Account["accountType"]) ?? undefined,
    codexAssignedTo:   JSON.parse(row.codexAssignedTo as string),
    chatgptAssignedTo: JSON.parse(row.chatgptAssignedTo as string),
  };
}

export function getAllAccounts(): Account[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM accounts").all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function updateAccount(id: string, patch: Partial<Account>): Account | null {
  const db = getDb();

  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  if (patch.starred       !== undefined) { fields.push("starred = @starred");             values.starred           = patch.starred ? 1 : 0; }
  if (patch.inUse         !== undefined) { fields.push("inUse = @inUse");                 values.inUse             = patch.inUse ? 1 : 0; }
  if (patch.accountType   !== undefined) { fields.push("accountType = @accountType");     values.accountType       = patch.accountType ?? null; }
  if (patch.codexAssignedTo   !== undefined) { fields.push("codexAssignedTo = @codexAssignedTo");     values.codexAssignedTo   = JSON.stringify(patch.codexAssignedTo); }
  if (patch.chatgptAssignedTo !== undefined) { fields.push("chatgptAssignedTo = @chatgptAssignedTo"); values.chatgptAssignedTo = JSON.stringify(patch.chatgptAssignedTo); }
  if (patch.notes         !== undefined) { fields.push("notes = @notes");                 values.notes             = patch.notes ?? null; }
  if (patch.lastChecked   !== undefined) { fields.push("lastChecked = @lastChecked");     values.lastChecked       = patch.lastChecked ?? null; }

  if (fields.length === 0) return null;

  db.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = @id`).run(values);

  const row = db.prepare("SELECT * FROM accounts WHERE id = @id").get({ id }) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}
