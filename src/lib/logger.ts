/**
 * logger.ts — Structured logging to SQLite.
 *
 * Every log entry has: timestamp, level, category, message,
 * optional accountId, optional detail (JSON string for stack traces, payloads, etc.)
 *
 * Logs are stored in the same `data.db` used by the accounts table.
 */

import { getDb } from "./db";

export type LogLevel = "info" | "success" | "warn" | "error";

export type LogCategory =
  | "system"
  | "notification"
  | "quota"
  | "login"
  | "account"
  | "refresh-all";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  accountId: string | null;
  accountEmail: string | null;
  detail: string | null;
  durationMs: number | null;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

let _initialized = false;

function ensureTable(): void {
  if (_initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp     TEXT NOT NULL,
      level         TEXT NOT NULL DEFAULT 'info',
      category      TEXT NOT NULL DEFAULT 'system',
      message       TEXT NOT NULL,
      accountId     TEXT,
      accountEmail  TEXT,
      detail        TEXT,
      durationMs    INTEGER
    )
  `);

  // Add any missing columns for older DBs
  const cols = (db.prepare("PRAGMA table_info(logs)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("durationMs"))    db.exec("ALTER TABLE logs ADD COLUMN durationMs INTEGER");
  if (!cols.includes("accountEmail"))  db.exec("ALTER TABLE logs ADD COLUMN accountEmail TEXT");

  _initialized = true;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  opts?: {
    accountId?: string;
    accountEmail?: string;
    detail?: string | Record<string, unknown>;
    durationMs?: number;
  },
): void {
  ensureTable();
  const db = getDb();
  const detailStr =
    opts?.detail != null
      ? typeof opts.detail === "string"
        ? opts.detail
        : JSON.stringify(opts.detail, null, 2)
      : null;

  db.prepare(`
    INSERT INTO logs (timestamp, level, category, message, accountId, accountEmail, detail, durationMs)
    VALUES (@timestamp, @level, @category, @message, @accountId, @accountEmail, @detail, @durationMs)
  `).run({
    timestamp:    new Date().toISOString(),
    level,
    category,
    message,
    accountId:    opts?.accountId ?? null,
    accountEmail: opts?.accountEmail ?? null,
    detail:       detailStr,
    durationMs:   opts?.durationMs ?? null,
  });

  // Auto-prune: keep at most 2000 entries
  db.prepare(`
    DELETE FROM logs WHERE id NOT IN (
      SELECT id FROM logs ORDER BY id DESC LIMIT 2000
    )
  `).run();
}

// Convenience helpers
export const logInfo    = (cat: LogCategory, msg: string, opts?: Parameters<typeof log>[3]) => log("info", cat, msg, opts);
export const logSuccess = (cat: LogCategory, msg: string, opts?: Parameters<typeof log>[3]) => log("success", cat, msg, opts);
export const logWarn    = (cat: LogCategory, msg: string, opts?: Parameters<typeof log>[3]) => log("warn", cat, msg, opts);
export const logError   = (cat: LogCategory, msg: string, opts?: Parameters<typeof log>[3]) => log("error", cat, msg, opts);

// ─── Read ────────────────────────────────────────────────────────────────────

export interface LogQuery {
  level?: LogLevel;
  category?: LogCategory;
  search?: string;
  limit?: number;
  before?: number; // log id — for pagination
}

export function getLogs(query?: LogQuery): LogEntry[] {
  ensureTable();
  const db = getDb();

  const wheres: string[] = [];
  const values: Record<string, unknown> = {};

  if (query?.level) {
    wheres.push("level = @level");
    values.level = query.level;
  }
  if (query?.category) {
    wheres.push("category = @category");
    values.category = query.category;
  }
  if (query?.search) {
    wheres.push("(message LIKE @search OR detail LIKE @search OR accountEmail LIKE @search)");
    values.search = `%${query.search}%`;
  }
  if (query?.before) {
    wheres.push("id < @before");
    values.before = query.before;
  }

  const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
  const limit = query?.limit ?? 200;

  const sql = `SELECT * FROM logs ${where} ORDER BY id DESC LIMIT ${limit}`;
  const rows = db.prepare(sql).all(values) as LogEntry[];
  return rows;
}

export function clearLogs(): number {
  ensureTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM logs").run();
  return result.changes;
}

export function getLogStats(): { total: number; byLevel: Record<string, number>; byCategory: Record<string, number> } {
  ensureTable();
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as n FROM logs").get() as { n: number }).n;
  const levelRows = db.prepare("SELECT level, COUNT(*) as n FROM logs GROUP BY level").all() as { level: string; n: number }[];
  const catRows = db.prepare("SELECT category, COUNT(*) as n FROM logs GROUP BY category").all() as { category: string; n: number }[];
  return {
    total,
    byLevel: Object.fromEntries(levelRows.map((r) => [r.level, r.n])),
    byCategory: Object.fromEntries(catRows.map((r) => [r.category, r.n])),
  };
}
