# ltng-ui Architecture & Design Overview

This document explains the core architectural decisions and how the different rendering modes (CSR, SSR, SSG) work under the hood.

## 1. Core Philosophy
The goal was to create a **lightweight, vanilla JavaScript framework** that supports modern features (Components, State Management, Universal Rendering) without a build step (transpilation) or external dependencies.

## 2. Rendering Modes

The `scripts/ltng-ui-server.js` script acts as a universal server/builder. It switches behavior based on the `--mode` flag; SSR serving and SSG builds additionally take `--engine=legacy|bun` (default `legacy`). Full CLI reference: [`../scripts/server/README.md`](../scripts/server/README.md).

### A. Client-Side Rendering (CSR)
**Command**: `bun scripts/ltng-ui-server.js --mode=csr` (default mode)

**How it works**:
1.  **Server**: Simply serves the **raw** `.html` files from your project root.
2.  **Browser**: Receives an HTML file with an empty body (except for `<script>` tags).
3.  **Browser**: Executes the JavaScript.
4.  **Framework**: `Body.render()` runs, creates DOM elements, and appends them to the document.

### B. Server-Side Rendering (SSR)
**Command**: `bun scripts/ltng-ui-server.js --mode=ssr [--engine=bun]`

**How it works (both engines)**:
1.  **Server**: Intercepts the request.
2.  **Mock DOM**: Creates a fresh mock DOM environment (`mocks/mock-dom.js`) for *that specific request*.
3.  **Execution**: Runs your client-side code (`ltng-ui.js`, page scripts) against the mock DOM.
4.  **Capture**: The framework renders components into the mock `document.body`.
5.  **Injection**: The server injects the rendered body back into the page HTML, preserving the original `<script>` tags.
6.  **Response**: Sends the fully populated HTML to the browser.
7.  **Hydration**: The browser displays the content immediately. Then, the scripts run again (Auto-Hydration) to attach event listeners.

**Engine differences (step 3)**:
-   **`legacy`**: scripts are regex-extracted, transpiled (`scripts/internal/transpiler.js`), and executed in a `vm.createContext` sandbox whose global object *is* the mock window.
-   **`bun`** (`scripts/server/ssr-bun.js`): served by `Bun.serve` (route-map routes + static fallback); scripts are extracted with Bun's built-in `HTMLRewriter` and executed as **native ES modules** — no vm, no transpiler. The mock DOM is installed on `globalThis` for the duration of a render, behind a render mutex.

### C. Static Site Generation (SSG)
**Command**: `bun scripts/ltng-ui-server.js --build --mode=ssg [--engine=bun]` (Build) / `bun scripts/ltng-ui-server.js --mode=ssg` (Serve)

**How it works**:
-   **`legacy` build**: performs the SSR process for each `.html` file, writes the result to `dist/`, and copies only the assets the pages use.
-   **`bun` build**: each `.html` file is a **Bun HTML entrypoint** — referenced scripts and stylesheets are bundled, minified, content-hashed, and path-rewritten by `bun build` itself (no pre-rendered HTML; that remains a legacy-engine feature).
-   **Serve**: identical for both engines — a static file server pointing at `dist/`.

**Bun-engine page conventions**: Bun rewrites `<script src>` tags to deferred `type="module"` scripts, so page inline scripts must be `type="module"` too, and cross-script globals must be explicit `window.x = ...` assignments (module scripts are strict mode). Rationale and history: [`../scripts/BUN_TOOLCHAIN_PROPOSAL.md`](../scripts/BUN_TOOLCHAIN_PROPOSAL.md).

## 3. Key Technical Decisions

### Auto-Hydration
**Problem**: SSR sends full HTML. CSR (client script) normally appends content. If we just ran the client script on top of SSR HTML, we'd get duplicate content (double rendering).
**Solution**: `Body.render` has a flag `isHydrated`.
-   **First Call**: It detects it's the first render. It **clears** the body (removing SSR static content).
-   **Subsequent Calls**: It appends content.
This "Nuke and Pave" strategy is simple and robust for this scale, ensuring the client state (event listeners) creates a fresh, interactive DOM that looks identical to the server output.

### Mock DOM (`mocks/mock-dom.js`)
**Problem**: The server runtime doesn't have `document` or `window`.
**Solution**: A minimal implementation of the DOM API (`createElement`, `appendChild`, `createTextNode`, etc.) purely in JS, with a `createWindow()` factory so every render gets a **brand new** DOM — if a global `document` were reused, User A's state would leak into User B's request (State Pollution).
**Isolation models**: the legacy engine gets isolation from the vm sandbox (each render's sandbox object is its own global). The bun engine mirrors browser semantics instead — `window` *is* `globalThis` during a render — so renders are serialized through a mutex, and every property a render adds is swept afterwards.

### Universal Code
The exact same `ltng-ui.js` and page HTML run on both the server (mock DOM) and the client (browser). This is achieved by:
1.  Avoiding browser-specific APIs (like `alert`) in the core render path.
2.  Providing the necessary globals (`window`, `document`) on the server.

### Build Toolchain
Bundling and minification run natively on **`bun build`** (the esbuild toolchain was removed at cutover): `make bundle-all-ui` produces the canonical `build/*.min.js` / `.min.css` artifacts, and `make compile-ui-server` packages the whole server as a standalone binary (`build/bin/`, gitignored). Design notes and migration history: [`../scripts/BUN_TOOLCHAIN_PROPOSAL.md`](../scripts/BUN_TOOLCHAIN_PROPOSAL.md).
