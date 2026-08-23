# LTNG Framework

> **A lightweight vanilla JavaScript framework for building modern web applications**

---

## Quick Links

| Documentation | Description |
|---------------|-------------|
| [State Management](docs/STATE_MANAGEMENT.md) | Stores, subscriptions, persistence |
| [Architecture & Design](docs/Design%20Overview.md) | Rendering modes (CSR, SSR, SSG), hydration |
| [Component Library](ltng-components/README.md) | UI components (Buttons, Forms, Modals) |
| [Testing Tools](ltng-testingtools/README.md) | Go-style and Gherkin-style testing |
| [Tooling & Utils](ltng-tools/README.md) | Helpers for i18n, transport, random data |
| [Mock DOM](mocks/README.md) | SSR/SSG DOM implementation |
| [Component Book](ltng-book/README.md) | Component development environment |
| [Server & CLI](scripts/server/README.md) | `ltng-server` usage (CSR, SSR, SSG) |

---

## Installation

Include the framework in your HTML:

```html
<script src="ltng-ui.js"></script>
```

No build step required. Pure vanilla JavaScript.

---

## Core API

### Element Creation

The framework provides global functions for all common HTML tags:

```javascript
// Create a div with props and children
div({ id: 'container', class: 'wrapper' }, 
    h1({}, 'Hello World'),
    p({}, 'Welcome to LTNG Framework')
)

// Available tags:
// div, span, header, footer, main, section, article,
// h1, h2, h3, h4, h5, h6, p, a, button, input, label,
// ul, ol, li, img, form, nav, select, option, textarea,
// table, thead, tbody, tr, th, td, and many more...
```

### Props Handling

```javascript
// With explicit props
button({ 
    id: 'submit-btn',
    class: 'btn primary',
    disabled: 'true'
}, 'Click Me')

// With event handlers (on* prefix)
button({ 
    onClick: () => alert('Clicked!'),
    onMouseover: (e) => e.target.style.opacity = '0.8'
}, 'Hover Me')

// Without props (auto-generates class and UUID id)
div(null, 'Content here')  // Gets class="div" id="<uuid-v7>"
```

### Rendering

```javascript
// Render to body (with auto-hydration)
Body.render(
    header({}, 
        nav({}, 
            a({ href: '/' }, 'Home'),
            a({ href: '/about' }, 'About')
        )
    ),
    main({},
        h1({}, 'Welcome'),
        p({}, 'This is the main content.')
    ),
    footer({}, '© 2026')
)

// Render to any element
const container = document.getElementById('app')
container.render(
    div({}, 'Dynamic content')
)
```

### Global Utilities

```javascript
// UUID v7 Generator
const id = generateUUIDv7()  // "01945abc-7def-7123-..."

// CSS Loader
loadCSS('/styles/theme.css')  // Loads if not already present

// Body Alias
Body  // Equivalent to document.body

// Text Node
TextNode('Some text')  // Creates a text node
```

### Overlay Modal

```javascript
// Display a simple modal
overlayModal({}, 'Are you sure you want to continue?')
```

---

## State Management

### Creating a Store

```javascript
// Basic store
const store = createStore({ 
    count: 0, 
    user: null,
    theme: 'light' 
})

// With localStorage persistence
const store = createStore(
    { count: 0, theme: 'light' },
    { persist: 'appState' }  // Key in localStorage
)
```

### Reading & Writing State

```javascript
// Read current state
const state = store.getState()
console.log(state.count)  // 0

// Update state (partial merge)
store.setState({ count: 5 })
console.log(store.getState())  // { count: 5, theme: 'light' }
```

### Subscribing to Changes

```javascript
// Subscribe to ALL changes
store.subscribe((state) => {
    console.log('State changed:', state)
})

// Subscribe to SPECIFIC keys only
store.subscribe(({ count }) => {
    console.log('Count is now:', count)
}, ['count'])

// Subscribe to multiple keys
store.subscribe(({ theme, user }) => {
    applyTheme(theme)
    updateUserUI(user)
}, ['theme', 'user'])

// Unsubscribe
const unsubscribe = store.subscribe(callback, ['count'])
unsubscribe()  // Stop listening
```

### Reactive Helpers

#### `reactive(store, key)` — Auto-updating Text

```javascript
// Text that updates automatically when state changes
p({}, 'Count: ', reactive(store, 'count'))
span({}, 'Hello, ', reactive(store, 'userName'))
```

