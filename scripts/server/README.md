# ltng-ui-server

`ltng-ui-server` is the CLI tool for building and serving `ltng-ui` applications.
It supports Client-Side Rendering (CSR), Server-Side Rendering (SSR), and Static
Site Generation (SSG) — SSR and SSG are Bun-native (`Bun.serve`, `HTMLRewriter`,
native ESM execution; the former vm-based legacy engines were removed).

## Usage

```bash
bun scripts/ltng-ui-server.js [options]
```

The compiled standalone binary takes identical flags (no Bun installation needed
on the target machine — see `make compile-ui-server`):

```bash
./build/bin/ltng-ui-server [options]
```

## Options

- **`--mode=<mode>`**: Sets the rendering mode.
  - `csr` (default): Client-Side Rendering. Serves static files and `index.html`.
  - `ssr`: Server-Side Rendering. Renders the app on the server for each request.
  - `ssg`: Static Site Generation. Builds static HTML files (requires `--build`).
- **`--port=<number>`**: Sets the port number (default: 3000).
- **`--src=<path>`**: Sets the source directory (default: current directory).
- **`--dist=<path>`**: Sets the distribution/output directory (default: `dist` in current directory).
- **`--routes=<path>`**: Loads a route-map file (parsed by `internal/routes-parser.js`)
  mapping clean URLs to HTML files, with `/*` wildcard support.
- **`--build`**: Runs the build process (only for SSG).
- **`--serve`**: Serves the application.
- **`--b&s`**: Runs both build and serve (only for SSG).

`--engine` is retired — passing it prints a notice and is otherwise ignored.

## Examples

### CSR (Client-Side Rendering)

```bash
bun scripts/ltng-ui-server.js --src=playground/001 --mode=csr --port=3000
```

### SSR (Server-Side Rendering)

```bash
bun scripts/ltng-ui-server.js --src=playground/001 --mode=ssr --port=3000
```

### SSG (Static Site Generation)

```bash
# Build: each HTML page is a Bun entrypoint — scripts and styles bundled,
# minified, hashed, and path-rewritten
bun scripts/ltng-ui-server.js --src=playground/001 --dist=dist/playground/001 --build --mode=ssg

# Serve (after build)
bun scripts/ltng-ui-server.js --src=playground/001 --dist=dist/playground/001 --mode=ssg --port=3000
```

Make shortcuts: `playground-csr`, `playground-ssr`, `playground-ssg`,
`example-csr`, `example-ssr`, `example-ssg`.

## Page conventions (SSG builds)

The SSG build imposes two conventions on application pages (full rationale in
[`../BUN_TOOLCHAIN_PROPOSAL.md`](../BUN_TOOLCHAIN_PROPOSAL.md)):

1. **Inline scripts must be `type="module"`.** Bun rewrites `<script src>` tags
   to deferred module scripts; classic inline scripts would run before the
   framework loads. Module scripts execute in document order, so ordering stays
   correct.
2. **Cross-script globals must be explicit `window.x = ...` assignments.**
   Module scripts are strict mode — sloppy-mode implicit globals (`x = ...`)
   throw a `ReferenceError`.

## Architecture

The server logic is split into:

- `csr.js` — static file serving for CSR, with route-map resolution, clean-URL
  `.html` fallback, and rootDir/parent-dir asset resolution.
- `ssr.js` — SSR: `Bun.serve` with route-map routes and a static fallback;
  scripts are extracted with Bun's built-in `HTMLRewriter` and executed as
  native ES modules against the mock DOM (`mocks/mock-dom.js`, installed on
  `globalThis` behind a render mutex). Rendered HTML keeps the original scripts
  so the client re-runs them and hydrates (nuke and pave).
- `ssg.js` — SSG: `buildSSGBun` (Bun HTML-entrypoint build) and
  `handleSSGServe` (static serving of the built `dist/`).

The main entry point `../ltng-ui-server.js` parses arguments and dispatches to
the appropriate handler.
