import type { Env } from "./config";
import { dayKey, INTERVAL_SPEC, type RangeKey } from "./time";
import {
  buildRangeSnapshot,
  buildIntervalSnapshot,
  deriveBanner,
  type RangeSnapshot,
  type IncidentRow,
  type BannerLevel,
} from "./aggregate";
import { getLatestChecks, getDailyWindow, getChecksSince, listIncidents, hasActiveMaintenance } from "./db";

export interface StatusView {
  nowUnix: number;
  ranges: Record<RangeKey, RangeSnapshot>;
  banner: BannerLevel;
  incidents: IncidentRow[];
}

export async function loadStatusView(env: Env, nowUnix: number): Promise<StatusView> {
  const latest = await getLatestChecks(env);
  const since90 = dayKey(nowUnix - 90 * 86400);
  const daily = await getDailyWindow(env, since90);
  // One fetch of raw checks covers both interval views (24h window ⊇ 60m window).
  const intervalChecks = await getChecksSince(env, nowUnix - INTERVAL_SPEC["24h"].windowSeconds);
  const incidents = await listIncidents(env, nowUnix - 90 * 86400);
  const maintenance = await hasActiveMaintenance(env, nowUnix);

  const ranges: Record<RangeKey, RangeSnapshot> = {
    "60m": buildIntervalSnapshot("60m", nowUnix, intervalChecks, latest),
    "24h": buildIntervalSnapshot("24h", nowUnix, intervalChecks, latest),
    "7d": buildRangeSnapshot("7d", nowUnix, daily, latest),
    "30d": buildRangeSnapshot("30d", nowUnix, daily, latest),
    "90d": buildRangeSnapshot("90d", nowUnix, daily, latest),
  };
  const states = ranges["90d"].components.map((c) => c.currentState);
  const banner = deriveBanner(states, maintenance);

  return { nowUnix, ranges, banner, incidents };
}
