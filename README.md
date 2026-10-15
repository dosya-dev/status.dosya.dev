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

Ten components, in two groups. The first group needs no credentials and can only
see whether a surface is routed and answering. The second authenticates and
asserts the response body, so it can see a broken listing. That distinction is
the whole point of the split: for three weeks `GET /api/files` returned 500
while this page reported 100 percent, because the only REST probe asserted a
401 and a 401 is what a broken server returns too.

| Key | Probe | "Up" means |
|-----|-------|-----------|
| `web` | `GET app.dosya.dev/login` | any 2xx/3xx (the dashboard shell loads) |
| `docs` | `GET docs.dosya.dev/healthcheck` | 200 + body `true` (200 + `false` ⇒ **degraded**) |
| `api` | `GET api.dosya.dev/health` | 200 + `{ok:true}` (503 ⇒ **degraded**) |
| `rest` | `GET api.dosya.dev/api/me/name` (unauth) | 401/200/403. Routing and the auth layer are alive. **Proves nothing about a listing** |
| `files` | `GET api.dosya.dev/api/files?...` (bearer) | 200 **and** `{ok:true}` in the body |
| `webdav` | `OPTIONS api.dosya.dev/webdav/` | 200 + `DAV` header. Routing only |
| `dav` | `PROPFIND api.dosya.dev/webdav/{ws}/All/`, `Depth: 1` (basic) | 207. `/All/` is the real tree, so this resolves against the database |
| `s3` | `GET api.dosya.dev/s3/` (unauth) | S3 XML error (200/400/403). Routing only |
| `s3auth` | `GET api.dosya.dev/s3/{ws}?list-type=2` (SigV4) | 200 **and** `ListBucketResult` in the body |
| `sftp` | TCP connect `sftp.dosya.dev:22` | first bytes are an `SSH-2.0-` banner |

Every target is env-configurable (`API_BASE`, `WEB_PROBE_URL`, `DOCS_PROBE_URL`,
`SFTP_PROBE_HOST`, `SFTP_PROBE_PORT`).

An authenticated probe is **omitted entirely** unless its credentials are
configured, rather than reported down: a half-configured probe announcing an
outage on a public page would be a self-inflicted one. Conversely a 401 or 403
from a configured probe reads as **down**, because a revoked probe credential is
a monitoring outage and must not look healthy. `interpretHttp` fails closed, so
an unrecognised component key reads as down too.

### Latency ceilings

`files`, `dav` and `s3auth` also carry a per-component latency ceiling
(`LATENCY_CEILING_MS` in `src/config.ts`). A component that succeeds but whose
**median** latency over the last 10 checks exceeds its ceiling is marked
**degraded**. The median, not the mean, so one cold start cannot move the
verdict; failed probes contribute no sample, so a failure can never read as a
fast response; and fewer than 10 usable samples is never judged at all.

The opening ceilings are deliberately loose and are expected to be tightened
after a week of real data. Degraded time counts against uptime (see Data &
retention), so a ceiling set below a component's real p50 would publish 0
percent uptime for it indefinitely.

## Alerting

Incident **transitions** reach two independent channels: email via Resend and an
event via Sentry. Transitions, not probe results, because the auto-incident
state machine already collapses a sustained outage into one open and one close,
which is what stops a six hour outage sending 360 emails. Each channel sits in
its own `try`/`catch` with its own 8s timeout, so one provider's outage cannot
silence the other, and a failed send is logged rather than thrown. Neither
channel routes through `dosya-api`, because the api is one of the monitored
components.

An active **maintenance** window suppresses alerts entirely: an announced outage
that pages you is how a channel gets ignored.

A `degraded` reading does **not** alert. It shows on the page, but
`decideAutoTransition` only opens an incident when every state in its window is
`down`, so slowness is a pull signal, not a push one.

## Layout
- `src/index.ts` - Worker entry: `scheduled` (cron pipeline) + `fetch` (router).
- `src/config.ts` - component definitions, `Env`, thresholds, latency ceilings.
- `src/probes/` - `http.ts` (timed fetch, pure `interpretHttp` and `assertBody`), `sigv4.ts` (hand-rolled AWS SigV4 over WebCrypto), `sftp.ts` (TCP banner + pure `isSshBanner`), `index.ts` (`runAllProbes`).
- `src/latency.ts` - pure `decideLatencyState` (median over usable samples) + `applyLatencyCeilings`, which only ever downgrades.
- `src/db.ts` - D1 reads/writes (checks, daily rollups, incidents, latency history).
- `src/incidents.ts` - pure auto-incident state machine + orchestration.
- `src/alerts.ts` - pure `decideAlerts`: transitions in, alert payloads out.
- `src/senders.ts` - the only I/O in the alerting path: Resend, and a hand-built Sentry envelope (no SDK, see below).
- `src/aggregate.ts` - pure snapshot/uptime/banner logic.
- `src/snapshot.ts` - glues D1 + aggregate into a `StatusView`.
- `src/render/` - `page.ts`, `admin.ts`, `styles.ts` (inlined, CSP-safe).
- `src/api.ts` - `/api/status`, `/api/uptime` and `/api/heartbeat` JSON.
- `src/auth.ts` - admin bearer-token check.

