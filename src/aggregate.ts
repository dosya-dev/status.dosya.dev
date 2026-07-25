import {
  COMPONENT_ORDER,
  COMPONENT_LABELS,
  STALE_CHECK_SECONDS,
  type ComponentKey,
  type ProbeState,
} from "./config";
import { lastNDays, RANGE_DAYS, type RangeKey } from "./time";

export interface DailyRow {
  component: string;
  day: string;
  up: number;
  total: number;
  degraded: number;
  sum_latency_ms: number;
}

export interface CheckRow {
  component: string;
  ts: number;
  ok: number;
  state: string;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
}

export interface IncidentRow {
  id: number;
  component: string;
  kind: string;
  status: string;
  title: string;
  body: string | null;
  started_at: number;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

export type BarColor = "up" | "warn" | "down" | "none";
export interface DayBar {
  day: string;
  uptimePct: number | null;
  color: BarColor;
}

export interface ComponentSnapshot {
  key: ComponentKey;
  label: string;
  currentState: ProbeState | "unknown";
  latencyMs: number | null;
  bars: DayBar[];
  uptimePct: number | null;
}

export interface RangeSnapshot {
  range: RangeKey;
  components: ComponentSnapshot[];
  overallUptimePct: number | null;
}

export type BannerLevel = "ok" | "degraded" | "partial" | "major" | "maintenance";

export const BANNER_TEXT: Record<BannerLevel, string> = {
  ok: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
  maintenance: "Scheduled maintenance in progress",
};

export function barColor(uptimePct: number | null): BarColor {
  if (uptimePct === null) return "none";
  if (uptimePct >= 99.5) return "up";
  if (uptimePct >= 95) return "warn";
  return "down";
}

export function currentState(latest: CheckRow | undefined, nowUnix: number): ProbeState | "unknown" {
  if (!latest || nowUnix - latest.ts > STALE_CHECK_SECONDS) return "unknown";
  return latest.state as ProbeState;
}

export function buildRangeSnapshot(
  range: RangeKey,
  nowUnix: number,
  daily: DailyRow[],
  latestByComponent: Map<string, CheckRow>,
): RangeSnapshot {
  const days = lastNDays(nowUnix, RANGE_DAYS[range]);
  const index = new Map<string, DailyRow>();
  for (const r of daily) index.set(`${r.component}:${r.day}`, r);

  let overallUp = 0;
  let overallTotal = 0;

  const components = COMPONENT_ORDER.map<ComponentSnapshot>((key) => {
    let up = 0;
    let total = 0;
    const bars: DayBar[] = days.map((day) => {
      const row = index.get(`${key}:${day}`);
      if (!row || row.total === 0) return { day, uptimePct: null, color: "none" };
      up += row.up;
      total += row.total;
      const pct = (row.up / row.total) * 100;
      return { day, uptimePct: pct, color: barColor(pct) };
    });
    overallUp += up;
    overallTotal += total;
    const latest = latestByComponent.get(key);
    return {
      key,
      label: COMPONENT_LABELS[key],
      currentState: currentState(latest, nowUnix),
      latencyMs: latest?.latency_ms ?? null,
      bars,
      uptimePct: total === 0 ? null : (up / total) * 100,
    };
  });

  return {
    range,
    components,
    overallUptimePct: overallTotal === 0 ? null : (overallUp / overallTotal) * 100,
  };
}

export function deriveBanner(
  states: (ProbeState | "unknown")[],
  hasActiveMaintenance: boolean,
): BannerLevel {
  const down = states.filter((s) => s === "down").length;
  const degraded = states.filter((s) => s === "degraded").length;
  const total = states.length;
  if (down > 0) return down >= Math.ceil(total / 2) ? "major" : "partial";
  if (degraded > 0) return "degraded";
  if (hasActiveMaintenance) return "maintenance";
  return "ok";
}
