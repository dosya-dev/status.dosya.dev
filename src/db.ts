import type { Env } from "./config";
import { dayKey } from "./time";
import type { ProbeResult } from "./probes/http";
import type { CheckRow, DailyRow, IncidentRow } from "./aggregate";

export async function insertChecks(env: Env, nowUnix: number, results: ProbeResult[]): Promise<void> {
  const stmt = env.STATUS_DB.prepare(
    "INSERT INTO checks (component, ts, ok, state, latency_ms, status_code, error) VALUES (?,?,?,?,?,?,?)",
  );
  await env.STATUS_DB.batch(
    results.map((r) =>
      stmt.bind(r.component, nowUnix, r.ok ? 1 : 0, r.state, r.latency_ms, r.status_code, r.error),
    ),
  );
}

export async function upsertDaily(env: Env, nowUnix: number, results: ProbeResult[]): Promise<void> {
  const day = dayKey(nowUnix);
  const stmt = env.STATUS_DB.prepare(`
    INSERT INTO daily (component, day, up, total, degraded, sum_latency_ms)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(component, day) DO UPDATE SET
      up = up + excluded.up,
      total = total + 1,
      degraded = degraded + excluded.degraded,
      sum_latency_ms = sum_latency_ms + excluded.sum_latency_ms
  `);
  await env.STATUS_DB.batch(
    results.map((r) =>
      stmt.bind(
        r.component,
        day,
        r.state === "up" ? 1 : 0,
        r.state === "degraded" ? 1 : 0,
        r.latency_ms ?? 0,
      ),
    ),
  );
}

export async function pruneOld(env: Env, nowUnix: number, rawDays: number, dailyDays: number): Promise<void> {
  await env.STATUS_DB.batch([
    env.STATUS_DB.prepare("DELETE FROM checks WHERE ts < ?").bind(nowUnix - rawDays * 86400),
    env.STATUS_DB.prepare("DELETE FROM daily WHERE day < ?").bind(dayKey(nowUnix - dailyDays * 86400)),
  ]);
}

export async function getLatestChecks(env: Env): Promise<Map<string, CheckRow>> {
  const { results } = await env.STATUS_DB.prepare(`
    SELECT c.component, c.ts, c.ok, c.state, c.latency_ms, c.status_code, c.error
    FROM checks c
    JOIN (SELECT component, MAX(ts) AS mts FROM checks GROUP BY component) m
      ON c.component = m.component AND c.ts = m.mts
  `).all<CheckRow>();
  const map = new Map<string, CheckRow>();
  for (const r of results ?? []) map.set(r.component, r);
  return map;
}

export async function getDailyWindow(env: Env, sinceDay: string): Promise<DailyRow[]> {
  const { results } = await env.STATUS_DB.prepare(
    "SELECT component, day, up, total, degraded, sum_latency_ms FROM daily WHERE day >= ? ORDER BY day ASC",
  )
    .bind(sinceDay)
    .all<DailyRow>();
  return results ?? [];
}

export async function getRecentStates(env: Env, component: string, limit: number): Promise<string[]> {
  const { results } = await env.STATUS_DB.prepare(
    "SELECT state FROM checks WHERE component = ? ORDER BY ts DESC LIMIT ?",
  )
    .bind(component, limit)
    .all<{ state: string }>();
  return (results ?? []).map((r) => r.state);
}

export async function getActiveAutoIncident(env: Env, component: string): Promise<IncidentRow | null> {
  return await env.STATUS_DB.prepare(
    "SELECT * FROM incidents WHERE component = ? AND kind = 'auto' AND status = 'ongoing' ORDER BY started_at DESC LIMIT 1",
  )
    .bind(component)
    .first<IncidentRow>();
}

export async function openAutoIncident(
  env: Env,
  component: string,
  label: string,
  startedAt: number,
  nowUnix: number,
): Promise<void> {
  await env.STATUS_DB.prepare(
    "INSERT INTO incidents (component, kind, status, title, body, started_at, resolved_at, created_at, updated_at) VALUES (?, 'auto', 'ongoing', ?, NULL, ?, NULL, ?, ?)",
  )
    .bind(component, `${label} is down`, startedAt, nowUnix, nowUnix)
    .run();
}

export async function resolveAutoIncident(env: Env, id: number, nowUnix: number): Promise<void> {
  await env.STATUS_DB.prepare(
    "UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowUnix, nowUnix, id)
    .run();
}

/** Incidents started within the window OR still unresolved, newest first. */
export async function listIncidents(env: Env, sinceUnix: number): Promise<IncidentRow[]> {
  const { results } = await env.STATUS_DB.prepare(
    "SELECT * FROM incidents WHERE started_at >= ? OR status != 'resolved' ORDER BY started_at DESC",
  )
    .bind(sinceUnix)
    .all<IncidentRow>();
  return results ?? [];
}

export async function hasActiveMaintenance(env: Env, nowUnix: number): Promise<boolean> {
  const row = await env.STATUS_DB.prepare(
    "SELECT COUNT(*) AS n FROM incidents WHERE kind = 'maintenance' AND status = 'in_progress' AND started_at <= ? AND (resolved_at IS NULL OR resolved_at > ?)",
  )
    .bind(nowUnix, nowUnix)
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}

export interface CreateIncidentInput {
  component: string;
  kind: "manual" | "maintenance";
  status: string;
  title: string;
  body: string | null;
  startedAt: number;
  nowUnix: number;
}

export async function createIncident(env: Env, input: CreateIncidentInput): Promise<number> {
  const res = await env.STATUS_DB.prepare(
    "INSERT INTO incidents (component, kind, status, title, body, started_at, resolved_at, created_at, updated_at) VALUES (?,?,?,?,?,?,NULL,?,?)",
  )
    .bind(input.component, input.kind, input.status, input.title, input.body, input.startedAt, input.nowUnix, input.nowUnix)
    .run();
  return Number(res.meta.last_row_id);
}

export async function addIncidentUpdate(
  env: Env,
  incidentId: number,
  status: string,
  body: string,
  nowUnix: number,
): Promise<void> {
  await env.STATUS_DB.batch([
    env.STATUS_DB.prepare(
      "INSERT INTO incident_updates (incident_id, status, body, created_at) VALUES (?,?,?,?)",
    ).bind(incidentId, status, body, nowUnix),
    env.STATUS_DB.prepare("UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?").bind(status, nowUnix, incidentId),
  ]);
}

export async function setIncidentStatus(env: Env, id: number, status: string, nowUnix: number): Promise<void> {
  const resolved = status === "resolved" || status === "completed";
  await env.STATUS_DB.prepare(
    "UPDATE incidents SET status = ?, updated_at = ?, resolved_at = CASE WHEN ? THEN ? ELSE resolved_at END WHERE id = ?",
  )
    .bind(status, nowUnix, resolved ? 1 : 0, nowUnix, id)
    .run();
}
