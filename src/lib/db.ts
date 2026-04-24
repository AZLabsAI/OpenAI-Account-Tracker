import Database from "better-sqlite3";
import path from "path";
import { accounts as seedAccounts } from "@/data/accounts";
import type { Account } from "@/types";

const DB_PATH = path.join(process.cwd(), "data.db");
const SCHEMA_VERSION_KEY = "schema_version";
const LATEST_SCHEMA_VERSION = 10;

let _db: Database.Database | null = null;

type TableColumn = {
  name: string;
  notnull: number;
  pk: number;
  dflt_value: unknown;
  type: string;
};

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

function tableExists(db: Database.Database, name: string) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = @name")
    .get({ name }) as { name: string } | undefined;
  return Boolean(row);
}

function getTableColumns(db: Database.Database, tableName: string): TableColumn[] {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumn[];
}

function hasColumn(db: Database.Database, tableName: string, columnName: string) {
  return getTableColumns(db, tableName).some((column) => column.name === columnName);
}

function createSchemaMetaTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function getSchemaVersion(db: Database.Database) {
  createSchemaMetaTable(db);
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = @key")
    .get({ key: SCHEMA_VERSION_KEY }) as { value: string } | undefined;

  if (!row) return 0;
  const version = Number.parseInt(row.value, 10);
  return Number.isFinite(version) ? version : 0;
}

function setSchemaVersion(db: Database.Database, version: number) {
  createSchemaMetaTable(db);
  db.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run({ key: SCHEMA_VERSION_KEY, value: String(version) });
}

function createFinalAccountsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE accounts (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      email               TEXT NOT NULL,
      subscription        TEXT NOT NULL,
      expirationDate      TEXT,
      usageLimits         TEXT NOT NULL DEFAULT '[]',
      starred             INTEGER NOT NULL DEFAULT 0,
      inUse               INTEGER NOT NULL DEFAULT 0,
      pinned              INTEGER NOT NULL DEFAULT 0,
      pinOrder            INTEGER NOT NULL DEFAULT 0,
      notes               TEXT,
      lastChecked         TEXT,
      avatarUrl           TEXT,
      accountType         TEXT,
      codexAssignedTo     TEXT NOT NULL DEFAULT '[]',
      chatgptAssignedTo   TEXT NOT NULL DEFAULT '[]',
      codexHomePath       TEXT,
      quotaData           TEXT,
      refreshIntervalMins INTEGER,
      sparklineStyle      TEXT
    )
  `);
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
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
    },
  },
  {
    version: 2,
    up(db) {
      if (!hasColumn(db, "accounts", "pinned")) {
        db.exec("ALTER TABLE accounts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
      }
      if (!hasColumn(db, "accounts", "pinOrder")) {
        db.exec("ALTER TABLE accounts ADD COLUMN pinOrder INTEGER NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 3,
    up(db) {
      if (!hasColumn(db, "accounts", "codexHomePath")) {
        db.exec("ALTER TABLE accounts ADD COLUMN codexHomePath TEXT");
      }
    },
  },
  {
    version: 4,
    up(db) {
      if (!hasColumn(db, "accounts", "quotaData")) {
        db.exec("ALTER TABLE accounts ADD COLUMN quotaData TEXT");
      }
    },
  },
  {
    version: 5,
    up(db) {
      if (!hasColumn(db, "accounts", "refreshIntervalMins")) {
        db.exec("ALTER TABLE accounts ADD COLUMN refreshIntervalMins INTEGER");
      }
    },
  },
  {
    version: 6,
    up(db) {
      const expirationDateColumn = getTableColumns(db, "accounts").find((column) => column.name === "expirationDate");
      if (!expirationDateColumn?.notnull) return;

      db.exec("ALTER TABLE accounts RENAME TO accounts_old");
      createFinalAccountsTable(db);
      db.exec(`
        INSERT INTO accounts (
          id,
          name,
          email,
          subscription,
          expirationDate,
          usageLimits,
          starred,
          inUse,
          pinned,
          pinOrder,
          notes,
          lastChecked,
          avatarUrl,
          accountType,
          codexAssignedTo,
          chatgptAssignedTo,
          codexHomePath,
          quotaData,
          refreshIntervalMins
        )
        SELECT
          id,
          name,
          email,
          subscription,
          expirationDate,
          usageLimits,
          starred,
          inUse,
          pinned,
          pinOrder,
          notes,
          lastChecked,
          avatarUrl,
          accountType,
          codexAssignedTo,
          chatgptAssignedTo,
          codexHomePath,
          quotaData,
          refreshIntervalMins
        FROM accounts_old
      `);
      db.exec("DROP TABLE accounts_old");
    },
  },
  {
    version: 7,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    },
  },
  {
    version: 8,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_events (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId         TEXT NOT NULL,
          eventType         TEXT NOT NULL,
          window            TEXT,
          usedPercent       REAL,
          message           TEXT NOT NULL,
          createdAt         TEXT NOT NULL,
          acknowledged      INTEGER NOT NULL DEFAULT 0,
          deliveredWeb      INTEGER NOT NULL DEFAULT 0,
          deliveredNative   INTEGER NOT NULL DEFAULT 0,
          deliveredTelegram INTEGER NOT NULL DEFAULT 0,
          telegramMessageId INTEGER
        )
      `);
    },
  },
  {
    version: 9,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quota_history (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId  TEXT NOT NULL,
          fetchedAt  TEXT NOT NULL,
          primaryPct REAL,
          weeklyPct  REAL,
          UNIQUE(accountId, fetchedAt)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_quota_history_account ON quota_history(accountId, fetchedAt)`);
    },
  },
  {
    version: 10,
    up(db) {
      if (!hasColumn(db, "accounts", "sparklineStyle")) {
        db.exec("ALTER TABLE accounts ADD COLUMN sparklineStyle TEXT");
      }
    },
  },
];

function migrateSchema(db: Database.Database) {
  let currentVersion = getSchemaVersion(db);
  if (currentVersion >= LATEST_SCHEMA_VERSION) return;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    db.transaction(() => {
      migration.up(db);
      setSchemaVersion(db, migration.version);
    })();
    currentVersion = migration.version;
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  migrateSchema(_db);

  // Seed from accounts.ts if the table is empty
  const count = (_db.prepare("SELECT COUNT(*) as n FROM accounts").get() as { n: number }).n;
  if (count === 0) {
    const insert = _db.prepare(`
      INSERT INTO accounts (
        id, name, email, subscription, expirationDate,
        usageLimits, starred, inUse, pinned, pinOrder,
        notes, lastChecked, avatarUrl, accountType,
        codexAssignedTo, chatgptAssignedTo,
        codexHomePath, quotaData, refreshIntervalMins,
        sparklineStyle
      ) VALUES (
        @id, @name, @email, @subscription, @expirationDate,
        @usageLimits, @starred, @inUse, @pinned, @pinOrder,
        @notes, @lastChecked, @avatarUrl, @accountType,
        @codexAssignedTo, @chatgptAssignedTo,
        @codexHomePath, @quotaData, @refreshIntervalMins,
        @sparklineStyle
      )
    `);
    const insertMany = _db.transaction((accs: Account[]) => {
      for (const a of accs) {
        insert.run({
          id:                a.id,
          name:              a.name,
          email:             a.email,
          subscription:      a.subscription,
          expirationDate:    a.expirationDate ?? null,
          usageLimits:       JSON.stringify(a.usageLimits ?? []),
          starred:           a.starred   ? 1 : 0,
          inUse:             a.inUse     ? 1 : 0,
          pinned:            a.pinned    ? 1 : 0,
          pinOrder:          a.pinOrder  ?? 0,
          notes:             a.notes     ?? null,
          lastChecked:       a.lastChecked  ?? null,
          avatarUrl:         a.avatarUrl    ?? null,
          accountType:       a.accountType  ?? null,
          codexAssignedTo:   JSON.stringify(a.codexAssignedTo   ?? []),
          chatgptAssignedTo: JSON.stringify(a.chatgptAssignedTo ?? []),
          codexHomePath:     a.codexHomePath ?? null,
          quotaData:         a.quotaData ? JSON.stringify(a.quotaData) : null,
          refreshIntervalMins: a.refreshIntervalMins ?? null,
          sparklineStyle:    a.sparklineStyle ?? null,
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
    expirationDate:    (row.expirationDate as string | null) ?? undefined,
    usageLimits:       JSON.parse(row.usageLimits as string),
    starred:           Boolean(row.starred),
    inUse:             Boolean(row.inUse),
    pinned:            Boolean(row.pinned),
    pinOrder:          (row.pinOrder as number) ?? 0,
    notes:             (row.notes     as string) ?? undefined,
    lastChecked:       (row.lastChecked as string) ?? undefined,
    avatarUrl:         (row.avatarUrl  as string) ?? undefined,
    accountType:       (row.accountType as Account["accountType"]) ?? undefined,
    codexAssignedTo:   JSON.parse(row.codexAssignedTo   as string),
    chatgptAssignedTo: JSON.parse(row.chatgptAssignedTo as string),
    codexHomePath:     (row.codexHomePath as string) ?? undefined,
    quotaData:         row.quotaData ? JSON.parse(row.quotaData as string) : undefined,
    refreshIntervalMins: row.refreshIntervalMins != null ? (row.refreshIntervalMins as number) : undefined,
    sparklineStyle:      (row.sparklineStyle as Account["sparklineStyle"]) ?? undefined,
  };
}

export function getAllAccounts(): Account[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM accounts").all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function getAccount(id: string): Account | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM accounts WHERE id = @id").get({ id }) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}

export function updateAccount(id: string, patch: Partial<Account>): Account | null {
  const db = getDb();

  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  if (patch.name               !== undefined) { fields.push("name = @name");                             values.name              = patch.name; }
  if (patch.email              !== undefined) { fields.push("email = @email");                           values.email             = patch.email; }
  if (patch.subscription       !== undefined) { fields.push("subscription = @subscription");             values.subscription      = patch.subscription; }
  if (patch.expirationDate     !== undefined) { fields.push("expirationDate = @expirationDate");         values.expirationDate    = patch.expirationDate ?? null; }
  if (patch.starred            !== undefined) { fields.push("starred = @starred");                       values.starred           = patch.starred ? 1 : 0; }
  if (patch.inUse              !== undefined) { fields.push("inUse = @inUse");                           values.inUse             = patch.inUse ? 1 : 0; }
  if (patch.pinned             !== undefined) { fields.push("pinned = @pinned");                         values.pinned            = patch.pinned ? 1 : 0; }
  if (patch.pinOrder           !== undefined) { fields.push("pinOrder = @pinOrder");                     values.pinOrder          = patch.pinOrder; }
  if (patch.accountType        !== undefined) { fields.push("accountType = @accountType");               values.accountType       = patch.accountType ?? null; }
  if (patch.codexAssignedTo    !== undefined) { fields.push("codexAssignedTo = @codexAssignedTo");       values.codexAssignedTo   = JSON.stringify(patch.codexAssignedTo); }
  if (patch.chatgptAssignedTo  !== undefined) { fields.push("chatgptAssignedTo = @chatgptAssignedTo");   values.chatgptAssignedTo = JSON.stringify(patch.chatgptAssignedTo); }
  if (patch.notes              !== undefined) { fields.push("notes = @notes");                           values.notes             = patch.notes ?? null; }
  if (patch.lastChecked        !== undefined) { fields.push("lastChecked = @lastChecked");               values.lastChecked       = patch.lastChecked ?? null; }
  if (patch.codexHomePath      !== undefined) { fields.push("codexHomePath = @codexHomePath");           values.codexHomePath     = patch.codexHomePath ?? null; }
  if (patch.quotaData          !== undefined) { fields.push("quotaData = @quotaData");                   values.quotaData         = patch.quotaData ? JSON.stringify(patch.quotaData) : null; }
  if (patch.refreshIntervalMins !== undefined) { fields.push("refreshIntervalMins = @refreshIntervalMins"); values.refreshIntervalMins = patch.refreshIntervalMins ?? null; }
  if (patch.sparklineStyle      !== undefined) { fields.push("sparklineStyle = @sparklineStyle");           values.sparklineStyle      = patch.sparklineStyle ?? null; }
  if (patch.avatarUrl          !== undefined) { fields.push("avatarUrl = @avatarUrl");                     values.avatarUrl         = patch.avatarUrl ?? null; }

  if (fields.length === 0) return null;

  db.prepare(`UPDATE accounts SET ${fields.join(", ")} WHERE id = @id`).run(values);

  const row = db.prepare("SELECT * FROM accounts WHERE id = @id").get({ id }) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}

/** Returns the next available pinOrder value */
export function nextPinOrder(): number {
  const db = getDb();
  const row = db.prepare("SELECT MAX(pinOrder) as max FROM accounts WHERE pinned = 1").get() as { max: number | null };
  return (row.max ?? 0) + 1;
}

export function deleteAccount(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM accounts WHERE id = @id").run({ id });
  return result.changes > 0;
}

export function createAccount(data: {
  name: string;
  email: string;
  subscription: string;
  expirationDate?: string | null;
  accountType?: string;
}): Account {
  const db = getDb();
  const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`
    INSERT INTO accounts (
      id, name, email, subscription, expirationDate,
      usageLimits, starred, inUse, pinned, pinOrder,
      codexAssignedTo, chatgptAssignedTo, accountType
    ) VALUES (
      @id, @name, @email, @subscription, @expirationDate,
      '[]', 0, 0, 0, 0,
      '[]', '[]', @accountType
    )
  `).run({
    id,
    name:           data.name,
    email:          data.email,
    subscription:   data.subscription,
    expirationDate: data.expirationDate ?? null,
    accountType:    data.accountType ?? null,
  });
  const row = db.prepare("SELECT * FROM accounts WHERE id = @id").get({ id }) as Record<string, unknown>;
  return rowToAccount(row);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = @key").get({ key }) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)").run({ key, value });
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification event helpers
// ═══════════════════════════════════════════════════════════════════════════════

import type { NotificationEvent, NotificationEventType } from "@/types";

export function insertNotificationEvent(event: {
  accountId: string;
  eventType: NotificationEventType;
  window: string | null;
  usedPercent: number | null;
  message: string;
}): NotificationEvent {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO notification_events (accountId, eventType, window, usedPercent, message, createdAt)
    VALUES (@accountId, @eventType, @window, @usedPercent, @message, @createdAt)
  `).run({ ...event, createdAt });

  return {
    id: result.lastInsertRowid as number,
    accountId: event.accountId,
    eventType: event.eventType as NotificationEventType,
    window: event.window as NotificationEvent["window"],
    usedPercent: event.usedPercent,
    message: event.message,
    createdAt,
    acknowledged: false,
    deliveredWeb: false,
    deliveredNative: false,
    deliveredTelegram: false,
    telegramMessageId: null,
  };
}

