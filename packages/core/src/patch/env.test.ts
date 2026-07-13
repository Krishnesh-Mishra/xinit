import { describe, it, expect } from "vitest";
import { upsertEnv } from "./index.js";

describe("upsertEnv", () => {
  it("appends a key when absent (newline-terminated)", () => {
    const r = upsertEnv("FOO=1\n", "BAR", "2");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("FOO=1\nBAR=2\n");
  });

  it("creates the file when content is empty", () => {
    const r = upsertEnv("", "DATABASE_URL", "postgres://localhost:5432/app");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("DATABASE_URL=postgres://localhost:5432/app\n");
  });

  it("NEVER overwrites an existing non-empty value (no-op)", () => {
    const src = "DATABASE_URL=postgres://prod-secret/db\n";
    const r = upsertEnv(src, "DATABASE_URL", "postgres://localhost:5432/app");
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });

  it("fills in a present-but-empty value (KEY=)", () => {
    const r = upsertEnv("REDIS_URL=\n", "REDIS_URL", "redis://localhost:6379");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("REDIS_URL=redis://localhost:6379\n");
  });

  it("fills in an empty value with surrounding whitespace", () => {
    const r = upsertEnv("  API_KEY =  \n", "API_KEY", "abc");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("  API_KEY=abc\n");
  });

  it("is idempotent (second call is a no-op once set)", () => {
    const first = upsertEnv("", "TOKEN", "xyz");
    const second = upsertEnv(first.content, "TOKEN", "xyz");
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("does not match a different key that shares a prefix", () => {
    const src = "DATABASE_URL_POOL=5\n";
    const r = upsertEnv(src, "DATABASE_URL", "postgres://localhost/app");
    expect(r.changed).toBe(true);
    expect(r.content).toBe(
      "DATABASE_URL_POOL=5\nDATABASE_URL=postgres://localhost/app\n",
    );
  });

  it("ignores commented-out keys and appends a real one", () => {
    const src = "# DATABASE_URL=commented\n";
    const r = upsertEnv(src, "DATABASE_URL", "postgres://localhost/app");
    expect(r.changed).toBe(true);
    expect(r.content).toBe(
      "# DATABASE_URL=commented\nDATABASE_URL=postgres://localhost/app\n",
    );
  });

  it("quotes values containing spaces or special chars", () => {
    const r = upsertEnv("", "GREETING", "hello world # hi");
    expect(r.content).toBe('GREETING="hello world # hi"\n');
  });

  it("does not quote URLs", () => {
    const r = upsertEnv("", "REDIS_URL", "redis://localhost:6379");
    expect(r.content).toBe("REDIS_URL=redis://localhost:6379\n");
  });

  it("CRLF: appends with CRLF endings, no LF-only lines", () => {
    const r = upsertEnv("FOO=1\r\n", "BAR", "2");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("FOO=1\r\nBAR=2\r\n");
    expect(r.content).not.toMatch(/[^\r]\n/);
  });

  it("CRLF: preserves a non-empty value (no-op, endings intact)", () => {
    const src = "FOO=already\r\n";
    const r = upsertEnv(src, "FOO", "new");
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });
});
