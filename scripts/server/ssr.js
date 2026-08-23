import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import mockDom from '../../mocks/mock-dom.js'

// Bun-native SSR (proposal Phase 3): Bun.serve + HTMLRewriter script extraction +
// native ESM imports against the mock DOM. No vm sandbox, no regex transpiler.
//
// Isolation model: the mock window/document are installed on globalThis for the
// duration of a render, so renders are serialized through a mutex. Entry scripts
// are re-evaluated per request via a cache-busting query; sub-modules they import
// stay cached across requests (stateless framework code is fine, stateful app
// sub-modules are not — see scripts/BUN_TOOLCHAIN_PROPOSAL.md).

let seq = 0
let tmpDir = null

function ensureTmpDir() {
    if (!tmpDir) {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltng-ssr-'))
    }

    return tmpDir
}

// Serialize renders: globalThis carries the mock DOM while a page executes.
let renderQueue = Promise.resolve()

function withRenderLock(fn) {
    const run = renderQueue.then(fn, fn)
    renderQueue = run.then(() => {}, () => {})

    return run
}

const MOCK_KEYS = [
    'window',
    'global',
    'document',
    'HTMLElement',
    'HTMLBodyElement',
    'HTMLUnknownElement',
    'Node',
    'TextNode',
    'localStorage'
]

/**
 * Browser semantics: `window` IS the global object, so `window.x = ...` must
 * create a bare global (ltng-ui attaches its whole API that way). We therefore
 * point `window` at globalThis for the duration of a render, install the mock
 * DOM on it, and afterwards sweep every property the render added and restore
 * the ones it overwrote.
 */
/**
 * The mock DOM has no element-level querySelector, but createStore.subscribe
 * invokes its listener immediately (ltng-ui.js:236), and page listeners commonly
 * do `container.querySelector(...)` — without this, page scripts abort before
 * Body.render. Minimal support: `#id`, `.class`, and tag selectors.
 */
function ensureQuerySelector(mockWindow) {
    if (mockWindow.HTMLElement.prototype.querySelector) return

    const matches = (node, selector) => {
        if (!node.tagName) return false
        if (selector.startsWith('#')) return node.attributes?.['id'] === selector.slice(1)
        if (selector.startsWith('.')) {
            return (node.attributes?.['class'] || '').split(' ').includes(selector.slice(1))
        }

        return node.tagName === selector.toLowerCase()
    }

    mockWindow.HTMLElement.prototype.querySelector = function (selector) {
        const find = (node) => {
            for (const child of node.childNodes || []) {
                if (matches(child, selector)) return child
                const found = find(child)
                if (found) return found
            }

            return null
        }

        return find(this)
    }
}

function installGlobals(mockWindow) {
    ensureQuerySelector(mockWindow)

    const before = new Set(Object.getOwnPropertyNames(globalThis))
    const saved = MOCK_KEYS
        .filter(key => before.has(key))
        .map(key => ({ key: key, value: globalThis[key] }))

    globalThis.window = globalThis
    globalThis.global = globalThis
    // Scripts run once per render on a shared globalThis. A non-configurable
    // defineProperty from a previous render (e.g. ltng-ui's `Body` getter, whose
    // getter reads the live `document` and so stays correct) cannot be redefined
    // — executeCode reroutes window defineProperty calls here to tolerate that.
    globalThis.__ssrSafeDefineProperty = (target, prop, descriptor) => {
        try {
            Object.defineProperty(target, prop, descriptor)
        } catch (e) {
            // already defined non-configurably by a previous render — keep it
        }

        return target
    }
    globalThis.document = mockWindow.document
    globalThis.HTMLElement = mockWindow.HTMLElement
    globalThis.HTMLBodyElement = mockWindow.HTMLBodyElement
    globalThis.HTMLUnknownElement = mockWindow.HTMLUnknownElement
    globalThis.Node = mockWindow.Node
    globalThis.TextNode = mockWindow.TextNode
    globalThis.localStorage = mockWindow.localStorage

    return function restore() {
        for (const key of Object.getOwnPropertyNames(globalThis)) {
            if (!before.has(key)) {
                try {
                    delete globalThis[key]
                } catch (e) {
                    // non-configurable — leave it
                }
            }
        }

        for (const { key, value } of saved) {
            globalThis[key] = value
        }
    }
}