This Worker has **zero runtime dependencies** and imports nothing from the rest
of the monorepo. That is why the SigV4 signer and the Sentry envelope are
hand-written rather than pulled from an SDK: the envelope is three lines of JSON,
and a monitor with a dependency tree is a monitor with more ways to fail than
the thing it watches.

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
4. Set the secrets (see below). Only `STATUS_ADMIN_TOKEN` is needed to boot.
5. In the Cloudflare dashboard: add DNS + a Worker route for `status.dosya.dev` on the `dosya.dev` zone (the route in `wrangler.jsonc` binds this worker).
6. `npm run deploy`

## Secrets

All of these are `wrangler secret put` values, never committed. Every one is
optional except `STATUS_ADMIN_TOKEN`: an absent value disables that feature
silently, because a monitoring worker must still boot and probe when its own
configuration is incomplete.

| Secret | Without it |
|--------|-----------|
| `STATUS_ADMIN_TOKEN` | `/admin/incidents` refuses everything |
| `RESEND_API_KEY`, `ALERT_EMAIL` | no email alerts |
| `ALERT_FROM` | email is sent from the default `status@dosya.dev` |
| `SENTRY_DSN` | no Sentry events. A malformed DSN is indistinguishable from an absent one, so prove the channel once |
| `STATUS_PUBLIC_URL` | alert bodies link to the default `https://status.dosya.dev` |
| `PROBE_API_KEY`, `PROBE_EMAIL`, `PROBE_WORKSPACE_ID`, `PROBE_FOLDER_ID` | the `files` and `dav` components are not probed at all |
| `PROBE_S3_ACCESS_KEY_ID`, `PROBE_S3_SECRET` | the `s3auth` component is not probed at all |

The probe credential is a **read**-scoped, workspace-pinned API key with **no
folder anchor**. Read scope is what makes its presence here survivable: the key
cannot write or delete anything. The workspace pin is the containment boundary.
The absence of a folder anchor is load-bearing rather than incidental, because
the api refuses an anchored key on every REST request regardless of its declared
surfaces, which would make the `files` probe report a permanent outage that does
not exist. `PROBE_FOLDER_ID` is only the folder the probe lists.

Ids and hostnames are secrets here rather than vars for one reason: this
directory is a public mirror.

## Public endpoints
- `GET /` - the server-rendered status page.
- `GET /health` - `ok`. Liveness only, says nothing about the probes.
- `GET /api/status` - full JSON snapshot: per-component current state, latency, and 7/30/90-day history. Cached 30s, CORS open.
- `GET /api/uptime` - compact cross-component summary for the marketing landing page. Cached 300s, CORS open.
- `GET /api/heartbeat` - how stale the newest check in D1 is (`{newestCheckTs, ageSeconds, ok}`), `200` when fresh and `503` when not. **Never cached**, because a cached heartbeat is a heartbeat that cannot flatline. This is what something outside this Worker reads to watch the watcher: a monitor cannot report its own death, so `apps/api`'s `/api/internal/monitoring/status-freshness` route polls this daily and mails the operator when it goes stale, missing or unreachable.
- `GET /rss.xml`, `GET /feed.xml` - incident feed, last 90 days.

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
- [ ] Wait ~2 min, then `wrangler d1 execute dosya-status --remote --command "SELECT component, COUNT(*) FROM checks GROUP BY component"` shows every configured component accumulating rows (10 with all probe credentials set, 7 without).
- [ ] `curl https://status.dosya.dev/api/heartbeat` → `200` with a small `ageSeconds`.
- [ ] **SFTP probe works from production** - `... "SELECT state, error FROM checks WHERE component='sftp' ORDER BY id DESC LIMIT 3"` shows `up` (not `timeout`). If not, apply the HTTP fallback above.
- [ ] Load `https://status.dosya.dev/` - banner + one tile per configured component + 7/30/90 tabs all render; tabs switch.
- [ ] Post a manual incident via `/admin`; confirm it renders, then `PATCH …/:id {"status":"resolved"}` moves it to resolved.
- [ ] **Prove an alert arrives**, by breaking a probe on purpose (e.g. point `DOCS_PROBE_URL` at a host that does not resolve) and confirming exactly one email and one Sentry event, then exactly one recovery after restoring it. An alert channel that has never fired is not a channel.
- [ ] Confirm the authenticated probes report `up`, then revoke the probe key and confirm all three report `down` within three minutes. If a revoked credential reports anything else, the fail-closed behaviour is not in effect and nothing else here is trustworthy.
