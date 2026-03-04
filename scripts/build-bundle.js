import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { bundleCss } from './internal/css-bundler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
const COMPONENTS_DIR = path.join(ROOT, 'ltng-components')

// Ensure build dir exists
if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true })
}

// 1. Bundle CSS
bundleCss(ROOT, COMPONENTS_DIR, BUILD_DIR)

// 2. Build JS
console.log('Building JS...')
try {
    execSync('npx esbuild build/modules/exports.js --bundle --platform=browser --outfile=build/ltng-ui-all.esbuild.min.js --minify --format=esm --loader:.css=file', {
        cwd: ROOT,
        stdio: 'inherit'
    })
} catch (e) {
    console.error('JS Build failed')
    process.exit(1)
}

// 3. Post-process JS
console.log('Post-processing JS...')
const jsBundlePath = path.join(BUILD_DIR, 'ltng-ui-all.esbuild.min.js')
let jsContent = fs.readFileSync(jsBundlePath, 'utf8')

// Regex to match window.loadCSS(new URL(..., import.meta.url).href);
// The pattern used in source is `window.loadCSS(new URL('../styles/theme.css', import.meta.url).href)`
// esbuild minifies this to: window.loadCSS(new URL("../styles/theme.css",import.meta.url).href)
const loadCssRegex = /window\.loadCSS\(new URL\((['\"`]).*?\1,import\.meta\.url\)\.href\);?/g

// Verify count
const matchCount = (jsContent.match(loadCssRegex) || []).length
console.log(`Found ${matchCount} loadCSS calls to strip.`)

if (matchCount > 0) {
    jsContent = jsContent.replace(loadCssRegex, '')

    // Inject the single CSS bundle loader
    const bundleLoader = `window.loadCSS(new URL('./ltng-ui-all.esbuild.min.css', import.meta.url).href);`
    jsContent += `\n${bundleLoader}`

    fs.writeFileSync(jsBundlePath, jsContent)
    console.log('JS Bundle patched successfully.')
} else {
    console.warn('No loadCSS calls found to strip. Check regex or source.')
    // Still inject the loader to ensure styles load.
    const bundleLoader = `window.loadCSS(new URL('./ltng-ui-all.esbuild.min.css', import.meta.url).href);`
    jsContent += `\n${bundleLoader}`
    fs.writeFileSync(jsBundlePath, jsContent)
}