export function getNotificationEvents(opts?: {
  limit?: number;
  unacknowledgedOnly?: boolean;
}): NotificationEvent[] {
  const db = getDb();
  const where = opts?.unacknowledgedOnly ? "WHERE acknowledged = 0" : "";
  const limit = opts?.limit ?? 50;
  const rows = db.prepare(`SELECT * FROM notification_events ${where} ORDER BY id DESC LIMIT ${limit}`).all() as Record<string, unknown>[];
  return rows.map(rowToNotificationEvent);
}

export function acknowledgeNotificationEvent(id: number): void {
  const db = getDb();
  db.prepare("UPDATE notification_events SET acknowledged = 1 WHERE id = @id").run({ id });
}

export function acknowledgeAllNotificationEvents(): void {
  const db = getDb();
  db.prepare("UPDATE notification_events SET acknowledged = 1 WHERE acknowledged = 0").run();
}

export function markNotificationDelivered(id: number, channel: "web" | "native" | "telegram", telegramMessageId?: number): void {
  const db = getDb();
  if (channel === "web") db.prepare("UPDATE notification_events SET deliveredWeb = 1 WHERE id = @id").run({ id });
  if (channel === "native") db.prepare("UPDATE notification_events SET deliveredNative = 1 WHERE id = @id").run({ id });
  if (channel === "telegram") {
    db.prepare("UPDATE notification_events SET deliveredTelegram = 1, telegramMessageId = @msgId WHERE id = @id").run({ id, msgId: telegramMessageId ?? null });
  }
}

