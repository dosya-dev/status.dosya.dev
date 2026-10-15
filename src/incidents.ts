import { AUTO_INCIDENT_FAIL_THRESHOLD, COMPONENT_LABELS, type ComponentKey, type Env } from "./config";
import type { ProbeResult } from "./probes/http";
import { getRecentStates, getActiveAutoIncident, openAutoIncident, resolveAutoIncident } from "./db";
import type { Transition } from "./alerts";

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

/** Pure: the transition record an alert is built from. */
export function buildTransition(
  component: string,
  action: "open" | "close",
  nowUnix: number,
  openedAt?: number,
): Transition {
  const label = COMPONENT_LABELS[component as ComponentKey] ?? component;
  // An open is backdated to the first failing check in the threshold window,
  // matching what openAutoIncident writes to started_at. A close carries the
  // real start time off the incident row, so a recovery alert can state when
  // the outage actually began instead of claiming it began as it ended.
  const startedAt =
    action === "open"
      ? nowUnix - (AUTO_INCIDENT_FAIL_THRESHOLD - 1) * 60
      : (openedAt ?? nowUnix);
  return { component, label, action, startedAt };
}

/**
 * Runs the state machine per component. Assumes the current check is already
 * inserted. Returns the transitions it made, so the caller can alert on them;
 * returning them rather than sending from here keeps this function's only
 * side effects in D1.
 */
export async function processIncidents(
  env: Env,
  nowUnix: number,
  results: ProbeResult[],
): Promise<Transition[]> {
  const transitions: Transition[] = [];
  for (const r of results) {
    const states = await getRecentStates(env, r.component, AUTO_INCIDENT_FAIL_THRESHOLD);
    const open = await getActiveAutoIncident(env, r.component);
    const action = decideAutoTransition(states, !!open);
    if (action === "open") {
      const t = buildTransition(r.component, "open", nowUnix);
      await openAutoIncident(env, r.component, t.label, t.startedAt, nowUnix);
      transitions.push(t);
    } else if (action === "close" && open) {
      await resolveAutoIncident(env, open.id, nowUnix);
      transitions.push(buildTransition(r.component, "close", nowUnix, open.started_at));
    }
  }
  return transitions;
}