#### `reactiveElement(store, key, renderFn)` — Auto-replacing Elements

```javascript
// For arrays or complex objects that need full re-render
reactiveElement(store, 'items', (items) =>
    ul({}, ...items.map(item => li({}, item.name)))
)

// For user cards
reactiveElement(store, 'user', (user) =>
    div({ class: 'card' },
        h2({}, user.name),
        p({}, user.email)
    )
)
```

#### `reactiveAttr(element, attr, store, key)` — Reactive Attributes

```javascript
// Theme-based class
reactiveAttr(div({}, 'Content'), 'class', store, 'themeClass')

// Disabled state
reactiveAttr(button({}, 'Submit'), 'disabled', store, 'isLoading')
```

#### `reactiveStyle(element, prop, store, key)` — Reactive Styles

```javascript
// Background color
reactiveStyle(div({}, 'Box'), 'backgroundColor', store, 'bgColor')

// Progress bar width
reactiveStyle(div({}), 'width', store, 'progressWidth')

// Show/hide
reactiveStyle(div({}, 'Modal'), 'display', store, 'modalDisplay')
```

---

## Complete Example

```javascript
// Create persisted store
const store = createStore(
    { count: 0, theme: 'light' },
    { persist: 'myApp' }
)

// Build app
const app = div({ class: 'app' },
    header({},
        h1({}, 'Counter App'),
        button({
            onClick: () => {
                const current = store.getState().theme
                store.setState({ theme: current === 'light' ? 'dark' : 'light' })
            }
        }, 'Toggle Theme')
    ),
    main({},
        p({}, 'Current count: ', reactive(store, 'count')),
        button({
            onClick: () => store.setState({ count: store.getState().count + 1 })
        }, 'Increment'),
        button({
            onClick: () => store.setState({ count: store.getState().count - 1 })
        }, 'Decrement')
    )
)

// Apply theme reactively
store.subscribe(({ theme }) => {
    document.body.className = theme
}, ['theme'])

// Render
Body.render(app)
```

---

## Hydration

The framework uses a **"nuke and pave"** hydration strategy:

1. **First `Body.render()` call**: Clears the body completely
2. **Subsequent calls**: Appends children normally

This ensures consistent client-side rendering after any SSR content.

```javascript
// First call: clears body, renders app
Body.render(app)

// Later calls: appends to body
Body.render(overlayModal({}, 'Notification'))
```

---

## Architecture & Rendering Modes

> 📖 **Full details**: [docs/Design Overview.md](docs/Design%20Overview.md)

The framework supports three rendering modes, all using the same `ltng-ui.js` code:

### Client-Side Rendering (CSR)

```bash
bun scripts/ltng-ui-server.js --mode=csr --src=./app --port=3000
```

| Step | What Happens |
|------|--------------|
| 1 | Server sends raw HTML with empty `<body>` |
| 2 | Browser loads JavaScript |
| 3 | `Body.render()` creates DOM elements |

**Best for**: SPAs, dashboards, interactive apps.

### Server-Side Rendering (SSR)

```bash
# Legacy engine (vm sandbox + mock DOM)
bun scripts/ltng-ui-server.js --mode=ssr --src=./app --port=3000

# Bun engine (Bun.serve + HTMLRewriter + native ESM execution)
bun scripts/ltng-ui-server.js --mode=ssr --engine=bun --src=./app --port=3000
```

| Step | What Happens |
|------|--------------|
| 1 | Server creates mock DOM (Node.js) |
| 2 | Runs your JS in sandbox, renders to mock DOM |
| 3 | Sends fully populated HTML to browser |
| 4 | Browser displays content immediately |
| 5 | Scripts run again, hydrate with event listeners |

**Best for**: SEO, fast first paint, content sites.

### Static Site Generation (SSG)

```bash
# Build (legacy engine: mock-DOM pre-render + asset copy)
bun scripts/ltng-ui-server.js --build --mode=ssg --src=./app --dist=./dist

# Build (bun engine: each HTML page is a Bun entrypoint — scripts and styles
# bundled, minified, hashed, and path-rewritten)
bun scripts/ltng-ui-server.js --build --mode=ssg --engine=bun --src=./app --dist=./dist

# Serve (same for both engines)
bun scripts/ltng-ui-server.js --mode=ssg --src=./app --dist=./dist --port=3000
```

