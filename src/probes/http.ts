import type { ComponentDef, ProbeState } from "../config";
import { signV4 } from "./sigv4";

export interface ProbeResult {
  component: string;
  ok: boolean;
  state: ProbeState;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
}

/**
 * What a probe observed, beyond the status code. Grown as an object rather
 * than more positional booleans: the call already read
 * interpretHttp(key, status, true, null) at four arguments, and a fifth would
 * have been unreadable at the call site.
 */
export interface HttpOutcome {
  status: number | null;
  davHeaderPresent?: boolean;
  healthOk?: boolean | null;
  /** Did the response body assert success for keys where 200 alone is not proof? */
  bodyOk?: boolean | null;
}

/** Pure: decide the state from an HTTP outcome for a given component key. */
export function interpretHttp(key: string, outcome: HttpOutcome): ProbeState {
  const { status, davHeaderPresent = false, healthOk = null, bodyOk = null } = outcome;
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
      // Unauthenticated routing check only. 401 is the expected answer, which
      // is why this key cannot observe a broken listing: see the `files` key.
      return status === 401 || status === 200 || status === 403 ? "up" : "down";
    case "webdav":
      return status === 200 && davHeaderPresent ? "up" : "down";
    case "s3":
      return status === 200 || status === 400 || status === 403 ? "up" : "down";

    // Authenticated probes. Each requires BOTH the protocol's success status
    // and, where a success status can still carry a failure, a body assertion.
    // A 401 or 403 here means the probe credential was revoked or expired,
    // which is a monitoring outage and must read as down.
    case "files":
      return status === 200 && bodyOk === true ? "up" : "down";
    case "dav":
      return status === 207 ? "up" : "down";
    case "s3auth":
      return status === 200 && bodyOk === true ? "up" : "down";

    default:
      // Fail closed. An unrecognised key is a configuration bug, and a
      // configuration bug that reads as "up" is how a status page lies.
      return "down";
  }
}

/** Pure: does this body prove the operation succeeded? */
export function assertBody(kind: ComponentDef["bodyAssert"], text: string): boolean {
  if (kind === "filesOk") {
    try {
      const body = JSON.parse(text) as { ok?: boolean };
      return body?.ok === true;
    } catch {
      // An HTML error page, or Astro's 404, parses as nothing. 200 plus
      // unparseable is exactly the shape the three week outage had.
      return false;
    }
  }
  if (kind === "listBucketResult") return text.includes("ListBucketResult");
  return true;
}

async function authHeaders(def: ComponentDef, nowMs: number): Promise<Record<string, string>> {
  const c = def.credentials ?? {};
  if (def.auth === "bearer") return { authorization: `Bearer ${c.apiKey}` };
  if (def.auth === "basic") {
    // Username is the account email, password is the API key: see
    // apps/api/src/lib/webdav auth.
    const basic = btoa(`${c.email}:${c.apiKey}`);
    return { authorization: `Basic ${basic}` };
  }
  if (def.auth === "sigv4") {
    const signed = await signV4({
      method: def.method || "GET",
      url: def.url!,
      region: "auto",
      service: "s3",
      accessKeyId: c.accessKeyId!,
      secretAccessKey: c.secretAccessKey!,
      nowMs,
    });
    // `host` is set by the runtime and must not be passed through.
    const { host: _host, ...rest } = signed.headers;
    return rest;
  }
  return {};
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
      headers: { ...(def.headers ?? {}), ...(await authHeaders(def, Date.now())) },
    });
    const latency = Date.now() - start;
    let healthOk: boolean | null = null;
    let bodyOk: boolean | null = null;
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
    } else if (def.bodyAssert) {
      try {
        bodyOk = assertBody(def.bodyAssert, await res.text());
      } catch {
        bodyOk = false;
      }
    }
    const davHeaderPresent = res.headers.has("dav"); // Headers is case-insensitive
    const state = interpretHttp(def.key, {
      status: res.status,
      davHeaderPresent,
      healthOk,
      bodyOk,
    });
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
