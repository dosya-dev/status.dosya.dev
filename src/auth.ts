import type { Env } from "./config";

/** Length-safe, constant-time-ish string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function checkAdminToken(request: Request, env: Env): boolean {
  const configured = env.STATUS_ADMIN_TOKEN;
  if (!configured) return false;
  const header = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return constantTimeEqual(header.slice(prefix.length), configured);
}