export function getUnacknowledgedCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as n FROM notification_events WHERE acknowledged = 0").get() as { n: number };
  return row.n;
}

/**
 * Check if there's already an unresolved event of this type for this account+window.
 * "Unresolved" means: no quota_reset event exists after the last exhausted/critical/warning event.
 */
export function hasUnresolvedEvent(accountId: string, eventType: NotificationEventType, window: string | null): boolean {
  // For reset events, we never dedup — always fire
  if (eventType === "quota_reset") return false;

  return getLatestUnresolvedEvent(accountId, eventType, window) !== null;
}

export function getLatestUnresolvedEvent(
  accountId: string,
  eventType: NotificationEventType,
  window: string | null,
): { id: number; createdAt: string } | null {
  const db = getDb();

  // Find the most recent event of this exact type for this account+window
  const lastEvent = db.prepare(`
    SELECT id, createdAt FROM notification_events
    WHERE accountId = @accountId AND eventType = @eventType AND (window = @window OR (window IS NULL AND @window IS NULL))
    ORDER BY id DESC LIMIT 1
  `).get({ accountId, eventType, window: window ?? null }) as { id: number; createdAt: string } | undefined;

  if (!lastEvent) return null;

  // Check if there's been a reset since that event
  const resetAfter = db.prepare(`
    SELECT id FROM notification_events
    WHERE accountId = @accountId AND eventType = 'quota_reset' AND (window = @window OR (window IS NULL AND @window IS NULL)) AND id > @afterId
    LIMIT 1
  `).get({ accountId, window: window ?? null, afterId: lastEvent.id }) as { id: number } | undefined;

  // If there's been a reset, the old event is resolved
  if (resetAfter) return null;

  // No reset — event is still unresolved
  return lastEvent;
}

