# FUTURE — deliberately deferred

Ideas that are **out of v1 scope on purpose**. Keeping them here (not in
[`SPEC.md`](./SPEC.md)) is how we avoid scope creep and actually ship. Nothing
here is a commitment; it's a parking lot.

## Lifecycle (v2)
- **`remove`** — clean uninstall. Hard because `setup()` only describes install;
  needs replay-in-reverse from a recorded log, and breaks once a user hand-edits
  generated files. v1 does `add` + `doctor` only.
- **`update` with migrations** — a real migration engine (versioned, like DB
  migrations), because breaking changes (HeroUI v2→v3 dropped the Provider) can't
  be handled by a version bump. Our own plugins go stale like AI training data;
  this needs a maintenance/versioning story, not just code.

## Security hardening
- **True WASM isolate (QuickJS)** for running **untrusted third-party** plugins
  unattended. v1 may ship an in-process stub behind the `Sandbox` interface for
  first-party plugins; the isolate is required before open pasted plugins run
  without a human.
- **Signed / curated registry** — provenance, typosquatting defense, malicious-
  plugin mitigation. Trust tiers (official/community/unverified) are surfaced in
  v1; signing is later.

## Languages
- **C++** — CMake/vcpkg/conan wiring, Google Test, clang-format/tidy. High value
  (real config pain), but a third ecosystem; after JS + Python are solid.
- **Deep Python source surgery** — needs a Python-side AST (LibCST) or a sidecar
  Python process; Node can't do it well. v1 stays at `pyproject.toml` + files +
  commands.
- **Standalone binaries** — ship initup without requiring Node, for Python/C++
  audiences who may not have Node installed.

## Interfaces
- **REST API** front-end over the same core (CI/CD, hosted use).
- **Richer `graph`** / `explain` outputs, project visualizations.

## Ecosystem
- Community plugin publishing UX, ratings/search (`initup search auth`), a real
  registry backend. The cold-start problem (worthless with 5 plugins, needs
  hundreds kept current) is the core business risk — addressed by making
  authoring + publishing trivial, not by us writing every plugin.
