import type { ComponentDef, ProbeState } from "../config";

export interface ProbeResult {
  component: string;
  ok: boolean;
  state: ProbeState;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
}

/** Pure: decide the state from an HTTP outcome for a given component key. */
export function interpretHttp(
  key: string,
  status: number | null,
  davHeaderPresent: boolean,
  healthOk: boolean | null,
): ProbeState {
  if (status === null) return "down";
  switch (key) {
    case "web":
      // Dashboard login page (SPA index) loads: any 2xx/3xx is healthy.
      return status >= 200 && status < 400 ? "up" : "down";
    case "docs":
      // ONLYOFFICE /healthcheck answers 200 with body "true"/"false"; a 200
      // "false" means the server is reachable but reporting itself unhealthy.
      if (status === 200 && healthOk === true) return "up";
      if (status === 200) return "degraded";
      return "down";
    case "api":
      if (status === 200 && healthOk === true) return "up";
      if (status === 503) return "degraded";
      return "down";
    case "rest":
      return status === 401 || status === 200 || status === 403 ? "up" : "down";
    case "webdav":
      return status === 200 && davHeaderPresent ? "up" : "down";
    case "s3":
      return status === 200 || status === 400 || status === 403 ? "up" : "down";
    default:
      return status >= 200 && status < 500 ? "up" : "down";
  }
}

export async function probeHttp(def: ComponentDef, timeoutMs: number): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(def.url!, {
      method: def.method || "GET",
      signal: ctrl.signal,
      redirect: "manual",
    });
    const latency = Date.now() - start;
    let healthOk: boolean | null = null;
    if (def.key === "api") {
      try {
        const body = (await res.json()) as { ok?: boolean };
        healthOk = body?.ok === true;
      } catch {
        healthOk = null;
      }
    } else if (def.key === "docs") {
      try {
        healthOk = (await res.text()).trim() === "true";
      } catch {
        healthOk = null;
      }
    }
    const davHeaderPresent = res.headers.has("dav"); // Headers is case-insensitive
    const state = interpretHttp(def.key, res.status, davHeaderPresent, healthOk);
    return {
      component: def.key,
      ok: state === "up",
      state,
      latency_ms: latency,
      status_code: res.status,
      error: state === "up" ? null : `HTTP ${res.status}`,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return {
      component: def.key,
      ok: false,
      state: "down",
      latency_ms: null,
      status_code: null,
      error: (err?.name === "AbortError" ? "timeout" : String(err?.message || e)).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}
