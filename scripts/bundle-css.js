import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
const COMPONENTS_DIR = path.join(ROOT, 'ltng-components')

const CSS_BUNDLE_NAME = 'ltng-ui-all.min.css'

function findCssFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const res = path.resolve(dir, entry.name)
        if (entry.isDirectory()) {
            findCssFiles(res, out)
        } else if (entry.name.endsWith('.css')) {
            out.push(res)
        }
    }

    return out
}

async function bundleCssBun() {
    console.log('Bundling CSS (bun)...')
    const cssFiles = findCssFiles(COMPONENTS_DIR)

    // theme.css first so variables are defined before anything consumes them
    const themeIdx = cssFiles.findIndex(f => f.endsWith('theme.css'))
    if (themeIdx > -1) {
        cssFiles.unshift(cssFiles.splice(themeIdx, 1)[0])
    } else {
        console.warn('Warning: theme.css not found in ltng-components.')
    }

    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true })
    }

    const tmpPath = path.join(BUILD_DIR, '.tmp-bun-bundle.css')
    fs.writeFileSync(tmpPath, cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n'))

    try {
        const result = await Bun.build({
            entrypoints: [tmpPath],
            minify: true
        })

        const css = await result.outputs[0].text()
        const outPath = path.join(BUILD_DIR, CSS_BUNDLE_NAME)
        fs.writeFileSync(outPath, css)
        console.log(`CSS bundled + minified: ${path.relative(ROOT, outPath)} (${cssFiles.length} files, ${css.length} bytes)`)

        return outPath
    } finally {
        fs.unlinkSync(tmpPath)
    }
}

if (import.meta.main) {
    await bundleCssBun()
}

export { bundleCssBun, CSS_BUNDLE_NAME }
