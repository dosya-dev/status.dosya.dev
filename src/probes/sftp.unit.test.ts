import { describe, it, expect } from "vitest";
import { isSshBanner } from "./sftp";

describe("isSshBanner", () => {
  it("accepts SSH-2.0 and SSH-1.99 identification strings", () => {
    expect(isSshBanner("SSH-2.0-OpenSSH_9.6\r\n")).toBe(true);
    expect(isSshBanner("SSH-1.99-Foo")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isSshBanner("HTTP/1.1 200 OK")).toBe(false);
    expect(isSshBanner("")).toBe(false);
    expect(isSshBanner("hello")).toBe(false);
  });
});
