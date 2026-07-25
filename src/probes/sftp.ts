import { connect } from "cloudflare:sockets";
import type { ProbeResult } from "./http";

/** Pure: does the SSH identification banner indicate a live SSH server? */
export function isSshBanner(text: string): boolean {
  return text.startsWith("SSH-2.0-") || text.startsWith("SSH-1.99-");
}

type MinimalSocket = { readable: ReadableStream<Uint8Array>; close(): Promise<void> };

/**
 * Open a TCP socket to `host:port` and return the first bytes as text (the SSH
 * identification banner). Guaranteed to settle within `timeoutMs`: the read is
 * raced against a timer, and socket teardown is fire-and-forget so a half-open
 * connection can never wedge the caller (this handler runs on a cron budget).
 */
export async function probeSftp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now();
  let socket: MinimalSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    socket = connect({ hostname: host, port });
    const reader = socket.readable.getReader();
    const banner = await Promise.race([
      reader.read().then(({ value }) => new TextDecoder().decode(value ?? new Uint8Array())),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    const latency = Date.now() - start;
    const ok = isSshBanner(banner);
    return {
      component: "sftp",
      ok,
      state: ok ? "up" : "down",
      latency_ms: latency,
      status_code: null,
      error: ok ? null : `unexpected banner: ${banner.slice(0, 40)}`,
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return {
      component: "sftp",
      ok: false,
      state: "down",
      latency_ms: null,
      status_code: null,
      error: String(err?.message || e).slice(0, 200),
    };
  } finally {
    if (timer) clearTimeout(timer);
    // Fire-and-forget: awaiting close() on a stuck/half-open socket can hang.
    try {
      void socket?.close().catch(() => {});
    } catch {
      /* ignore */
    }
  }
}
