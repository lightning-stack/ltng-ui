# Proposal: Hybrid Navigation (Tier 1 — Browser-Native)

**Status:** Approved recipe — adopt in every ltng-ui project
**Scope:** Documentation + per-project conventions only. No `ltng-ui.js`, server,
or template changes.

---

## 1. Context

ltng-ui applications are **MPAs**: each page is its own HTML file, and
navigation is a real `window.location.href` reload. That model is deliberate —
it is what makes the per-page lifecycle trivial (subscriptions, timers, and
listeners are wiped by the reload itself) and keeps the framework small.

The cost is the *feel*: a visible hard reload between pages, and the suspicion
that we refetch more than we need to. The goal of this proposal is to remove
both **without becoming a SPA** — no client-side router, no history-API
navigation, no change to the MPA declaration.

### Tier 0 — already shipped (the baseline)

Two things already minimize real network cost today:

- **Content-hashed assets.** The bun SSG pipeline emits hashed bundles
  (`chunk-kx20vfrd.js`), so with ordinary HTTP caching a repeat navigation
  refetches only the small HTML file — framework and component JS/CSS come from
  the browser cache.
- **bfcache.** Browsers restore back/forward navigations instantly from the
  back/forward cache, with no work from us.

Tier 1 builds on that baseline using two browser platform features. Both are
**declarative, app-side markup** — the browser does all the work, and ltng-ui
never knows it is happening.

---

## 2. The Tier 1 recipe

Every ltng-ui project adds two snippets.

### 2.1 Speculation rules — prerender the likely next pages

A JSON `<script>` tag in each page's `<head>` listing the pages the user is
likely to visit next:

```html
<script type="speculationrules">
{
    "prerender": [
        { "urls": ["secondary.html", "cart.html"] }
    ]
}
</script>
```

The browser fetches **and fully prerenders** those pages in a hidden renderer.
When the user clicks, the prerendered page is activated instantly — no visible
load, no white flash. It is still a *real* navigation: the old page unloads
(wiping its subscriptions and timers exactly as the MPA model expects), and the
new page's scripts have already run.

**Which URLs to list:** the current page's likely next hops — not the whole
site. Prerendering costs memory and (for pages that fetch) backend calls, so
2–4 targeted URLs per page is the sweet spot. For broader coverage at lower
cost, use `"prefetch"` (fetches the HTML without rendering it) instead of, or
alongside, `"prerender"`:

```html
<script type="speculationrules">
{
    "prerender": [{ "urls": ["checkout.html"] }],
    "prefetch":  [{ "urls": ["about.html", "settings.html"] }]
}
</script>
```

### 2.2 View transitions — animate the navigation

One rule in the app's stylesheet:

```css
@view-transition {
    navigation: auto;
}
```

The browser animates between the outgoing and incoming page (default:
cross-fade), eliminating the hard-reload flash. Elements given a shared
`view-transition-name` in CSS morph between pages — optional polish, not
required for the base effect.

### 2.3 Browser support & degradation

| Feature | Chromium (Chrome/Edge) | Safari | Firefox |
|---|---|---|---|
| Speculation rules `prerender` | ✅ | ❌ (ignored) | ❌ (ignored) |
| Speculation rules `prefetch` | ✅ | partial | partial |
| Cross-document view transitions | ✅ | ✅ (18+) | ❌ (ignored) |

**Degradation is the whole point:** an unsupported browser ignores the JSON
script tag and the at-rule entirely and gets today's plain MPA navigation.
There is no polyfill to ship, no feature detection to write, and no failure
mode — which is why this tier carries near-zero risk.

---

## 3. Conventions & caveats

Two consequences of prerendering need a documented pattern. Both are per-page,
two-line concerns — not framework changes.

### 3.1 Prerendering runs the page's scripts early

A prerendered page executes its JS — including `Body.render` **and any BFF
fetches** — before the user clicks. Usually that is fine (the data is seconds
old, and browsers refresh or discard stale prerenders). But a page whose load
triggers a call that must not fire speculatively (a mutation, an expensive
query, an analytics beacon) must gate it on activation:

```javascript
async function onActivated(fn) {
    if (document.prerendering) {
        document.addEventListener('prerenderingchange', fn, { once: true })
    } else {
        fn()
    }
}

onActivated(() => {
    // BFF calls / analytics that must only run for a real, visible view
    loadDashboardData()
})
```

Rendering the page *shell* (components, layout) needs no gating — prebuilding
the DOM is exactly what makes activation instant. Gate only the side effects.

### 3.2 Persisted stores are read at prerender time

A `persist`-backed store (`createStore(..., { persist: 'key' })`) is read from
`localStorage` when the prerendered page's scripts run. If another page mutates
that store *after* the prerender happened, the prerendered snapshot is stale at
activation. Where that matters, re-sync in the same activation hook:

```javascript
onActivated(() => {
    const persisted = JSON.parse(localStorage.getItem('globalStore') || '{}')
    globalStore.setState(persisted)
})
```

Most pages will not need this — the reactive `subscribe` model repaints from
whatever `setState` delivers.

---

## 4. Per-project adoption checklist

For every ltng-ui project (and every new page added later):

- [ ] Add the `speculationrules` script tag to each page's `<head>`, listing
      that page's 2–4 likely next hops (`prerender`) and optionally broader
      `prefetch` targets.
- [ ] Add `@view-transition { navigation: auto; }` once, in the app's global
      stylesheet (`theme.css` or equivalent).
- [ ] Audit each listed page for load-time side effects (BFF mutations,
      analytics, expensive queries) and gate them with the `onActivated`
      pattern from §3.1.
- [ ] If a page depends on cross-page persisted-store freshness, add the §3.2
      re-sync.
- [ ] Verify in Chromium DevTools → **Application → Speculative loads**: rules
      parsed, prerenders triggered, activation on click.

---

## 5. Explicitly out of scope

- **Tier 2 — `ltng-router` soft navigation** (link interception, client page
  cache, body swap, `pushState`): deferred. It requires an explicit page
  lifecycle contract (mount/unmount, subscription teardown without a reload)
  before it can exist safely, and gets its own design pass if pursued.
- **Template baking** — adding the two snippets to
  `templates/frontend-model-repo`'s page scaffold so new projects start with
  them. Recommended follow-up, separate decision.
- **Server-assisted rules** — `ltng-ui-server` auto-injecting a
  speculation-rules tag generated from its `--routes` map. Optional follow-up,
  separate decision.
