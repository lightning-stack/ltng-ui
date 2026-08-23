# Proposal: Bun as the ltng-ui Build Toolchain

**Status:** Draft — awaiting review
**Scope:** `lightning-stack/ltng-ui` build scripts (`scripts/`, `Makefile`)
**Bun baseline:** ≥ 1.2 required; local toolchain is on **1.4.0**, which covers everything below.

---

## 1. Context & problem

ltng-ui currently supports **CSR serving only**. The SSR and SSG handlers under
`scripts/server/` exist but are experimental: SSR (`scripts/server/ssr.js`) runs page
scripts inside a `vm.createContext` sandbox against the mock DOM, extracting scripts
from HTML with regexes; SSG builds on the same machinery. Neither is production-ready.

The build/minify side has accumulated four pain points:

1. **esbuild minification inconsistencies.** The `bundle-*` targets
   (`Makefile:76-126`) shell out to `npx esbuild`, and its minified output has been
   inconsistent across runs/versions — the direct trigger for this proposal.
2. **Fragile post-processing.** `scripts/build-bundle.js` patches esbuild's *minified*
   output with a regex that depends on esbuild's exact formatting of
   `window.loadCSS(new URL(...))` calls. Any change in esbuild's output format
   silently breaks CSS loading in the bundle.
3. **Inline CSS bundler.** The `bundle-css` target is a ~20-line `node -e` script
   embedded in the Makefile (recursive `.css` discovery, manual `theme.css`-first
   ordering, concat, then esbuild for minification). Hard to read, hard to test.
4. **Hand-rolled transpiler.** `scripts/minifier.js` + `scripts/internal/transpiler.js`
   implement regex-based module flattening, scope rewriting, and minification —
   a maintenance burden that predates Bun's bundler maturing.

Meanwhile, Bun is already the runtime for everything else in this repo (tests, dev
server, playground). Since Bun 1.2 it also ships a complete build toolchain, which
makes it a candidate to replace esbuild **and** unlock SSG/SSR.

---

## 2. Bun capabilities inventory (verified against docs, Aug 2026)

| Capability | Status | Notes |
| --- | --- | --- |
| JS/TS bundling | ✅ native | `bun build` — bundling is implicit (no `--bundle` flag needed) |
| JS minification | ✅ native | Own minifier (not an esbuild wrapper): `--minify`, or independent `--minify-whitespace` / `--minify-syntax` / `--minify-identifiers`; `--keep-names`; respects `/*@__PURE__*/`; 40+ optimizations (constant folding, DCE, enum inlining) |
| Output formats / targets | ✅ | `--format=esm`, `--target=browser\|node\|bun`, `--external <pkg>`, `--outfile` / `--outdir` |
| CSS bundling + minification | ✅ native since 1.2 | Direct port of LightningCSS, esbuild-style bundling. `.css` entrypoints, `@import` flattening, `--minify`. Transpiles modern CSS (nesting, color fns) to the default browser targets: Chrome/Edge 80+, Firefox 78+, Safari 14+ |
| **HTML entrypoints** | ✅ since 1.2 | `bun build ./index.html --minify --outdir=dist` parses the HTML, bundles + minifies every referenced `<script>` and `<link rel="stylesheet">`, hashes/copies images, rewrites all paths. `--compile --target=browser` inlines everything into a single self-contained HTML file |
| Dev server + HMR | ✅ | `bun ./index.html` — automatic bundling, hot reload, plugin support |
| Full-stack server | ✅ | `Bun.serve` with the `routes` option; server code can import HTML entrypoints and serve them (SSR foundation) |
| Standalone executables | ✅ | `bun build --compile` produces a single binary (candidate for shipping `ltng-ui-server`) |
| Programmatic API | ✅ | `Bun.build({...})` with a stable plugin system (`onLoad` / `onResolve`) |

The HTML-entrypoint pipeline is the piece esbuild never had, and it is effectively
**the build half of SSG for free**.

---

