import { RAW_RETENTION_DAYS, DAILY_RETENTION_DAYS, LATENCY_CEILING_MS, type ComponentKey, type Env } from "./config";
import { runAllProbes } from "./probes";
import {
  insertChecks,
  upsertDaily,
  pruneOld,
  createIncident,
  addIncidentUpdate,
  setIncidentStatus,
  listIncidents,
  hasActiveMaintenance,
  getRecentLatencies,
  getNewestCheckTs,
} from "./db";
import { processIncidents } from "./incidents";
import { applyLatencyCeilings, MIN_LATENCY_SAMPLES } from "./latency";
import { loadStatusView } from "./snapshot";
import { renderPage } from "./render/page";
import { buildStatusJson, buildUptimeJson, buildHeartbeatJson } from "./api";
import { buildRss } from "./rss";
import { checkAdminToken } from "./auth";
import { renderAdmin } from "./render/admin";
import { FAVICON_SVG, faviconIcoBytes } from "./favicon";
import { decideAlerts } from "./alerts";
import { sendAlerts } from "./senders";

export default {
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const raw = await runAllProbes(env);
    // Only components with a configured ceiling need history, so this adds one
    // indexed query per authenticated probe, not per component.
    const ceilinged = raw.filter((r) => LATENCY_CEILING_MS[r.component as ComponentKey] !== undefined);
    const history =
      ceilinged.length > 0
        ? await getRecentLatencies(env, ceilinged.map((r) => r.component), MIN_LATENCY_SAMPLES - 1)
        : new Map<string, Array<number | null>>();
    const results = applyLatencyCeilings(raw, history);
    await insertChecks(env, nowUnix, results);
    await upsertDaily(env, nowUnix, results);
    const transitions = await processIncidents(env, nowUnix, results);
    // Nothing that can throw may sit between the incident write and the alert.
    // processIncidents has already committed the incident row by here, so on
    // the next tick getActiveAutoIncident finds it and decideAutoTransition
    // returns "none": the transition never recurs, and an alert lost to a
    // transient is lost permanently rather than retried. Retention therefore
    // runs after, and it is safe there because sendAlerts wraps every fetch in
    // its own try/catch and cannot throw.
    if (transitions.length > 0) {
      // A throw here must not cost us the alert: processIncidents has already
      // committed the incident row, so the transition never recurs and a lost
      // alert is lost for good. Defaulting to false means a maintenance window
      // plus a D1 transient can page us spuriously, which is an annoyance we
      // can dismiss, where the other direction is an outage nobody hears about.
      let maintenanceActive = false;
      try {
        maintenanceActive = await hasActiveMaintenance(env, nowUnix);
      } catch (e: unknown) {
        console.error(`maintenance lookup failed, alerting anyway: ${String(e)}`);
      }
      const payloads = decideAlerts(transitions, {
        maintenanceActive,
        statusUrl: env.STATUS_PUBLIC_URL || "https://status.dosya.dev",
      });
      await sendAlerts(payloads, {
        resendApiKey: env.RESEND_API_KEY,
        alertEmail: env.ALERT_EMAIL,
        alertFrom: env.ALERT_FROM,
        sentryDsn: env.SENTRY_DSN,
      });
    }
    await pruneOld(env, nowUnix, RAW_RETENTION_DAYS, DAILY_RETENTION_DAYS);
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    // ---- Favicon (same icon as app.dosya.dev) ----
    if (url.pathname === "/favicon.svg") {
      return new Response(FAVICON_SVG, {
        headers: {
          "content-type": "image/svg+xml",
          "cache-control": "public, max-age=86400",
        },
      });
    }
    if (url.pathname === "/favicon.ico") {
      return new Response(faviconIcoBytes(), {
        headers: {
          "content-type": "image/x-icon",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    if (url.pathname === "/api/status") {
      const view = await loadStatusView(env, Math.floor(Date.now() / 1000));
      return Response.json(buildStatusJson(view), {
        headers: { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" },
      });
    }

    // Compact uptime summary for the marketing landing page (cross-origin).
    if (url.pathname === "/api/uptime") {
      const view = await loadStatusView(env, Math.floor(Date.now() / 1000));
      return Response.json(buildUptimeJson(view, url.origin), {
        headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
      });
    }

    if (url.pathname === "/api/heartbeat") {
      const newestTs = await getNewestCheckTs(env);
      const body = buildHeartbeatJson(newestTs, Math.floor(Date.now() / 1000));
      // Never cached: a cached heartbeat is a heartbeat that cannot flatline.
      return Response.json(body, {
        status: body.ok ? 200 : 503,
        headers: { "cache-control": "no-store", "access-control-allow-origin": "*" },
      });
    }

    // RSS feed of incidents.
    if (url.pathname === "/rss.xml" || url.pathname === "/feed.xml") {
      const now = Math.floor(Date.now() / 1000);
      const incidents = await listIncidents(env, now - 90 * 86400);
      return new Response(buildRss(incidents, now, url.origin), {
        headers: {
          "content-type": "application/rss+xml; charset=utf-8",
          "cache-control": "public, max-age=300",
          "access-control-allow-origin": "*",
        },
      });
    }

    // ---- Admin (token-gated) ----
    if (url.pathname === "/admin" && request.method === "GET") {
      return new Response(renderAdmin(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
      });
    }

    if (url.pathname.startsWith("/admin/incidents")) {
      if (!checkAdminToken(request, env)) {
        return new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });
      }
      const now = Math.floor(Date.now() / 1000);

      // POST /admin/incidents - create
      if (url.pathname === "/admin/incidents" && request.method === "POST") {
        const b = (await request.json().catch(() => null)) as
          | { component?: string; kind?: string; status?: string; title?: string; body?: string | null; startedAt?: number }
          | null;
        if (!b || !b.title || !b.status || (b.kind !== "manual" && b.kind !== "maintenance")) {
          return new Response("Bad request", { status: 400 });
        }
        const id = await createIncident(env, {
          component: b.component || "global",
          kind: b.kind,
          status: b.status,
          title: b.title,
          body: b.body ?? null,
          // A maintenance window is announced ahead of time, so its start may be
          // in the future; an incident defaults to now.
          startedAt: typeof b.startedAt === "number" && Number.isFinite(b.startedAt) ? Math.floor(b.startedAt) : now,
          nowUnix: now,
        });
        return Response.json({ id }, { status: 201 });
      }

      // POST /admin/incidents/:id/updates - append an update
      const updMatch = url.pathname.match(/^\/admin\/incidents\/(\d+)\/updates$/);
      if (updMatch && request.method === "POST") {
        const id = Number(updMatch[1]);
        const b = (await request.json().catch(() => null)) as { status?: string; body?: string } | null;
        if (!b || !b.status || !b.body) return new Response("Bad request", { status: 400 });
        await addIncidentUpdate(env, id, b.status, b.body, now);
        return Response.json({ ok: true });
      }

      // PATCH /admin/incidents/:id - change status (e.g. resolve)
      const idMatch = url.pathname.match(/^\/admin\/incidents\/(\d+)$/);
      if (idMatch && request.method === "PATCH") {
        const id = Number(idMatch[1]);
        const b = (await request.json().catch(() => null)) as { status?: string } | null;
        if (!b || !b.status) return new Response("Bad request", { status: 400 });
        await setIncidentStatus(env, id, b.status, now);
        return Response.json({ ok: true });
      }

      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/" || url.pathname === "") {
      const view = await loadStatusView(env, Math.floor(Date.now() / 1000));
      return new Response(renderPage(view), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
      });
    }

    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  },
};
