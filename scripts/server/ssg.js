import fs from 'fs'
import path from 'path'

/**
 * SSG build: each top-level HTML file in srcDir is a Bun HTML entrypoint —
 * referenced scripts and stylesheets are bundled, minified, hashed, and their
 * paths rewritten by Bun itself.
 *
 * Page conventions: Bun rewrites `<script src>` tags to deferred
 * `type="module"` scripts, so page inline scripts must be `type="module"` too,
 * and cross-script globals must be explicit `window.x = ...` assignments.
 * See scripts/BUN_TOOLCHAIN_PROPOSAL.md.
 */
async function buildSSGBun(config) {
    const { srcDir, distDir } = config

    if (typeof Bun === 'undefined') {
        console.error('SSG builds require running under the bun runtime.')
        process.exit(1)
    }

    const entrypoints = fs.readdirSync(srcDir)
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(srcDir, f))

    if (entrypoints.length === 0) {
        console.error(`No HTML entrypoints found in ${srcDir}`)
        process.exit(1)
    }

    console.log(`Building SSG from ${srcDir} to ${distDir}...`)
    const result = await Bun.build({
        entrypoints: entrypoints,
        outdir: distDir,
        minify: true
    })

    if (!result.success) {
        console.error('SSG build failed')
        for (const message of result.logs) {
            console.error(message)
        }
        process.exit(1)
    }

    for (const output of result.outputs) {
        console.log(`  ${path.relative(process.cwd(), output.path)} (${output.size} bytes)`)
    }

    console.log('SSG build complete.')
}

function handleSSGServe(req, res, config) {
    const { distDir } = config

    let url = req.url === '/' ? '/index.html' : req.url
    const filePath = path.join(distDir, url)

    if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath)
        const content = fs.readFileSync(filePath)
        const type = ext === '.html' ? 'text/html' :
                     (ext === '.js' || ext === '.mjs') ? 'text/javascript' :
                     ext === '.css' ? 'text/css' : 'text/plain'

        res.writeHead(200, { 'Content-Type': type })
        res.end(content)
    } else {
        res.writeHead(404)
        res.end('Not found')
    }
}

export { buildSSGBun, handleSSGServe }
