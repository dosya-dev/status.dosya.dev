/**
 * Pure alert decisions. No I/O lives here so the rules are testable without a
 * network or a D1 binding.
 *
 * The input is TRANSITIONS, not probe results. That is deliberate: the
 * auto-incident state machine already collapses a sustained outage into one
 * open and one close, so alerting on transitions is what stops a 6 hour outage
 * from sending 360 emails.
 */

export type AlertKind = "down" | "recovered";

export interface Transition {
  component: string;
  label: string;
  action: "open" | "close";
  /** First failing check in the threshold window, as recorded on the incident. */
  startedAt: number;
}

export interface AlertPayload {
  kind: AlertKind;
  component: string;
  label: string;
  subject: string;
  text: string;
  /** Stable per component so one outage collapses into one Sentry issue. */
  fingerprint: string;
}

export interface DecideAlertsOptions {
  maintenanceActive: boolean;
  statusUrl: string;
}

export function decideAlerts(
  transitions: Transition[],
  opts: DecideAlertsOptions,
): AlertPayload[] {
  // A maintenance window is an announced outage. Alerting on it trains the
  // recipient to ignore the channel, which is the failure mode this whole
  // change exists to fix.
  if (opts.maintenanceActive) return [];

  return transitions.map((t) => {
    const kind: AlertKind = t.action === "open" ? "down" : "recovered";
    const subject =
      kind === "down"
        ? `[dosya] ${t.label} is DOWN`
        : `[dosya] ${t.label} has recovered`;
    const when = new Date(t.startedAt * 1000).toISOString();
    const text =
      kind === "down"
        ? `${t.label} (${t.component}) started failing at ${when}.\n\n${opts.statusUrl}`
        : `${t.label} (${t.component}) is answering again. It started failing at ${when}.\n\n${opts.statusUrl}`;
    return {
      kind,
      component: t.component,
      label: t.label,
      subject,
      text,
      fingerprint: `status:${t.component}`,
    };
  });
}
