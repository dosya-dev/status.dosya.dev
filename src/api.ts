import type { StatusView } from "./snapshot";

/** Advertised uptime SLA target (matches the marketing site's "99.9% Uptime SLA"). */
export const UPTIME_SLA_TARGET = 99.9;

function round(pct: number | null, dp = 3): number | null {
  if (pct === null) return null;
  const f = Math.pow(10, dp);
  return Math.round(pct * f) / f;
}

/**
 * Compact summary for the marketing landing page: the SLA target plus the real
 * measured average uptime across all components. Cross-origin (dosya.dev), so
 * the caller serves it with permissive CORS.
 */
export function buildUptimeJson(view: StatusView, statusUrl: string): object {
  return {
    slaTarget: UPTIME_SLA_TARGET,
    avgUptimePct: round(view.ranges["90d"].overallUptimePct),
    windowDays: 90,
    avgUptime30dPct: round(view.ranges["30d"].overallUptimePct),
    generatedAt: view.nowUnix,
    statusUrl,
  };
}

export function buildStatusJson(view: StatusView): object {
  return {
    banner: view.banner,
    generatedAt: view.nowUnix,
    ranges: view.ranges,
    incidents: view.incidents.map((i) => ({
      id: i.id,
      component: i.component,
      kind: i.kind,
      status: i.status,
      title: i.title,
      body: i.body,
      startedAt: i.started_at,
      resolvedAt: i.resolved_at,
    })),
  };
}
