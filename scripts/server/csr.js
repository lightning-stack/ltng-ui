import fs from 'fs'
import path from 'path'
import { transpile } from '../internal/transpiler.js'

/**
 * Resolve a URL path against the route map.
 * Checks exact match first, then wildcard patterns.
 * 
 * @param {string} url - The URL path (e.g., "/profile/abc")
 * @param {Object} routeMap - The route map { "/route": "file.html" }
 * @returns {string|null} The mapped file path, or null
 */
function resolveRoute(url, routeMap) {
    // 1. Exact match
    if (routeMap[url]) return routeMap[url]

    // 2. Wildcard match: "/profile/*" matches "/profile/anything"
    for (const [pattern, file] of Object.entries(routeMap)) {
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2) // remove /*
            if (url.startsWith(prefix + '/') || url === prefix) {
                return file
            }
        }
    }

    return null
}

/**
 * Serve a file with the appropriate content type
 */
function serveFile(filePath, res) {
    const ext = path.extname(filePath)
    const content = fs.readFileSync(filePath)
    
    const contentTypes = {
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
    }

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' })
    res.end(content)
}

function handleCSR(req, res, config) {
    const { srcDir, rootDir, routeMap } = config
    let url = req.url === '/' ? '/index.html' : req.url

    // Strip query string for file resolution
    const queryIndex = url.indexOf('?')
    const cleanUrl = queryIndex !== -1 ? url.substring(0, queryIndex) : url
    
    const hasExtension = path.extname(cleanUrl) !== ''

    // --- Route Map Resolution (for extensionless URLs) ---
    if (!hasExtension && cleanUrl !== '/' && routeMap) {
        const mapped = resolveRoute(cleanUrl, routeMap)
        if (mapped) {
            const mappedPath = path.join(srcDir, mapped)
            if (fs.existsSync(mappedPath)) {
                const content = fs.readFileSync(mappedPath)
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end(content)
                return
            }
        }
    }

    // --- Standard File Resolution ---
    // Clean URL support: if URL has no extension, try adding .html
    if (!hasExtension && cleanUrl !== '/') {
        const htmlPath = path.join(srcDir, cleanUrl + '.html')
        if (fs.existsSync(htmlPath)) {
            url = cleanUrl + '.html'
        }
    }

    let filePath = path.join(srcDir, hasExtension ? cleanUrl : url)
    
    // Fallback to rootDir if not found in srcDir (for shared assets like pkg/)
    if (!fs.existsSync(filePath)) {
        const potentialRootPath = path.join(rootDir, hasExtension ? cleanUrl : url)
        if (fs.existsSync(potentialRootPath)) {
            filePath = potentialRootPath
        } else {
            // Search upwards (up to 3 levels) for assets
            let currentSearchDir = rootDir
            const searchUrl = hasExtension ? cleanUrl : url
            for (let i = 0; i < 3; i++) {
                currentSearchDir = path.join(currentSearchDir, '..')
                const potentialPath = path.join(currentSearchDir, searchUrl)
                if (fs.existsSync(potentialPath)) {
                    filePath = potentialPath
                    break
                }
            }
        }
    }

    // --- Serve file or fallback ---
    if (fs.existsSync(filePath)) {
        serveFile(filePath, res)
    } else if (!hasExtension) {
        // Fallback: serve index.html for unmatched extensionless URLs
        // This lets the client-side router handle the route
        const indexPath = path.join(srcDir, 'index.html')
        if (fs.existsSync(indexPath)) {
            serveFile(indexPath, res)
        } else {
            res.writeHead(404)
            res.end('Not found')
        }
    } else {
        res.writeHead(404)
        res.end('Not found')
    }
}

export default handleCSR
