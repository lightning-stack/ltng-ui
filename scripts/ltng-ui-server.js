import fs from 'fs'
import http from 'http'
import path from 'path'
import { parseRoutesFile } from './internal/routes-parser.js'
import handleCSR from './server/csr.js'
import { buildSSGBun, handleSSGServe } from './server/ssg.js'
import { startSSRBunServer } from './server/ssr.js'

// CLI Argument Parsing
const args = process.argv.slice(2)
const isBuild = args.includes('--build')
const isServe = args.includes('--serve')
const isBuildAndServe = args.includes('--b&s')

const modeArg = args.find(arg => arg.startsWith('--mode='))
const mode = modeArg ? modeArg.split('=')[1] : 'csr' // Default to CSR

// --engine is retired: SSR and SSG builds are Bun-native.
if (args.some(arg => arg.startsWith('--engine='))) {
    console.log('Note: --engine is no longer needed — SSR/SSG engines are unified on bun.')
}

const portArg = args.find(arg => arg.startsWith('--port='))
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : 3000

const srcArg = args.find(arg => arg.startsWith('--src='))
const SRC_DIR = srcArg ? path.resolve(srcArg.split('=')[1]) : process.cwd()

const routesArg = args.find(arg => arg.startsWith('--routes='))
let routeMap = null
if (routesArg) {
    const routesPath = path.resolve(routesArg.split('=')[1])
    try {
        routeMap = parseRoutesFile(routesPath)
        console.log(`Routes: loaded ${Object.keys(routeMap).length} routes from ${routesPath}`)
    } catch (e) {
        console.error(`Failed to load routes file: ${e.message}`)
        process.exit(1)
    }
}

const distArg = args.find(arg => arg.startsWith('--dist='))
const DIST_DIR = distArg ? path.resolve(distArg.split('=')[1]) : path.join(process.cwd(), 'dist')

const ROOT_DIR = process.cwd() // The directory where the command is run

const config = {
    srcDir: SRC_DIR,
    distDir: DIST_DIR,
    rootDir: ROOT_DIR,
    port: PORT,
    mode: mode,
    routeMap: routeMap
}

console.log(`Mode: ${mode}`)
console.log(`Source: ${SRC_DIR}`)
console.log(`Dist: ${DIST_DIR}`)
console.log(`Port: ${PORT}`)

// Logic Dispatcher
if (isBuild || (isBuildAndServe && mode === 'ssg')) {
    if (mode === 'ssg') {
        await buildSSGBun(config)
        if (isBuild) process.exit(0)
    } else {
        console.error('Build is only supported for SSG mode.')
        process.exit(1)
    }
}

if (mode === 'ssr') {
    startSSRBunServer(config)
} else {

const server = http.createServer((req, res) => {
    try {
        if (mode === 'csr') {
            handleCSR(req, res, config)
        } else if (mode === 'ssg') {
            handleSSGServe(req, res, config)
        } else {
            res.writeHead(500)
            res.end(`Unknown mode: ${mode}`)
        }
    } catch (e) {
        console.error('Server Error:', e)
        res.writeHead(500)
        res.end('Internal Server Error')
    }
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${mode.toUpperCase()} mode at http://0.0.0.0:${PORT}`)
})

}