## 3. esbuild → Bun migration map (`Makefile:76-126`)

`bun build` bundles by default, so `--bundle` disappears; `--platform=` becomes
`--target=`. Everything else maps one-to-one.

| Target | Today (esbuild) | Proposed (Bun) |
| --- | --- | --- |
| `bundle-ui-server` | `npx esbuild scripts/ltng-ui-server.js --bundle --platform=node --outfile=build/ltng-ui-server.min.js --minify` | `bun build scripts/ltng-ui-server.js --target=node --outfile=build/ltng-ui-server.min.js --minify` (later: `--compile` for a standalone binary — see §6) |
| `bundle-ltng-ui` | `npx esbuild ltng-ui.js --bundle --platform=browser --outfile=build/ltng-ui.esbuild.min.js --minify --format=esm` | `bun build ltng-ui.js --target=browser --outfile=build/ltng-ui.min.js --minify --format=esm` |
| `bundle-ltng-components` | same shape | `bun build ltng-components/index.mjs --target=browser --outfile=build/ltng-components.min.js --minify --format=esm` |
| `bundle-ltng-testingtools` | same shape + `--external:node:fs --external:node:path` | `bun build ltng-testingtools/index.mjs --target=browser --external node:fs --external node:path --outfile=build/ltng-testingtools.min.js --minify --format=esm` |
| `bundle-ltng-tools` | same shape | `bun build ltng-tools/index.mjs --target=browser --outfile=build/ltng-tools.min.js --minify --format=esm` |
| `bundle-css` | inline `node -e` discovery + concat + esbuild minify | `bun scripts/bundle-css.js` — a real script using the existing `scripts/internal/css-bundler.js` discovery, minifying via `bun build` on the concatenated CSS (or a generated entry CSS whose `@import` order puts `theme.css` first) |
| `bundle-all` | `npx esbuild build/modules/exports.js ...` | `bun build build/modules/exports.js --target=browser --external node:fs --external node:path --outfile=build/ltng-ui-all.min.js --minify --format=esm` |

Naming note: the proposal drops the `.esbuild.` infix from output names
(`ltng-ui.min.js`, not `ltng-ui.esbuild.min.js`). During the side-by-side phase the
Bun outputs use a `.bun.` infix instead so both coexist; the final names land when
esbuild is removed.

### The `loadCSS` post-processing problem

`scripts/build-bundle.js` must **not** be ported regex-for-regex — Bun's minifier
formats output differently, so the `window.loadCSS(new URL(...))` regex would break
immediately. Two clean replacements, in order of preference:

- **(a) Bun plugin** — a small `Bun.build` plugin whose `onLoad` hook strips
  `loadCSS` calls from source *before* bundling (pre-minification source is stable;
  minified output is not), then appends the single bundle-CSS loader to the output.
- **(b) Source-level convention** — move per-component `loadCSS` calls behind a
  single dev-only entry module that the bundle entry (`build/modules/exports.js`)
  simply doesn't import; the bundle appends its own loader line.

Option (a) is the recommendation: no source reorganization, and the transform runs
on stable input.

---

## 4. Phase 1 — Bundling/minification swap (replaces esbuild)

1. **Add side-by-side targets.** New `bun-bundle-*` Make targets emitting
   `build/*.bun.min.js` next to the existing esbuild outputs. esbuild targets stay
   untouched.
2. **Rewrite `build-bundle.js`** as `scripts/build-bundle.bun.js` using
   `Bun.build()` + the `loadCSS` plugin from §3.
3. **Extract `bundle-css`** from the Makefile into `scripts/bundle-css.js`
   (reusing `scripts/internal/css-bundler.js`), minifying via Bun's CSS pipeline.
4. **A/B verification** (protocol in §8): compare each Bun bundle against its
   esbuild counterpart — size, exports surface, smoke test in the playground.
5. **Cut over.** Point `bundle-ui` / `bundle-all-ui` at the Bun targets, delete the
   esbuild targets and the `npx esbuild` dependency, rename outputs to their final
   names, update `clean`.