> **Bun-engine convention**: Bun rewrites `<script src>` tags to deferred
> `type="module"` scripts, so page inline scripts must be `type="module"` too,
> and cross-script globals must be explicit `window.x = ...` assignments.
> Full details: [scripts/BUN_TOOLCHAIN_PROPOSAL.md](scripts/BUN_TOOLCHAIN_PROPOSAL.md).

| Step | What Happens |
|------|--------------|
| 1 | SSR renders all `.html` files at build time |
| 2 | Saves to `dist/` directory |
| 3 | Copies only used assets |
| 4 | Serves as static files |

**Best for**: Blogs, documentation, marketing sites.

### How Hydration Works

**Problem**: SSR sends full HTML. Client script normally appends content. Running both = duplicate content.

**Solution**: "Nuke and Pave" strategy in `Body.render()`:

```javascript
let isHydrated = false

HTMLBodyElement.prototype.render = function (...children) {
    if (!isHydrated) {
        // First render: clear SSR content
        while (this.firstChild) {
            this.removeChild(this.firstChild)
        }
        isHydrated = true
    }
    render(this, ...children)
}
```

This ensures the client creates a fresh, interactive DOM identical to server output.

---

## Ecosystem

| Package | Purpose |
|---------|---------|
| **ltng-components** | Pre-built UI components |
| **ltng-tools** | i18n, HTTP transport, converters, random utils |
| **ltng-testingtools** | Testing (Go-style & Gherkin) |
| **ltng-book** | Component documentation tool |
| **ltng-ui-server** | CSR/SSR/SSG serving |
| **mocks** | Mock DOM for SSR/SSG |

---

## Build Outputs

