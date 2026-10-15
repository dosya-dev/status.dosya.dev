export type ComponentKey =
  | "web"
  | "docs"
  | "api"
  | "rest"
  | "files"
  | "webdav"
  | "dav"
  | "s3"
  | "s3auth"
  | "sftp";
export type ProbeKind = "http" | "sftp";
export type ProbeState = "up" | "degraded" | "down";

export interface ComponentDef {
  key: ComponentKey;
  label: string;
  kind: ProbeKind;
  method?: string;
  url?: string;
  host?: string;
  port?: number;
  /** How probeHttp authenticates. Absent means an unauthenticated probe. */
  auth?: "bearer" | "basic" | "sigv4";
  /** Which body assertion applies when a success status is not proof on its own. */
  bodyAssert?: "filesOk" | "listBucketResult";
  headers?: Record<string, string>;
  credentials?: {
    apiKey?: string;
    email?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

export interface Env {
  STATUS_DB: D1Database;
  STATUS_ADMIN_TOKEN?: string;
  API_BASE?: string;
  WEB_PROBE_URL?: string;
  DOCS_PROBE_URL?: string;
  SFTP_PROBE_HOST?: string;
  SFTP_PROBE_PORT?: string;
  // Authenticated probe credential. A read-scoped, workspace-pinned API key
  // with NO folder anchor: see the comment above the `files` probe below for
  // why an anchor is fatal here. Read scope is why nothing here can write. Ids
  // are secrets, not vars, because this repo is a public mirror (same reason
  // as SFTP_PROBE_HOST).
  PROBE_API_KEY?: string;
  PROBE_EMAIL?: string;
  PROBE_WORKSPACE_ID?: string;
  /**
   * The folder the `files` probe lists. Not a key anchor: the key must not be
   * anchored at all. This only keeps the probe off a polluted workspace root.
   */
  PROBE_FOLDER_ID?: string;
  PROBE_S3_ACCESS_KEY_ID?: string;
  PROBE_S3_SECRET?: string;
  // Alerting. An absent value disables that channel silently, matching
  // apps/api's resolveDsn convention: a monitoring worker must boot and probe
  // even when its alert config is incomplete.
  RESEND_API_KEY?: string;
  ALERT_EMAIL?: string;
  ALERT_FROM?: string;
  SENTRY_DSN?: string;
  STATUS_PUBLIC_URL?: string;
}

// 10s so a cold-starting worker (e.g. api /health touching D1 + R2, ~5s cold)
// isn't recorded as downtime; probes still run in parallel so the cron stays fast.
export const PROBE_TIMEOUT_MS = 10000;
export const AUTO_INCIDENT_FAIL_THRESHOLD = 2;
export const RAW_RETENTION_DAYS = 8;
export const DAILY_RETENTION_DAYS = 120;
export const STALE_CHECK_SECONDS = 300;
/** A cron that has not written a check in this long has stopped. */
export const HEARTBEAT_MAX_AGE_SECONDS = 900;

export const COMPONENT_ORDER: ComponentKey[] = [
  "web",
  "docs",
  "api",
  "rest",
  "files",
  "webdav",
  "dav",
  "s3",
  "s3auth",
  "sftp",
];
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  web: "Web App",
  docs: "Document Editor",
  api: "API",
  // Relabelled: this probe asserts a 401 and cannot see a broken listing.
  // Calling it "REST API" is what let the page report 100 percent for 90 days
  // while GET /api/files was returning 500.
  rest: "REST API (routing)",
  files: "File Listing",
  webdav: "WebDAV (routing)",
  dav: "WebDAV Listing",
  s3: "S3 API (routing)",
  s3auth: "S3 Listing",
  sftp: "SFTP",
};

/**
 * How the public page presents the probes. A product is what a customer
 * recognises (REST API, WebDAV); its checks are the probes behind it, in the
 * order they execute conceptually: routing first, then the authenticated
 * listing. The LAST check in a product is the one a user actually feels, so
 * the page shows its latency. Every ComponentKey must appear in exactly one
 * product (view.unit.test.ts asserts it) or it silently vanishes from the page.
 */
export type ProductKey = "webapp" | "docs" | "api" | "rest" | "webdav" | "s3" | "sftp";
export type GroupKey = "web" | "api" | "protocols";
export interface CheckDef {
  key: ComponentKey;
  /** Short name for the check pill ("Routing", "File listing"). */
  label: string;
}
export interface ProductDef {
  key: ProductKey;
  label: string;
  /** One plain sentence on what the probe really verifies. */
  description: string;
  checks: CheckDef[];
}
export interface GroupDef {
  key: GroupKey;
  label: string;
  products: ProductDef[];
}

export const PRODUCT_GROUPS: GroupDef[] = [
  {
    key: "web",
    label: "Web",
    products: [
      {
        key: "webapp",
        label: "Web App",
        description: "Confirms the web application at app.dosya.dev loads and renders correctly.",
        checks: [{ key: "web", label: "Page load" }],
      },
      {
        key: "docs",
        label: "Document Editor",
        description: "Confirms the document editing service is online and responding.",
        checks: [{ key: "docs", label: "Health" }],
      },
    ],
  },
  {
    key: "api",
    label: "API",
    products: [
      {
        key: "api",
        label: "API",
        description: "Checks the API's health endpoint, which also exercises its database and storage layers.",
        checks: [{ key: "api", label: "Health" }],
      },
      {
        key: "rest",
        label: "REST API",
        description: "Confirms API routing is live, then lists a real workspace folder with a read-only key to prove the file API works end to end.",
        checks: [
          { key: "rest", label: "Routing" },
          { key: "files", label: "File listing" },
        ],
      },
    ],
  },
  {
    key: "protocols",
    label: "Protocols",
    products: [
      {
        key: "webdav",
        label: "WebDAV",
        description: "Confirms the WebDAV endpoint is reachable, then lists a real folder over an authenticated session.",
        checks: [
          { key: "webdav", label: "Routing" },
          { key: "dav", label: "Listing" },
        ],
      },
      {
        key: "s3",
        label: "S3 API",
        description: "Confirms unsigned requests are rejected, then performs a signed bucket listing to prove the S3 gateway works end to end.",
        checks: [
          { key: "s3", label: "Routing" },
          { key: "s3auth", label: "Listing" },
        ],
      },
      {
        key: "sftp",
        label: "SFTP",
        description: "Connects to the SFTP service and confirms it accepts sessions.",
        checks: [{ key: "sftp", label: "Connection" }],
      },
    ],
  },
];

/** Product label for a probe key, or the incident's own key when it is not a probe (e.g. "global"). */
export function productLabelFor(component: string): string {
  for (const g of PRODUCT_GROUPS) {
    for (const p of g.products) {
      if (p.checks.some((c) => c.key === component)) return p.label;
    }
  }
  return component === "global" ? "All services" : component;
}

/**
 * Per-component latency ceilings in ms. PROVISIONAL, and deliberately loose:
 * the only live measurement of the `files` request during design was 7480ms,
 * so a 3000ms ceiling would have parked that component on `degraded`
 * permanently. That is not a cosmetic mistake. upsertDaily counts only a fully
 * `up` check, so a permanently degraded component publishes 0 percent uptime,
 * buildUptimeJson averages that across components for the marketing landing
 * page, and deriveBanner reads "Degraded performance" for as long as it lasts.
 *
 * Tighten these in a follow-up once Step B2's hand-check and a week of real
 * data have established each component's actual p50. Erring loose costs
 * sensitivity to slowness; erring tight manufactures an outage on a public
 * page.
 */
export const LATENCY_CEILING_MS: Partial<Record<ComponentKey, number>> = {
  files: 8000,
  dav: 4000,
  s3auth: 4000,
};

export function resolveComponents(env: Env): ComponentDef[] {
  const apiBase = (env.API_BASE || "https://api.dosya.dev").replace(/\/$/, "");
  const webUrl = env.WEB_PROBE_URL || "https://app.dosya.dev/login";
  const docsUrl = env.DOCS_PROBE_URL || "https://docs.dosya.dev/healthcheck";
  const sftpHost = env.SFTP_PROBE_HOST || "sftp.dosya.dev";
  const sftpPort = parseInt(env.SFTP_PROBE_PORT || "22", 10);

  const components: ComponentDef[] = [
    { key: "web", label: COMPONENT_LABELS.web, kind: "http", method: "GET", url: webUrl },
    { key: "docs", label: COMPONENT_LABELS.docs, kind: "http", method: "GET", url: docsUrl },
    { key: "api", label: COMPONENT_LABELS.api, kind: "http", method: "GET", url: `${apiBase}/health` },
    { key: "rest", label: COMPONENT_LABELS.rest, kind: "http", method: "GET", url: `${apiBase}/api/me/name` },
    { key: "webdav", label: COMPONENT_LABELS.webdav, kind: "http", method: "OPTIONS", url: `${apiBase}/webdav/` },
    { key: "s3", label: COMPONENT_LABELS.s3, kind: "http", method: "GET", url: `${apiBase}/s3/` },
    { key: "sftp", label: COMPONENT_LABELS.sftp, kind: "sftp", host: sftpHost, port: sftpPort },
  ];

  // Authenticated probes are appended only when fully configured. A
  // half-configured probe reporting down would be a self-inflicted outage on
  // a public page.
  const key = env.PROBE_API_KEY;
  const ws = env.PROBE_WORKSPACE_ID;
  const folder = env.PROBE_FOLDER_ID;
  const email = env.PROBE_EMAIL;

  // The probe key must NOT be folder-anchored. apps/api's middleware refuses
  // any anchored key on every REST request, unconditionally, before endpoint
  // logic and regardless of the key's `surfaces`: see the isAnchored check in
  // apps/api/src/middleware.ts, asserted against production by
  // packages/prod-smoke/tests/negative.smoke.test.ts. An anchored key would
  // make this probe answer 403 on every tick, which interpretHttp reads as
  // down, which opens a permanent incident for an outage that does not exist.
  // Containment comes from api_keys.workspace_id plus the read scope instead,
  // both of which middleware.ts does enforce on REST.
  if (key && ws && folder) {
    components.push({
      key: "files",
      label: COMPONENT_LABELS.files,
      kind: "http",
      method: "GET",
      url: `${apiBase}/api/files?workspace_id=${encodeURIComponent(ws)}&folder_id=${encodeURIComponent(folder)}`,
      auth: "bearer",
      bodyAssert: "filesOk",
      credentials: { apiKey: key },
    });
  }
  // `/All/` with Depth 1, not the workspace root with Depth 0. With an
  // unanchored key, interpretPath([], null) in apps/api/src/lib/webdav/views.ts
  // returns { kind: "root" }, which propfind.ts answers from a hardcoded list
  // of the six virtual collections and touches no database at all. A probe
  // labelled "WebDAV Listing" would then report green straight through any
  // real listing breakage, which is the exact lie the `rest` relabel exists to
  // remove. interpretPath(["All"], null) returns { kind: "real" } and does
  // resolve against D1.
  if (key && ws && email) {
    components.push({
      key: "dav",
      label: COMPONENT_LABELS.dav,
      kind: "http",
      method: "PROPFIND",
      url: `${apiBase}/webdav/${encodeURIComponent(ws)}/All/`,
      auth: "basic",
      headers: { depth: "1" },
      credentials: { apiKey: key, email },
    });
  }
  if (ws && env.PROBE_S3_ACCESS_KEY_ID && env.PROBE_S3_SECRET) {
    components.push({
      key: "s3auth",
      label: COMPONENT_LABELS.s3auth,
      kind: "http",
      method: "GET",
      url: `${apiBase}/s3/${encodeURIComponent(ws)}?list-type=2&max-keys=1`,
      auth: "sigv4",
      bodyAssert: "listBucketResult",
      credentials: {
        accessKeyId: env.PROBE_S3_ACCESS_KEY_ID,
        secretAccessKey: env.PROBE_S3_SECRET,
      },
    });
  }
  return components;
}
