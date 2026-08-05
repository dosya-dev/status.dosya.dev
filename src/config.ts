export type ComponentKey = "web" | "docs" | "api" | "rest" | "webdav" | "s3" | "sftp";
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
}

export interface Env {
  STATUS_DB: D1Database;
  STATUS_ADMIN_TOKEN?: string;
  API_BASE?: string;
  WEB_PROBE_URL?: string;
  DOCS_PROBE_URL?: string;
  SFTP_PROBE_HOST?: string;
  SFTP_PROBE_PORT?: string;
}

// 10s so a cold-starting worker (e.g. api /health touching D1 + R2, ~5s cold)
// isn't recorded as downtime; probes still run in parallel so the cron stays fast.
export const PROBE_TIMEOUT_MS = 10000;
export const AUTO_INCIDENT_FAIL_THRESHOLD = 2;
export const RAW_RETENTION_DAYS = 8;
export const DAILY_RETENTION_DAYS = 120;
export const STALE_CHECK_SECONDS = 300;

export const COMPONENT_ORDER: ComponentKey[] = ["web", "docs", "api", "rest", "webdav", "s3", "sftp"];
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  web: "Web App",
  docs: "Document Editor",
  api: "API",
  rest: "REST API",
  webdav: "WebDAV",
  s3: "S3 API",
  sftp: "SFTP",
};

export function resolveComponents(env: Env): ComponentDef[] {
  const apiBase = (env.API_BASE || "https://api.dosya.dev").replace(/\/$/, "");
  const webUrl = env.WEB_PROBE_URL || "https://app.dosya.dev/login";
  const docsUrl = env.DOCS_PROBE_URL || "https://docs.dosya.dev/healthcheck";
  const sftpHost = env.SFTP_PROBE_HOST || "sftp.dosya.dev";
  const sftpPort = parseInt(env.SFTP_PROBE_PORT || "22", 10);
  return [
    { key: "web", label: "Web App", kind: "http", method: "GET", url: webUrl },
    { key: "docs", label: "Document Editor", kind: "http", method: "GET", url: docsUrl },
    { key: "api", label: "API", kind: "http", method: "GET", url: `${apiBase}/health` },
    { key: "rest", label: "REST API", kind: "http", method: "GET", url: `${apiBase}/api/me/name` },
    { key: "webdav", label: "WebDAV", kind: "http", method: "OPTIONS", url: `${apiBase}/webdav/` },
    { key: "s3", label: "S3 API", kind: "http", method: "GET", url: `${apiBase}/s3/` },
    { key: "sftp", label: "SFTP", kind: "sftp", host: sftpHost, port: sftpPort },
  ];
}
