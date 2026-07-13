import { definePlugin } from "@xinit/core";

/**
 * Zustand (v5) — a minimal, unopinionated state manager for React.
 *
 * There is no provider to mount: a store is just a hook created with `create`.
 * This plugin therefore only installs the package and drops a typed starter
 * store the app can import directly. It never touches the entrypoint.
 */
export default definePlugin({
  name: "zustand",
  displayName: "Zustand",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "zustand" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["zustand"]);

    // A typed starter store. Zustand v5: `import { create } from "zustand"`.
    ctx.addFile(
      "src/store.ts",
      `import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

/**
 * Example store. Use it in a component:
 *   const count = useCounterStore((s) => s.count);
 *   const increment = useCounterStore((s) => s.increment);
 */
export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: s.count - 1 })),
  reset: () => set({ count: 0 }),
}));
`,
    );
  },
});
