export type ComponentKey = "api" | "rest" | "webdav" | "s3" | "sftp";
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
  SFTP_PROBE_HOST?: string;
  SFTP_PROBE_PORT?: string;
}

export const PROBE_TIMEOUT_MS = 5000;
export const AUTO_INCIDENT_FAIL_THRESHOLD = 2;
export const RAW_RETENTION_DAYS = 8;
export const DAILY_RETENTION_DAYS = 120;
export const STALE_CHECK_SECONDS = 300;

export const COMPONENT_ORDER: ComponentKey[] = ["api", "rest", "webdav", "s3", "sftp"];
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  api: "API",
  rest: "REST API",
  webdav: "WebDAV",
  s3: "S3 API",
  sftp: "SFTP",
};

export function resolveComponents(env: Env): ComponentDef[] {
  const apiBase = (env.API_BASE || "https://api.dosya.dev").replace(/\/$/, "");
  const sftpHost = env.SFTP_PROBE_HOST || "sftp.dosya.dev";
  const sftpPort = parseInt(env.SFTP_PROBE_PORT || "22", 10);
  return [
    { key: "api", label: "API", kind: "http", method: "GET", url: `${apiBase}/health` },
    { key: "rest", label: "REST API", kind: "http", method: "GET", url: `${apiBase}/api/me/name` },
    { key: "webdav", label: "WebDAV", kind: "http", method: "OPTIONS", url: `${apiBase}/webdav/` },
    { key: "s3", label: "S3 API", kind: "http", method: "GET", url: `${apiBase}/s3/` },
    { key: "sftp", label: "SFTP", kind: "sftp", host: sftpHost, port: sftpPort },
  ];
}
