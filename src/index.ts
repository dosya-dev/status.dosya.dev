import { RAW_RETENTION_DAYS, DAILY_RETENTION_DAYS, type Env } from "./config";
import { runAllProbes } from "./probes";
import { insertChecks, upsertDaily, pruneOld } from "./db";
import { processIncidents } from "./incidents";
import { loadStatusView } from "./snapshot";
import { renderPage } from "./render/page";
import { buildStatusJson } from "./api";
import { checkAdminToken } from "./auth";
import { renderAdmin } from "./render/admin";
import { createIncident, addIncidentUpdate, setIncidentStatus } from "./db";

export default {
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const results = await runAllProbes(env);
    await insertChecks(env, nowUnix, results);
    await upsertDaily(env, nowUnix, results);
    await processIncidents(env, nowUnix, results);
    await pruneOld(env, nowUnix, RAW_RETENTION_DAYS, DAILY_RETENTION_DAYS);
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    if (url.pathname === "/api/status") {
      const view = await loadStatusView(env, Math.floor(Date.now() / 1000));
      return Response.json(buildStatusJson(view), {
        headers: { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" },
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

      // POST /admin/incidents — create
      if (url.pathname === "/admin/incidents" && request.method === "POST") {
        const b = (await request.json().catch(() => null)) as
          | { component?: string; kind?: string; status?: string; title?: string; body?: string | null }
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
          startedAt: now,
          nowUnix: now,
        });
        return Response.json({ id }, { status: 201 });
      }

      // POST /admin/incidents/:id/updates — append an update
      const updMatch = url.pathname.match(/^\/admin\/incidents\/(\d+)\/updates$/);
      if (updMatch && request.method === "POST") {
        const id = Number(updMatch[1]);
        const b = (await request.json().catch(() => null)) as { status?: string; body?: string } | null;
        if (!b || !b.status || !b.body) return new Response("Bad request", { status: 400 });
        await addIncidentUpdate(env, id, b.status, b.body, now);
        return Response.json({ ok: true });
      }

      // PATCH /admin/incidents/:id — change status (e.g. resolve)
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
