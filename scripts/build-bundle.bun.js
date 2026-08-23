import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { bundleCssBun, CSS_BUNDLE_NAME } from './bundle-css.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
const ENTRY = path.join(BUILD_DIR, 'modules', 'exports.js')
const OUT_NAME = 'ltng-ui-all.min.js'

// Matches component-level `window.loadCSS(new URL('...', import.meta.url).href)` call
// sites in UNMINIFIED source only — never the `window.loadCSS = ...` definition in
// ltng-ui.js. Stripping before bundling keeps this transform independent of the
// minifier's output format (the weakness of the esbuild-era post-processing).
const LOAD_CSS_CALL_REGEX = /window\.loadCSS\(\s*new URL\(\s*(['"`])[^'"`]*?\1\s*,\s*import\.meta\.url\s*\)\.href\s*\)\s*;?/g

let strippedCount = 0

const stripLoadCssPlugin = {
    name: 'strip-loadcss',
    setup(build) {
        build.onLoad({ filter: /\.(js|mjs)$/ }, async (args) => {
            let contents = await Bun.file(args.path).text()

            const matches = contents.match(LOAD_CSS_CALL_REGEX)
            if (matches) {
                strippedCount += matches.length
                contents = contents.replace(LOAD_CSS_CALL_REGEX, '')
            }

            return { contents, loader: 'js' }
        })
    }
}

// 1. CSS bundle first so the loader injected below always resolves
await bundleCssBun()

// 2. JS bundle
console.log('Building JS (bun)...')
let result
try {
    result = await Bun.build({
        entrypoints: [ENTRY],
        target: 'browser',
        format: 'esm',
        minify: true,
        external: ['node:fs', 'node:path'],
        plugins: [stripLoadCssPlugin]
    })
} catch (e) {
    console.error('JS Build failed:', e)
    process.exit(1)
}

if (!result.success) {
    console.error('JS Build failed')
    for (const message of result.logs) {
        console.error(message)
    }
    process.exit(1)
}

let jsContent = await result.outputs[0].text()
console.log(`Stripped ${strippedCount} loadCSS calls at source level.`)

// 3. Point the bundle at the single CSS bundle
jsContent += `\nwindow.loadCSS(new URL('./${CSS_BUNDLE_NAME}', import.meta.url).href);\n`

const outPath = path.join(BUILD_DIR, OUT_NAME)
fs.writeFileSync(outPath, jsContent)
console.log(`Created ${path.relative(ROOT, outPath)} (${jsContent.length} bytes)`)