6. **Decision point — retire the hand-rolled transpiler?** `scripts/minifier.js` +
   `scripts/internal/transpiler.js` exist to flatten modules into scoped bundles.
   Bun's bundler covers the bundling/minification role. If the *scope-object*
   output shape (`window`-attached namespaces) is still required, keep the
   transpiler for that one artifact and let Bun handle everything else; otherwise
   delete both. **Default: keep until Phase 2 ships, then re-evaluate.**

Deliverables: `scripts/build-bundle.bun.js`, `scripts/bundle-css.js`, Makefile
edits. Rollback is trivial at every step until 5.

---

## 5. Phase 2 — SSG via HTML entrypoints ✅ (implemented)

**Status:** shipped as `--engine=bun`. `buildSSGBun` in `scripts/server/ssg.js` feeds
every top-level `*.html` in `--src` to `Bun.build` (`minify: true`, `outdir: --dist`);
serving is unchanged (`handleSSGServe`). Make targets: `example-ssg-bun`,
`playground-ssg-bun`. The legacy mock-DOM SSG path remains the default engine.

**Convention (hard requirement for the bun engine):** Bun rewrites `<script src>`
tags to deferred `type="module"` scripts. Page inline scripts must therefore be
`type="module"` too — module scripts execute in document order, so the framework
(whose API is explicitly `window`-attached) is loaded first; classic inline scripts
would run before it. And because module scripts are strict mode, cross-script
globals must be explicit `window.x = ...` assignments — sloppy-mode implicit
globals (`x = ...`) throw a ReferenceError. Mock-DOM pre-rendering (baked HTML)
stays a follow-up, per risk #5.

Today `--mode=ssg --build` (`scripts/server/ssg.js`) renders pages through the
mock-DOM/vm machinery. With Bun:

```bash
bun build src/**/*.html --minify --outdir=dist --production
```

- Every page of the MPA is an `.html` entrypoint (this matches the ltng-ui MPA
  model exactly — one HTML file per page, real navigation between them).
- Bun bundles + minifies each page's scripts and styles and rewrites paths —
  the *asset* half of SSG, done.
- The *pre-render* half (executing components to bake HTML) stays with the
  existing mock-DOM renderer, now running as a post-step over Bun's output — or
  is deferred, shipping "SSG = fully bundled static MPA" first, which is already
  a deployable artifact for static hosts.
- `handleSSGServe` keeps serving `dist/` unchanged; `bun ./src/index.html`
  becomes the CSR dev server with HMR as a bonus.

Deliverables: `scripts/server/ssg.js` gains a Bun-build path (flag-gated,
e.g. `--engine=bun`), old path kept until parity is confirmed.

---

## 6. Phase 3 — SSR via `Bun.serve` ✅ (implemented)

**Status:** shipped as `--mode=ssr --engine=bun` (`scripts/server/ssr-bun.js`).
Make targets: `example-ssr-bun`, `playground-ssr-bun`. The legacy vm-based SSR
stays the default engine.

**Design as built:**
- `Bun.serve` with `routes` built from the parsed route map plus a fetch
  fallback: `/` and `*.html` render server-side, extensionless clean URLs try
  `<path>.html`, everything else is served statically via `Bun.file` with the
  srcDir → rootDir → parent-dirs resolution the CSR handler uses.
- Scripts are extracted with Bun's built-in `HTMLRewriter` — no regex scanning.
- Execution is native ESM: external scripts import with a per-request
  cache-busting query (`?ssr=N`); inline scripts are written to a temp `.mjs`
  (relative import specifiers rewritten to absolute `file://` URLs) and imported
  the same way. No vm sandbox, no transpiler.
- The mock DOM is installed on `globalThis` for the duration of a render, so
  renders are serialized through a mutex — dev/preview-server semantics,
  matching the single-threaded guarantee of the legacy vm path.
