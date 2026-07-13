/**
 * JS/TS service plugins — end-to-end via pack() + addPlugin() on a temp TS
 * fixture (package.json + tsconfig.json ⇒ language "ts") with a mocked
 * installer (no network). Covers: better-auth · supabase · stripe · trpc.
 *
 * Each assertion checks the three things the plugin promises: the runtime dep
 * is installed, the config/client file is written, and the expected .env keys
 * are seeded.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pack, addPlugin } from "./index.js";
import type { InstallSpec } from "./apply.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");
const DIR = (name: string) => path.join(PLUGINS, name);

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-jssvc-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
  // A TS fixture: package.json + tsconfig.json ⇒ ctx.language() === "ts".
  await fsp.writeFile(
    path.join(work, "package.json"),
    JSON.stringify({ name: "demo", private: true, type: "module" }, null, 2) + "\n",
  );
  await fsp.writeFile(path.join(work, "tsconfig.json"), "{}\n");
});
afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(work, rel));

/** Installer that records the captured spec and call count. */
function recordingInstaller() {
  const state = { calls: 0, spec: undefined as InstallSpec | undefined };
  const installer = async (_dir: string, spec: InstallSpec) => {
    state.calls++;
    state.spec = spec;
  };
  return { state, installer };
}

// ---------------------------------------------------------------------------
// 1. better-auth
// ---------------------------------------------------------------------------
describe("better-auth", () => {
  it("installs better-auth, writes auth.ts, seeds env", async () => {
    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("better-auth"));
    expect(manifest.detect).toEqual({ dependency: "better-auth" });
    expect(manifest.capabilities).toEqual({ install: true, exec: false, network: false });

    const result = await addPlugin({ pluginDirOrManifest: manifest, appDir: work, installer });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toContain("better-auth");

    const auth = read("src/lib/auth.ts");
    expect(auth).toContain('import { betterAuth } from "better-auth"');
    expect(auth).toContain("export const auth = betterAuth({");

    const env = read(".env");
    expect(env).toMatch(/BETTER_AUTH_SECRET=/);
    expect(env).toMatch(/BETTER_AUTH_URL=http:\/\/localhost:3000/);
    expect(read(".env.example")).toMatch(/BETTER_AUTH_SECRET=/);

    // Handler wiring is manual.
    expect(result.warnings.join(" ")).toMatch(/handler/i);
  });
});

// ---------------------------------------------------------------------------
// 2. supabase
// ---------------------------------------------------------------------------
describe("supabase", () => {
  it("installs @supabase/supabase-js, writes a client, seeds env", async () => {
    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("supabase"));
    expect(manifest.detect).toEqual({ dependency: "@supabase/supabase-js" });

    const result = await addPlugin({ pluginDirOrManifest: manifest, appDir: work, installer });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toContain("@supabase/supabase-js");

    const client = read("src/lib/supabase.ts");
    expect(client).toContain('import { createClient } from "@supabase/supabase-js"');
    expect(client).toContain("createClient(supabaseUrl, supabaseAnonKey)");

    const env = read(".env");
    expect(env).toMatch(/SUPABASE_URL=/);
    expect(env).toMatch(/SUPABASE_ANON_KEY=/);
  });
});

// ---------------------------------------------------------------------------
// 3. stripe
// ---------------------------------------------------------------------------
describe("stripe", () => {
  it("installs stripe, writes a server client, seeds env", async () => {
    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("stripe"));
    expect(manifest.detect).toEqual({ dependency: "stripe" });

    const result = await addPlugin({ pluginDirOrManifest: manifest, appDir: work, installer });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toContain("stripe");

    const client = read("src/lib/stripe.ts");
    expect(client).toContain('import Stripe from "stripe"');
    expect(client).toContain("new Stripe(process.env.STRIPE_SECRET_KEY");

    const env = read(".env");
    expect(env).toMatch(/STRIPE_SECRET_KEY=sk_test_/);
    expect(env).toMatch(/STRIPE_WEBHOOK_SECRET=whsec_/);
  });
});

// ---------------------------------------------------------------------------
// 4. trpc
// ---------------------------------------------------------------------------
describe("trpc", () => {
  it("installs @trpc/server + @trpc/client, writes router + client", async () => {
    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("trpc"));
    expect(manifest.detect).toEqual({ dependency: "@trpc/server" });

    const result = await addPlugin({ pluginDirOrManifest: manifest, appDir: work, installer });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(
      expect.arrayContaining(["@trpc/server", "@trpc/client"]),
    );

    const router = read("src/server/router.ts");
    expect(router).toContain('import { initTRPC } from "@trpc/server"');
    expect(router).toContain("initTRPC.create()");
    expect(router).toContain("greeting: publicProcedure.query(");
    expect(router).toContain("export type AppRouter = typeof appRouter;");

    const client = read("src/lib/trpc.ts");
    expect(client).toContain('import { createTRPCClient, httpBatchLink } from "@trpc/client"');
    expect(client).toContain("createTRPCClient<AppRouter>(");
    expect(client).toContain("httpBatchLink({");

    // Handler mounting is manual.
    expect(result.warnings.join(" ")).toMatch(/mount/i);
    expect(exists("src/lib/trpc.ts")).toBe(true);
  });
});