All bundles are produced natively by [Bun](https://bun.com/docs/bundler)
(`bun build` — no npx, no esbuild; the esbuild toolchain was removed at
cutover). Migration history and design notes:
[scripts/BUN_TOOLCHAIN_PROPOSAL.md](scripts/BUN_TOOLCHAIN_PROPOSAL.md).

| Target | Output | Contents | Size |
|--------|--------|----------|------|
| `bundle-css` | `build/ltng-ui-all.min.css` | All `ltng-components` CSS (`theme.css` first) | 5.3K |
| `bundle-all` | `build/ltng-ui-all.min.js` | Everything — ui + components + tools + testingtools + book | 29K |
| `bundle-ui-server` | `build/ltng-ui-server.min.js` | Dev server (CSR/SSR/SSG, both engines) | 22K |
| `bundle-ltng-ui` | `build/ltng-ui.min.js` | Core framework only | 3.8K |
| `bundle-ltng-components` | `build/ltng-components.min.js` | Components only | 10K |
| `bundle-ltng-tools` | `build/ltng-tools.min.js` | Utility tools only | 3.1K |
| `bundle-ltng-testingtools` | `build/ltng-testingtools.min.js` | Testing tools only | 9.1K |
| `bundle-ui` _(unified)_ | CSS + JS + server | | ✅ |
| `bundle-all-ui` _(everything)_ | All of the above | | ✅ |

Notes: `bundle-all` strips per-component `loadCSS` calls at source level (via a
`Bun.build` plugin) and appends a single loader for the bundled CSS.
`bundle-ltng-testingtools` targets the bun runtime (`--target=bun`) so its
`node:fs`/`node:path` imports stay external instead of being polyfilled.

### Standalone Binary

The whole server (CSR/SSR/SSG, both engines, mock DOM) can be compiled into a
self-contained executable — no Bun installation needed on the target machine:

```bash
make compile-ui-server        # host platform  → build/bin/ltng-ui-server (~61MB)
make compile-ui-server-linux  # bun-linux-x64  → build/bin/ltng-ui-server-linux-x64 (~79MB)

# Run it exactly like the script:
./build/bin/ltng-ui-server --src=./app --mode=ssr --engine=bun --port=3000
```

`build/bin/` is gitignored — binaries are build artifacts, not repo content.

### Makefile Targets

```bash
# bundling (bun build)
make bundle-ui              # Build everything (CSS + JS + server)
make bundle-all-ui          # Every bundle
make bundle-ui-server       # Server bundle only
make bundle-all             # Framework JS bundle only
make bundle-css             # CSS bundle + minify only
make bundle-ltng-ui         # Core framework only
make bundle-ltng-components # Components only
make bundle-ltng-tools      # Tools only
make bundle-ltng-testingtools # Testing tools only

# serving & SSG/SSR with the bun engine
make example-ssg-bun        # Bun SSG build + serve for examples/
make example-ssr-bun        # Bun.serve SSR for examples/
make playground-ssg-bun     # Bun SSG build + serve for playground/
make playground-ssr-bun     # Bun.serve SSR for playground/

# standalone binaries
make compile-ui-server        # Host-platform binary
make compile-ui-server-linux  # Linux x64 binary

make clean                  # Remove build artifacts
```

### ltng-tools

> 📖 **Full details**: [ltng-tools/README.md](ltng-tools/README.md)

Utility libraries with zero dependencies:

| Module | Functions | Example |
|--------|-----------|---------|
| **converter** | Case conversion, style helpers | `lowerCamelCaseToLowerCaseLowerKebabCase('backgroundColor')` → `'background-color'` |
| **internationalisation** | Dictionary-based i18n | `lang.t().welcome` → `'Bem-vindo'` |
| **random** | Numbers, strings, emails | `randomEmail()` → `'xK9mP@cD4eF.gh'` |
| **transport** | HTTP client over fetch | `client.Get('/api/users')` → `{ StatusCode, Data, Err }` |

```javascript
import { HttpClient } from './ltng-tools/transport/index.mjs'
import i18n from './ltng-tools/internationalisation/index.mjs'
import { randomEmail } from './ltng-tools/random/index.mjs'

// HTTP Client
const api = HttpClient({ baseURL: 'https://api.example.com' })
const users = await api.Get('/users')

// i18n
const lang = i18n.MakeDictionaries({ en: { hi: 'Hello' }, es: { hi: 'Hola' } }, 'en')
lang.setLocale('es')
console.log(lang.t().hi)  // 'Hola'

// Random data
console.log(randomEmail())  // 'abc123@xyz.com'
```

---

## Quick Start

```bash
# Run playground example
make playground-csr

# Or directly
bun scripts/ltng-ui-server.js --src=playground/001 --mode=csr --port=3000
```

---

## Project Structure

```
ltng-ui/
├── ltng-ui.js           # Core framework
├── ltng-components/     # UI component library
├── ltng-tools/          # Utility libraries
├── ltng-testingtools/   # Testing framework
├── ltng-book/           # Component documentation
├── build/               # Bundled/minified outputs
│   ├── modules/         # Bundle entry points
│   └── bin/             # Compiled standalone binaries (gitignored)
├── scripts/             # Build & server scripts
│   ├── ltng-ui-server.js
│   ├── build-bundle.bun.js   # Bun.build bundle pipeline
│   ├── bundle-css.js         # Bun CSS bundler
│   ├── minifier.js
│   ├── server/          # CSR, SSR, SSG handlers (+ ssr-bun.js: Bun.serve SSR)
│   └── internal/        # Transpiler, CSS bundler
├── playground/          # Example applications
├── docs/                # Documentation
│   ├── STATE_MANAGEMENT.md
│   └── Design Overview.md
└── examples/            # Usage examples
```

---

## API Reference

### Element Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `div`, `span`, etc. | `(props, ...children) → Element` | Create HTML elements |
| `Body` | `document.body` alias | Access body element |
| `TextNode` | `(text) → Text` | Create text node |

### Utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateUUIDv7` | `() → string` | Generate UUID v7 |
| `loadCSS` | `(href) → void` | Load CSS file |
| `overlayModal` | `(props, content) → void` | Show modal |

### State Management

| Function | Signature | Description |
|----------|-----------|-------------|
| `createStore` | `(initialState, options?) → Store` | Create state store |
| `store.getState` | `() → Object` | Get current state |
| `store.setState` | `(partial) → void` | Update state |
| `store.subscribe` | `(fn, keys?) → unsubscribe` | Listen to changes |

### Reactive Helpers

| Function | Signature | Description |
|----------|-----------|-------------|
| `reactive` | `(store, key) → Text` | Auto-updating text node |
| `reactiveElement` | `(store, key, fn) → Element` | Auto-replacing element |
| `reactiveAttr` | `(el, attr, store, key) → Element` | Reactive attribute |
| `reactiveStyle` | `(el, prop, store, key) → Element` | Reactive style |

---

## Design Philosophy

1. **No Build Step**: Works directly in the browser
2. **No Virtual DOM**: Direct DOM manipulation
3. **Explicit Over Magic**: Clear data flow
4. **Lightweight**: Single file, ~10KB
5. **Vanilla First**: Pure JavaScript, no dependencies