- Serialization mirrors the legacy path: rendered body + preserved original
  scripts (client re-runs them → nuke-and-pave hydration), head links appended,
  `file://` URLs rewritten to server paths.

**Known limitations (documented, not hidden):** Bun's module cache ignores
query strings and caches directory listings, so per-render re-execution is done
by copying each script into a fresh temp directory; sub-modules a script imports
stay cached across requests (fine for stateless framework code, a caveat for
stateful app sub-modules). Because renders share one `globalThis`,
`Object.defineProperty(window, ...)` calls are rerouted through a shim that
tolerates re-definition of non-configurable properties left by earlier renders
(e.g. ltng-ui's `Body` getter, which reads the live `document` and stays
correct).
SSR renders initial store state (mock `localStorage` is empty); persisted client
state appears after hydration — that is the nuke-and-pave contract.

**Standalone binary (implemented):** `make compile-ui-server` packages the whole
server (CSR/SSR/SSG, both engines) as a self-contained executable via
`bun build --compile --minify` into `build/bin/` (gitignored);
`compile-ui-server-linux` cross-compiles for `bun-linux-x64`. Verified: compiled
binaries still support runtime dynamic `import()` of freshly written temp files,
so the bun SSR engine's per-render re-execution works unchanged.

Replace the `http.createServer` + `vm.createContext` approach in
`scripts/ltng-ui-server.js` / `scripts/server/ssr.js` with:

- `Bun.serve({ routes })` mapping the MPA route table (already parsed by
  `scripts/internal/routes-parser.js`) to handlers;
- per-request rendering against the existing mock DOM (`mocks/mock-dom.js`) —
  but importing page modules natively (Bun executes ESM directly; no regex
  script-extraction, no vm sandbox);
- **hydration safety as a hard constraint**: server-rendered HTML and
  post-hydration client state must agree — no environment-dependent branches
  without explicit hydration boundaries;
- optionally `bun build --compile` to ship `ltng-ui-server` as a standalone
  binary (replaces the `bundle-ui-server` artifact entirely).

This phase is the largest and rides on Phases 1–2; it gets its own design pass
before implementation.

---

## 7. Risks & open questions

| # | Risk / question | Mitigation / default |
| --- | --- | --- |
| 1 | Bun's minifier output differs from esbuild's — a latent dependency on esbuild's exact output (beyond the known `loadCSS` regex) could surface | A/B protocol (§8) runs every bundle through the playground smoke test before cutover |
| 2 | CSS transpilation targets: Bun's LightningCSS defaults (Chrome/Edge 80+, FF 78+, Safari 14+) may rewrite modern CSS more (or less) aggressively than the current pipeline | Diff the minified CSS; pin explicit browser targets if needed |
| 3 | `loadCSS` strategy: plugin (§3a) vs source convention (§3b) | Default: plugin |
| 4 | Fate of `scripts/minifier.js` + `transpiler.js` | Default: keep through Phase 1, re-evaluate after Phase 2 |
| 5 | SSG pre-rendering (baked HTML) vs bundled-static-MPA first | Default: ship bundled-static first, pre-render as follow-up |
| 6 | Bun version pinning for reproducible builds | Pin via `mise.toml` alongside the Go toolchain |

---

## 8. Verification checklist (per phase)

- [ ] Each Bun bundle imports cleanly and exposes the same export surface as its
      esbuild counterpart (`bun -e 'import(...)'` diff of `Object.keys`).
- [ ] Playground smoke test per bundle: `make playground-csr` against the Bun
      bundle — pages render, stores react, navigation works.
- [ ] `make test-all` green (ltng-testingtools + ltng-tools suites).
- [ ] Size comparison table (esbuild vs Bun, per artifact) recorded in the PR.
- [ ] CSS bundle diff reviewed (rule count, `theme.css`-first ordering preserved).
- [ ] `make clean` removes all new artifacts.
- [ ] Docs updated: `scripts/server/README.md` + root `README.md` build sections.
