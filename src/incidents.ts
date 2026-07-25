import { AUTO_INCIDENT_FAIL_THRESHOLD, COMPONENT_LABELS, type ComponentKey, type Env } from "./config";
import type { ProbeResult } from "./probes/http";
import { getRecentStates, getActiveAutoIncident, openAutoIncident, resolveAutoIncident } from "./db";

export type AutoAction = "open" | "close" | "none";

/**
 * Pure decision for the auto-incident state machine.
 * @param recentStatesNewestFirst states from newest to oldest
 * @param hasOpen whether an ongoing auto-incident already exists for the component
 */
export function decideAutoTransition(recentStatesNewestFirst: string[], hasOpen: boolean): AutoAction {
  const newest = recentStatesNewestFirst[0];
  if (!newest) return "none";
  if (hasOpen) {
    return newest !== "down" ? "close" : "none";
  }
  const window = recentStatesNewestFirst.slice(0, AUTO_INCIDENT_FAIL_THRESHOLD);
  if (window.length >= AUTO_INCIDENT_FAIL_THRESHOLD && window.every((s) => s === "down")) {
    return "open";
  }
  return "none";
}

/** Runs the state machine per component. Assumes the current check is already inserted. */
export async function processIncidents(env: Env, nowUnix: number, results: ProbeResult[]): Promise<void> {
  for (const r of results) {
    const states = await getRecentStates(env, r.component, AUTO_INCIDENT_FAIL_THRESHOLD);
    const open = await getActiveAutoIncident(env, r.component);
    const action = decideAutoTransition(states, !!open);
    if (action === "open") {
      const label = COMPONENT_LABELS[r.component as ComponentKey] ?? r.component;
      // started_at approximated to the first failing check in the threshold window
      const startedAt = nowUnix - (AUTO_INCIDENT_FAIL_THRESHOLD - 1) * 60;
      await openAutoIncident(env, r.component, label, startedAt, nowUnix);
    } else if (action === "close" && open) {
      await resolveAutoIncident(env, open.id, nowUnix);
    }
  }
}
