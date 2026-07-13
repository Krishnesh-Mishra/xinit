/**
 * @initup/core — public surface.
 *
 * The barrel re-exports the shared contracts plus each subsystem. Subsystems
 * live in their own folders (patch/ tx/ detect/ plugin/) so they can be built
 * independently without colliding on this file.
 */
export const CORE_VERSION = "1.0.0";

export * from "./types.js";
export * from "./patch/index.js";
export * from "./tx/index.js";
export * from "./detect/index.js";
export * from "./plugin/index.js";