function rowToNotificationEvent(row: Record<string, unknown>): NotificationEvent {
  return {
    id: row.id as number,
    accountId: row.accountId as string,
    eventType: row.eventType as NotificationEventType,
    window: row.window as NotificationEvent["window"],
    usedPercent: row.usedPercent as number | null,
    message: row.message as string,
    createdAt: row.createdAt as string,
    acknowledged: Boolean(row.acknowledged),
    deliveredWeb: Boolean(row.deliveredWeb),
    deliveredNative: Boolean(row.deliveredNative),
    deliveredTelegram: Boolean(row.deliveredTelegram),
    telegramMessageId: (row.telegramMessageId as number) ?? null,
  };
}

export function clearNotificationEvents(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM notification_events").run();
  return result.changes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quota history helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function insertQuotaSnapshot(accountId: string, fetchedAt: string, primaryPct: number | null, weeklyPct: number | null): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO quota_history (accountId, fetchedAt, primaryPct, weeklyPct)
    VALUES (@accountId, @fetchedAt, @primaryPct, @weeklyPct)
  `).run({ accountId, fetchedAt, primaryPct, weeklyPct });
}

export function getQuotaHistory(accountId: string, limit = 24): { fetchedAt: string; primaryPct: number | null; weeklyPct: number | null }[] {
  const db = getDb();
  return db.prepare(`
    SELECT fetchedAt, primaryPct, weeklyPct FROM quota_history
    WHERE accountId = @accountId ORDER BY fetchedAt DESC LIMIT @limit
  `).all({ accountId, limit }) as { fetchedAt: string; primaryPct: number | null; weeklyPct: number | null }[];
}
