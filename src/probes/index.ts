import { resolveComponents, PROBE_TIMEOUT_MS, type ComponentDef, type Env } from "../config";
import { probeHttp, type ProbeResult } from "./http";
import { probeSftp } from "./sftp";

export type Prober = (c: ComponentDef) => Promise<ProbeResult>;

function probeOnce(c: ComponentDef): Promise<ProbeResult> {
  return c.kind === "sftp"
    ? probeSftp(c.host!, c.port!, PROBE_TIMEOUT_MS)
    : probeHttp(c, PROBE_TIMEOUT_MS);
}

/**
 * Probe all components in parallel. Never rejects — failures become down results.
 * A "down" result is re-probed once and the retry wins, so a single transient
 * blip (network hiccup, one slow dependency) doesn't get recorded as downtime;
 * a real outage still fails the retry and records down within the same run.
 */
export async function runAllProbes(env: Env, prober: Prober = probeOnce): Promise<ProbeResult[]> {
  const comps = resolveComponents(env);
  return Promise.all(
    comps.map(async (c) => {
      const first = await prober(c);
      if (first.state !== "down") return first;
      return prober(c);
    }),
  );
}
