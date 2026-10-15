import type { AlertPayload } from "./alerts";

/**
 * The only I/O in the alerting path. Both senders take an injected `fetch` so
 * tests never touch the network.
 *
 * Why this file does not use @sentry/cloudflare: this Worker has zero runtime
 * dependencies and a README that promises self-containment, and all we need is
 * one message event per transition. The envelope format is three lines of JSON.
 *
 * Why neither sender routes through dosya-api: the api is a MONITORED
 * component. Alerting through it guarantees silence at exactly the moment the
 * alert matters.
 */

export interface SenderConfig {
  resendApiKey?: string;
  alertEmail?: string;
  alertFrom?: string;
  sentryDsn?: string;
}

export interface SendOutcome {
  channel: string;
  ok: boolean;
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "status@dosya.dev";
/**
 * Every other outbound call on this branch is bounded (probeHttp has its own
 * timeout, api's sendEmail uses 8s), and these two are the ones running inside
 * `scheduled`. A hung Resend or Sentry socket with no signal would hold the
 * cron invocation open until the runtime killed it. An abort lands in the
 * try/catch below and is reported as a failed outcome, same as any other
 * error.
 */
const SEND_TIMEOUT_MS = 8000;

/** Pure: split `https://<publicKey>@<host>/<projectId>` into its parts. */
export function parseSentryDsn(
  dsn: string,
): { host: string; projectId: string; publicKey: string } | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\//, "");
  if (!publicKey || !projectId) return null;
  return { host: url.host, projectId, publicKey };
}

/** Pure: a Sentry envelope carrying one message event. */
export function buildSentryEnvelope(
  payload: AlertPayload,
  projectId: string,
  nowMs: number,
): string {
  const sentAt = new Date(nowMs).toISOString();
  const envelopeHeader = { event_id: crypto.randomUUID().replace(/-/g, ""), sent_at: sentAt };
  const itemHeader = { type: "event" };
  const event = {
    message: payload.subject,
    // A recovery is not an incident. Keeping it at info means the channel
    // reports the whole story without paging twice per outage.
    level: payload.kind === "down" ? "error" : "info",
    platform: "javascript",
    timestamp: Math.floor(nowMs / 1000),
    logger: "status-probe",
    fingerprint: [payload.fingerprint],
    tags: { component: payload.component, kind: payload.kind },
    extra: { detail: payload.text },
  };
  return [envelopeHeader, itemHeader, event].map((o) => JSON.stringify(o)).join("\n");
}

/** Pure: the Resend request body. */
export function buildResendBody(payload: AlertPayload, from: string, to: string): object {
  return { from, to: [to], subject: payload.subject, text: payload.text };
}

function errText(e: unknown): string {
  const err = e as { message?: string };
  return String(err?.message || e).slice(0, 200);
}

export async function sendAlerts(
  payloads: AlertPayload[],
  cfg: SenderConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SendOutcome[]> {
  if (payloads.length === 0) return [];
  const outcomes: SendOutcome[] = [];

  for (const payload of payloads) {
    if (cfg.resendApiKey && cfg.alertEmail) {
      try {
        const res = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${cfg.resendApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(
            buildResendBody(payload, cfg.alertFrom || DEFAULT_FROM, cfg.alertEmail),
          ),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        outcomes.push(
          res.ok
            ? { channel: "email", ok: true }
            : { channel: "email", ok: false, error: `HTTP ${res.status}` },
        );
      } catch (e: unknown) {
        outcomes.push({ channel: "email", ok: false, error: errText(e) });
      }
    }

    // Deliberately a separate try block, not an else. A Resend outage must not
    // cost us the Sentry record, and vice versa.
    const dsn = cfg.sentryDsn ? parseSentryDsn(cfg.sentryDsn) : null;
    if (dsn) {
      try {
        const res = await fetchImpl(`https://${dsn.host}/api/${dsn.projectId}/envelope/`, {
          method: "POST",
          headers: {
            "content-type": "application/x-sentry-envelope",
            "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=dosya-status/1.0`,
          },
          body: buildSentryEnvelope(payload, dsn.projectId, Date.now()),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        outcomes.push(
          res.ok
            ? { channel: "sentry", ok: true }
            : { channel: "sentry", ok: false, error: `HTTP ${res.status}` },
        );
      } catch (e: unknown) {
        outcomes.push({ channel: "sentry", ok: false, error: errText(e) });
      }
    }
  }

  for (const o of outcomes) {
    // The cron has no reader, so a failed alert has to land somewhere a human
    // can find it. Worker observability is enabled on this script.
    if (!o.ok) console.error(`alert channel ${o.channel} failed: ${o.error}`);
  }
  return outcomes;
}
