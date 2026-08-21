import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RAW_RETENTION_DAYS } from "./config";

/**
 * The status worker's cron is "* * * * *" - it runs 1,440 times a day, and
 * every tick calls pruneOld, whose first statement is
 * `DELETE FROM checks WHERE ts < ?`.
 *
 * 0001's only index on `checks` is (component, ts). A composite index can only
 * be used for a predicate on its LEADING column, so a bare `ts < ?` could not
 * touch it and SQLite fell back to a full table scan. With retention at 8 days
 * the table sits at a steady ~80,650 rows, so each run read the entire table
 * to delete the few rows that had just aged out: ~116 MILLION rows a day,
 * which made the status page the largest D1 reader on the whole account
 * (measured 115.6M rows/24h on 2026-08-21) - bigger than the storage product
 * it monitors.
 *
 * This pins the plan rather than the SQL text, because the SQL was never
 * wrong. A `SCAN` here is the regression.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

/** The real migrations, in order - schema and indexes exactly as production. */
function migratedDb(): DatabaseSync {
    const sqlite = new DatabaseSync(":memory:");
    for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort()) {
        sqlite.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    }
    return sqlite;
}

/**
 * A realistically-sized table. The planner's choice here does not depend on
 * row count (D1 runs no ANALYZE, so there are no stats either way), but an
 * empty table would let a wrong plan look fine.
 */
function seed(sqlite: DatabaseSync, now: number): void {
    const ins = sqlite.prepare(
        `INSERT INTO checks (component, ts, ok, state, latency_ms) VALUES (?, ?, ?, ?, ?)`,
    );
    const comps = ["web", "docs", "api", "rest", "webdav", "s3", "sftp"];
    // One row per component per minute across the retention window, plus an
    // extra hour that has already aged out - production always has rows on
    // both sides of the cutoff, and a table with nothing to delete would let
    // the retention assertion below pass vacuously.
    for (let i = 0; i < RAW_RETENTION_DAYS * 1440 + 60; i++) {
        for (const c of comps) ins.run(c, now - i * 60, 1, "up", 5);
    }
}

const planOf = (s: DatabaseSync, sql: string) =>
    (s.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[])
        .map((r) => r.detail).join("\n");

describe("checks retention query plans", () => {
    const NOW = 1_787_300_000;
    const cutoff = NOW - RAW_RETENTION_DAYS * 86400;

    it("ships an index on checks.ts", () => {
        const s = migratedDb();
        const idx = s.prepare(
            `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_checks_ts'`,
        ).all();
        expect(idx).toHaveLength(1);
    });

    it("deletes expired rows by range, never by scanning the table", () => {
        const s = migratedDb();
        seed(s, NOW);
        const plan = planOf(s, `DELETE FROM checks WHERE ts < ${cutoff}`);
        expect(plan).toMatch(/idx_checks_ts/);
        // The regression: a bare SCAN of the table, 1,440 times a day.
        expect(plan).not.toMatch(/^SCAN checks$/m);
    });

    it("reads the history window by range too", () => {
        const s = migratedDb();
        seed(s, NOW);
        const plan = planOf(s, `SELECT component, ts, ok, state FROM checks WHERE ts >= ${cutoff}`);
        expect(plan).toMatch(/idx_checks_ts/);
    });

    it("leaves getLatestChecks on the composite index", () => {
        // Grouping by component is exactly what (component, ts) is for; the new
        // index must not pull that query off it.
        const s = migratedDb();
        seed(s, NOW);
        const plan = planOf(s, `
            SELECT c.component, c.ts FROM checks c
            JOIN (SELECT component, MAX(ts) AS mts FROM checks GROUP BY component) m
              ON c.component = m.component AND c.ts = m.mts`);
        expect(plan).toMatch(/idx_checks_component_ts/);
    });

    it("still deletes exactly the rows past the retention window", () => {
        // The index must change the plan and nothing else.
        const s = migratedDb();
        seed(s, NOW);
        const before = (s.prepare(`SELECT COUNT(*) AS c FROM checks`).get() as { c: number }).c;
        s.prepare(`DELETE FROM checks WHERE ts < ?`).run(cutoff);
        const after = (s.prepare(`SELECT COUNT(*) AS c FROM checks`).get() as { c: number }).c;
        expect(after).toBeLessThan(before);
        expect(
            (s.prepare(`SELECT COUNT(*) AS c FROM checks WHERE ts < ?`).get(cutoff) as { c: number }).c,
        ).toBe(0);
    });
});
