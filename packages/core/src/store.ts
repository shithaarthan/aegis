// Incident store behind a swappable repository interface (D-06). SQLite via node:sqlite.
import { createRequire } from "node:module";
import type { Incident } from "./types.js";

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDb;
};

export interface IncidentRepository {
  save(incident: Incident): void;
  load(id: string): Incident | null;
  listByFingerprint(fingerprint: string): Incident[];
  countToday(repo: string, day: string): number;
  listRecent(repo: string, limit: number): Incident[];
  close(): void;
}

export function createMemoryRepository(): IncidentRepository {
  const byId = new Map<string, Incident>();
  return {
    save(i) { byId.set(i.id, structuredClone(i)); },
    load(id) { const v = byId.get(id); return v ? structuredClone(v) : null; },
    listByFingerprint(fp) { return [...byId.values()].filter((i) => i.signature.fingerprint === fp).map((i) => structuredClone(i)); },
    countToday(repo, day) { return [...byId.values()].filter((i) => i.repo === repo && i.firstSeen.slice(0, 10) === day).length; },
    listRecent(repo, limit) { return [...byId.values()].filter((i) => i.repo === repo).slice(-limit).map((i) => structuredClone(i)); },
    close() {},
  };
}

export function createSqliteRepository(dbPath: string): IncidentRepository {
  // node:sqlite is available on Node >= 22 without extra deps.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, fingerprint TEXT, repo TEXT, first_seen TEXT, body TEXT
  )`);
  const insert = db.prepare(
    `INSERT INTO incidents (id, fingerprint, repo, first_seen, body) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint, repo=excluded.repo, first_seen=excluded.first_seen, body=excluded.body`,
  );
  const byId = db.prepare(`SELECT body FROM incidents WHERE id = ?`);
  const byFp = db.prepare(`SELECT body FROM incidents WHERE fingerprint = ? ORDER BY first_seen DESC LIMIT 50`);
  const countDay = db.prepare(`SELECT COUNT(*) AS n FROM incidents WHERE repo = ? AND substr(first_seen, 1, 10) = ?`);
  const recent = db.prepare(`SELECT body FROM incidents WHERE repo = ? ORDER BY first_seen DESC LIMIT ?`);
  return {
    save(i) {
      insert.run(i.id, i.signature.fingerprint, i.repo, i.firstSeen, JSON.stringify(i));
    },
    load(id) {
      const row = byId.get(id) as { body: string } | undefined;
      return row ? (JSON.parse(row.body) as Incident) : null;
    },
    listByFingerprint(fp) {
      return (byFp.all(fp) as { body: string }[]).map((r) => JSON.parse(r.body) as Incident);
    },
    countToday(repo, day) {
      return ((countDay.get(repo, day) as { n: number }).n ?? 0);
    },
    listRecent(repo, limit) {
      return (recent.all(repo, limit) as { body: string }[]).map((r) => JSON.parse(r.body) as Incident);
    },
    close() { db.close(); },
  };
}
