import { describe, it, expect, vi } from "vitest";
import {
  parseSentryDsn,
  buildSentryEnvelope,
  buildResendBody,
  sendAlerts,
  type SenderConfig,
} from "./senders";
import type { AlertPayload } from "./alerts";

const payload: AlertPayload = {
  kind: "down",
  component: "files",
  label: "File Listing",
  subject: "[dosya] File Listing is DOWN",
  text: "File Listing (files) started failing.",
  fingerprint: "status:files",
};

const cfg: SenderConfig = {
  resendApiKey: "re_test",
  alertEmail: "ops@example.com",
  alertFrom: "status@example.com",
  sentryDsn: "https://abc123@o1.ingest.sentry.io/456",
};

describe("parseSentryDsn", () => {
  it("splits a DSN into key, host and project id", () => {
    expect(parseSentryDsn("https://abc123@o1.ingest.sentry.io/456")).toEqual({
      publicKey: "abc123",
      host: "o1.ingest.sentry.io",
      projectId: "456",
    });
  });
  it("returns null for junk rather than throwing", () => {
    expect(parseSentryDsn("")).toBeNull();
    expect(parseSentryDsn("not-a-url")).toBeNull();
    expect(parseSentryDsn("https://o1.ingest.sentry.io/456")).toBeNull();
  });
});

describe("buildSentryEnvelope", () => {
  it("emits three newline-delimited JSON lines with the fingerprint and level", () => {
    const lines = buildSentryEnvelope(payload, "456", 1_791_000_000_000).split("\n");
    expect(lines).toHaveLength(3);
    const itemHeader = JSON.parse(lines[1]);
    expect(itemHeader.type).toBe("event");
    const event = JSON.parse(lines[2]);
    expect(event.level).toBe("error");
    expect(event.fingerprint).toEqual(["status:files"]);
    expect(event.tags.component).toBe("files");
    expect(event.message).toContain("File Listing");
  });
  it("uses level info for a recovery so it does not page twice", () => {
    const env = buildSentryEnvelope({ ...payload, kind: "recovered" }, "456", 0);
    expect(JSON.parse(env.split("\n")[2]).level).toBe("info");
  });
});

describe("buildResendBody", () => {
  it("addresses the configured recipient with the payload subject and text", () => {
    expect(buildResendBody(payload, "status@example.com", "ops@example.com")).toEqual({
      from: "status@example.com",
      to: ["ops@example.com"],
      subject: "[dosya] File Listing is DOWN",
      text: "File Listing (files) started failing.",
    });
  });
});

describe("sendAlerts", () => {
  it("sends to both channels and reports both outcomes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const out = await sendAlerts([payload], cfg, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toEqual([
      { channel: "email", ok: true },
      { channel: "sentry", ok: true },
    ]);
  });

  // Review Focus 1: one dead channel must never silence the other.
  it("still sends Sentry when Resend fails, and reports the email error", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("resend.com")) return new Response("rate limited", { status: 429 });
      return new Response("{}", { status: 200 });
    });
    const out = await sendAlerts([payload], cfg, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual([
      { channel: "email", ok: false, error: "HTTP 429" },
      { channel: "sentry", ok: true },
    ]);
  });

  it("still sends email when Resend throws outright", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("resend.com")) throw new Error("connect timeout");
      return new Response("{}", { status: 200 });
    });
    const out = await sendAlerts([payload], cfg, fetchImpl as unknown as typeof fetch);
    expect(out[0]).toEqual({ channel: "email", ok: false, error: "connect timeout" });
    expect(out[1].ok).toBe(true);
  });

  it("skips a channel whose config is absent without reporting a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const out = await sendAlerts([payload], { sentryDsn: cfg.sentryDsn }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual([{ channel: "sentry", ok: true }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // M3. These two fetches run inside `scheduled`, so an unbounded one holds
  // the cron invocation open until the runtime kills it.
  it("bounds both senders with an abort signal", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init?.signal as AbortSignal | null | undefined);
      return new Response("{}", { status: 200 });
    });
    await sendAlerts([payload], cfg, fetchImpl as unknown as typeof fetch);
    expect(seen).toHaveLength(2);
    for (const s of seen) expect(s).toBeInstanceOf(AbortSignal);
  });

  it("reports a timed-out sender as a failure without costing the other channel", async () => {
    // What AbortSignal.timeout throws when it fires.
    const timeout = () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("resend.com")) timeout();
      return new Response("{}", { status: 200 });
    });
    const out = await sendAlerts([payload], cfg, fetchImpl as unknown as typeof fetch);
    expect(out[0]).toMatchObject({ channel: "email", ok: false });
    expect(out[0].error).toContain("timeout");
    expect(out[1]).toEqual({ channel: "sentry", ok: true });
  });

  it("does nothing at all for an empty payload list", async () => {
    const fetchImpl = vi.fn();
    expect(await sendAlerts([], cfg, fetchImpl as unknown as typeof fetch)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
