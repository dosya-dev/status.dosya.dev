import {
  COMPONENT_ORDER,
  COMPONENT_LABELS,
  STALE_CHECK_SECONDS,
  type ComponentKey,
  type ProbeState,
} from "./config";
import {
  lastNDays,
  lastNBuckets,
  RANGE_DAYS,
  INTERVAL_SPEC,
  type RangeKey,
  type DayRangeKey,
  type IntervalRangeKey,
} from "./time";

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

/**
 * Worst-state coloring for fine-grained interval buckets (60m/24h), where a
 * bucket holds few samples: any down → red, else any degraded → warn, else up.
 * (Day-view bars keep the percentage thresholds in `barColor`.)
 */
export function bucketColor(up: number, degraded: number, down: number, total: number): BarColor {
  if (total === 0) return "none";
  if (down > 0) return "down";
  if (degraded > 0) return "warn";
  return "up";
}

export function currentState(latest: CheckRow | undefined, nowUnix: number): ProbeState | "unknown" {
  if (!latest || nowUnix - latest.ts > STALE_CHECK_SECONDS) return "unknown";
  return latest.state as ProbeState;
}

export function buildRangeSnapshot(
  range: DayRangeKey,
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

/**
 * Build a fine-grained interval snapshot (60m/24h) by bucketing raw checks into
 * fixed time slices. Each bar is one slice; the window uptime % is up/total
 * across all slices.
 */
export function buildIntervalSnapshot(
  range: IntervalRangeKey,
  nowUnix: number,
  checks: CheckRow[],
  latestByComponent: Map<string, CheckRow>,
): RangeSnapshot {
  const spec = INTERVAL_SPEC[range];
  const starts = lastNBuckets(nowUnix, spec.count, spec.step);
  const windowStart = starts[0];
  const windowEnd = starts[starts.length - 1] + spec.step;

  const byComponent = new Map<string, CheckRow[]>();
  for (const c of checks) {
    if (c.ts < windowStart || c.ts >= windowEnd) continue;
    const arr = byComponent.get(c.component);
    if (arr) arr.push(c);
    else byComponent.set(c.component, [c]);
  }

  let overallUp = 0;
  let overallTotal = 0;

  const components = COMPONENT_ORDER.map<ComponentSnapshot>((key) => {
    const rows = byComponent.get(key) ?? [];
    let up = 0;
    let total = 0;
    const bars: DayBar[] = starts.map((start) => {
      const end = start + spec.step;
      let bUp = 0;
      let bDeg = 0;
      let bDown = 0;
      let bTotal = 0;
      for (const r of rows) {
        if (r.ts < start || r.ts >= end) continue;
        bTotal++;
        if (r.state === "up") bUp++;
        else if (r.state === "degraded") bDeg++;
        else bDown++;
      }
      up += bUp;
      total += bTotal;
      return {
        day: spec.label(start),
        uptimePct: bTotal === 0 ? null : (bUp / bTotal) * 100,
        color: bucketColor(bUp, bDeg, bDown, bTotal),
      };
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
