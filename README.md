# @dosya-dev/status - status.dosya.dev

> **Open source (MIT).** This repository is a read-only public mirror, synced
> automatically from the dosya.dev monorepo on each production release. It is
> self-contained and free to read, fork, and adapt under the [MIT License](./LICENSE).

Self-contained Cloudflare Worker that probes dosya.dev's service surfaces every
minute and renders a public status page with 7/30/90-day uptime, latency, and
incident history. Entirely on Cloudflare: a Cron Trigger drives the probes, a
dedicated D1 database stores history, and the same Worker server-renders the
page + a JSON API + a token-gated admin surface.

## Components probed
| Key | Probe | "Up" means |
|-----|-------|-----------|
| `api` | `GET api.dosya.dev/health` | 200 + `{ok:true}` (503 ⇒ **degraded**) |
| `rest` | `GET api.dosya.dev/api/me/name` (unauth) | 401 (routing + auth layer alive) |
| `webdav` | `OPTIONS api.dosya.dev/webdav/` | 200 + `DAV` header |
| `s3` | `GET api.dosya.dev/s3/` (unauth) | S3 XML error (403/400) |
| `sftp` | TCP connect `sftp.dosya.dev:22` | first bytes are an `SSH-2.0-` banner |

Every target is env-configurable (`API_BASE`, `SFTP_PROBE_HOST`, `SFTP_PROBE_PORT`).

## Layout
- `src/index.ts` - Worker entry: `scheduled` (cron pipeline) + `fetch` (router).
- `src/probes/` - `http.ts` (timed fetch + pure `interpretHttp`), `sftp.ts` (TCP banner + pure `isSshBanner`), `index.ts` (`runAllProbes`).
- `src/db.ts` - D1 reads/writes (checks, daily rollups, incidents).
- `src/incidents.ts` - pure auto-incident state machine + orchestration.
- `src/aggregate.ts` - pure snapshot/uptime/banner logic.
- `src/snapshot.ts` - glues D1 + aggregate into a `StatusView`.
- `src/render/` - `page.ts`, `admin.ts`, `styles.ts` (inlined, CSP-safe).
- `src/api.ts` - `/api/status` JSON.
- `src/auth.ts` - admin bearer-token check.

## Local dev
```bash
npm install
npm test           # vitest unit tests (pure logic)
npm run typecheck  # tsc --noEmit
nvm use 22         # wrangler needs Node 22 (repo shell defaults to 18)
npm run db:migrate:local
# optional: echo 'STATUS_ADMIN_TOKEN="devtoken"' > .dev.vars   (gitignored) to test /admin
npx wrangler dev --local --test-scheduled
# then, in another shell:
curl "http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*"   # run one probe cycle
curl http://127.0.0.1:8787/                                # page
curl http://127.0.0.1:8787/api/status                      # JSON
```

## First-time provisioning (production)
1. `nvm use 22`
2. `npx wrangler d1 create dosya-status` → copy the printed `database_id` into `wrangler.jsonc` (replaces `REPLACE_AFTER_D1_CREATE`).
3. `npm run db:migrate:remote`
4. `npx wrangler secret put STATUS_ADMIN_TOKEN`
5. In the Cloudflare dashboard: add DNS + a Worker route for `status.dosya.dev` on the `dosya.dev` zone (the route in `wrangler.jsonc` binds this worker).
6. `npm run deploy`

## SFTP probe caveat (verify after first deploy)
The SFTP probe opens a raw TCP socket to port 22 via `cloudflare:sockets`. It
always settles within the 5s timeout (socket teardown is fire-and-forget so a
half-open connection can't wedge the cron).

Observed in local dev: `sftp.dosya.dev:22` is unreachable from a normal client
network (SYN silently dropped), so the local probe - and even `nc` - time out
and report `down`. This is a **network-reachability** result, not a code bug;
the HTTP probes returned real UP results locally. Confirm from production
whether Cloudflare's edge can reach port 22 (checklist below). If Workers cannot
reach it, add a small HTTP health listener to `apps/ftp-server` and repoint the
probe (adjust `probeSftp` / `SFTP_PROBE_*`).

## Admin (manual incidents / maintenance)
Visit `https://status.dosya.dev/admin`, paste the `STATUS_ADMIN_TOKEN`, and post
an incident or maintenance window. API (all require `Authorization: Bearer <token>`):
- `POST /admin/incidents` - `{component, kind:"manual"|"maintenance", status, title, body?}` → `{id}`
- `POST /admin/incidents/:id/updates` - `{status, body}` (appends a timeline entry)
- `PATCH /admin/incidents/:id` - `{status}` (e.g. `"resolved"` / `"completed"` sets `resolved_at`)

## Data & retention
- `checks` - one raw row per component per minute; pruned after **8 days**.
- `daily` - per-component/day rollup (`up`/`total`/`degraded`/`sum_latency_ms`); retained **120 days**; powers 7/30/90-day bars & uptime %. `up` counts only fully-up checks, so `degraded` time counts against uptime.
- `incidents` + `incident_updates` - auto (opened after **2 consecutive** downs, auto-resolved on recovery) and manual/maintenance.

## Post-deploy manual verification checklist
- [ ] `curl https://status.dosya.dev/health` → `ok`
- [ ] Wait ~2 min, then `wrangler d1 execute dosya-status --remote --command "SELECT component, COUNT(*) FROM checks GROUP BY component"` shows all 5 components accumulating rows.
- [ ] **SFTP probe works from production** - `... "SELECT state, error FROM checks WHERE component='sftp' ORDER BY id DESC LIMIT 3"` shows `up` (not `timeout`). If not, apply the HTTP fallback above.
- [ ] Load `https://status.dosya.dev/` - banner + 5 tiles + 7/30/90 tabs all render; tabs switch.
- [ ] Post a manual incident via `/admin`; confirm it renders, then `PATCH …/:id {"status":"resolved"}` moves it to resolved.