/**
 * Collect every <script> in the HTML via Bun's built-in HTMLRewriter:
 * { src, type, content } per tag, in document order.
 */
async function extractScripts(html) {
    const scripts = []
    let current = null

    const rewriter = new HTMLRewriter().on('script', {
        element(el) {
            current = {
                src: el.getAttribute('src'),
                type: el.getAttribute('type') || '',
                content: ''
            }
            scripts.push(current)
        },
        text(chunk) {
            if (current) {
                current.content += chunk.text
            }
        }
    })

    await rewriter.transform(new Response(html)).text()

    return scripts
}

/**
 * Rewrite relative import specifiers in inline-script code to absolute file://
 * URLs, so the code can execute from a temp module file outside the page dir.
 */
function rewriteRelativeImports(code, baseDir) {
    return code.replace(
        /(from\s+|import\s+)(['"])(\.\.?\/[^'"]+)\2/g,
        (match, prefix, quote, spec) =>
            `${prefix}${quote}${pathToFileURL(path.resolve(baseDir, spec)).href}${quote}`
    )
}

/**
 * Execute one script body per render via a fresh temp module. Bun's module
 * cache ignores query strings, so importing the original file re-executes only
 * once per process — a per-render copy in a fresh directory is the reliable
 * re-evaluation unit (fresh directory because Bun also caches directory
 * listings: a second file written into an already-imported-from directory is
 * never found). Files are kept until process exit. Relative import specifiers
 * are rewritten to absolute file:// URLs against the code's real directory, so
 * dependency graphs still resolve (and stay cached across renders — see the
 * proposal's Phase 3 limitations).
 */
async function executeCode(code, baseDir, label) {
    const rewritten = rewriteRelativeImports(code, baseDir)
        .replace(/Object\.defineProperty\(\s*window\s*,/g, '__ssrSafeDefineProperty(window,')
    const tmpFile = path.join(fs.mkdtempSync(path.join(ensureTmpDir(), 'r')), `${label}-${++seq}.mjs`)
    fs.writeFileSync(tmpFile, rewritten)

    try {
        await import(pathToFileURL(tmpFile).href)
    } catch (e) {
        console.error(`[SSR bun] error running ${label}:`, e)
    }
}

async function runScripts(scripts, filePath) {
    const pageDir = path.dirname(filePath)

    for (const script of scripts) {
        if (script.type === 'importmap') continue

        if (script.src) {
            if (/^(https?:)?\/\//.test(script.src) || script.src.startsWith('data:')) continue

            const abs = path.resolve(pageDir, script.src)
            if (!fs.existsSync(abs)) {
                console.error(`[SSR bun] script not found: ${script.src} (${abs})`)
                continue
            }

            await executeCode(fs.readFileSync(abs, 'utf8'), path.dirname(abs), path.basename(abs))
        } else if (script.content.trim()) {
            await executeCode(script.content, pageDir, 'inline')
        }
    }
}

/**
 * Inject the rendered mock DOM back into the original HTML, preserving the
 * original scripts so the client re-runs them and hydrates (nuke and pave).
 * Mirrors the legacy serializer in ssr.js.
 */
function serialize(content, document, config) {
    const { rootDir } = config

    const bodyRegex = /(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i
    const bodyMatch = bodyRegex.exec(content)

    let bodyScripts = ''
    if (bodyMatch) {
        const bodyStart = bodyMatch.index
        const bodyEnd = bodyStart + bodyMatch[0].length

        let sMatch
        const sRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gmi
        while ((sMatch = sRegex.exec(content)) !== null) {
            if (sMatch.index >= bodyStart && sMatch.index < bodyEnd) {
                bodyScripts += sMatch[0] + '\n'
            }
        }

        const openTag = bodyMatch[1]
        const closeTag = bodyMatch[3]
        const bodyInner = document.body.childNodes.map(c => c.toString()).join('')

        content = content.replace(bodyRegex, () => `${openTag}${bodyInner}${bodyScripts}${closeTag}`)
    }

    const headRegex = /(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i
    const headMatch = headRegex.exec(content)

    if (headMatch) {
        const newLinks = document.head.childNodes.map(c => c.toString()).join('')
        content = content.replace(headRegex, () => `${headMatch[1]}${headMatch[2]}${newLinks}${headMatch[3]}`)
    }

    // Rewrite file:// URLs (e.g. loadCSS links) to server paths
    const fileUrlRegex = /["'](file:\/\/.*?)["']/g
    content = content.replace(fileUrlRegex, (match, url) => {
        try {
            const absolutePath = path.normalize(new URL(url).pathname)
            const rel = path.relative(rootDir, absolutePath)

            return `"${rel.startsWith('/') || rel.startsWith('..') ? rel : '/' + rel}"`
        } catch (e) {
            return match
        }
    })

    return content
}

async function renderPageBun(filePath, config) {
    const content = fs.readFileSync(filePath, 'utf8')
    const scripts = await extractScripts(content)

    return withRenderLock(async () => {
        const mockWindow = mockDom.createWindow()

        const restore = installGlobals(mockWindow)
        try {
            await runScripts(scripts, filePath)

            return serialize(content, mockWindow.document, config)
        } finally {
            restore()
        }
    })
}

async function renderResponse(filePath, config) {
    try {
        const html = await renderPageBun(filePath, config)

        return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    } catch (e) {
        console.error('[SSR bun] render failed:', e)

        return new Response('SSR Error', { status: 500 })
    }
}

function resolvePageFile(pathname, config) {
    const { srcDir, rootDir } = config
    const file = pathname === '/' ? '/index.html' : pathname

    const inSrc = path.join(srcDir, file)
    if (fs.existsSync(inSrc)) return inSrc

    const inRoot = path.join(rootDir, file)
    if (fs.existsSync(inRoot)) return inRoot

    return null
}

function resolveStaticFile(pathname, config) {
    const { srcDir, rootDir } = config

    const candidates = [path.join(srcDir, pathname), path.join(rootDir, pathname)]

    // Search upwards (up to 3 levels) for shared assets, mirroring the CSR handler
    let currentSearchDir = rootDir
    for (let i = 0; i < 3; i++) {
        currentSearchDir = path.join(currentSearchDir, '..')
        candidates.push(path.join(currentSearchDir, pathname))
    }

    return candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || null
}

function startSSRBunServer(config) {
    const { port, routeMap, srcDir } = config

    const routes = {}
    if (routeMap) {
        for (const [pattern, file] of Object.entries(routeMap)) {
            const target = path.join(srcDir, file)
            routes[pattern] = () => renderResponse(target, config)
        }
    }

    const server = Bun.serve({
        port: port,
        hostname: '0.0.0.0',
        routes: routes,
        fetch(req) {
            const pathname = new URL(req.url).pathname

            if (pathname === '/' || pathname.endsWith('.html')) {
                const pageFile = resolvePageFile(pathname, config)
                if (pageFile) return renderResponse(pageFile, config)

                return new Response('Not found', { status: 404 })
            }

            // Extensionless clean URLs → try <path>.html
            if (path.extname(pathname) === '') {
                const pageFile = resolvePageFile(`${pathname}.html`, config)
                if (pageFile) return renderResponse(pageFile, config)
            }

            const staticFile = resolveStaticFile(pathname, config)
            if (staticFile) return new Response(Bun.file(staticFile))

            return new Response('Not found', { status: 404 })
        }
    })

    console.log(`Server running in SSR (bun) mode at http://0.0.0.0:${server.port}`)

    return server
}

export { startSSRBunServer, renderPageBun }
