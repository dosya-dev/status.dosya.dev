import type { Env } from "./config";
import { dayKey, type RangeKey } from "./time";
import {
  buildRangeSnapshot,
  deriveBanner,
  type RangeSnapshot,
  type IncidentRow,
  type BannerLevel,
} from "./aggregate";
import { getLatestChecks, getDailyWindow, listIncidents, hasActiveMaintenance } from "./db";

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
  const incidents = await listIncidents(env, nowUnix - 90 * 86400);
  const maintenance = await hasActiveMaintenance(env, nowUnix);

  const ranges: Record<RangeKey, RangeSnapshot> = {
    "7d": buildRangeSnapshot("7d", nowUnix, daily, latest),
    "30d": buildRangeSnapshot("30d", nowUnix, daily, latest),
    "90d": buildRangeSnapshot("90d", nowUnix, daily, latest),
  };
  const states = ranges["90d"].components.map((c) => c.currentState);
  const banner = deriveBanner(states, maintenance);

  return { nowUnix, ranges, banner, incidents };
}
