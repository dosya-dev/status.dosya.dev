import { resolveComponents, PROBE_TIMEOUT_MS, type Env } from "../config";
import { probeHttp, type ProbeResult } from "./http";
import { probeSftp } from "./sftp";

/** Probe all components in parallel. Never rejects — failures become down results. */
export async function runAllProbes(env: Env): Promise<ProbeResult[]> {
  const comps = resolveComponents(env);
  return Promise.all(
    comps.map((c) =>
      c.kind === "sftp"
        ? probeSftp(c.host!, c.port!, PROBE_TIMEOUT_MS)
        : probeHttp(c, PROBE_TIMEOUT_MS),
    ),
  );
}
