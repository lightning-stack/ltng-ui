import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { transpile, resolvePath } from '../internal/transpiler.js'
import mockDom from '../../mocks/mock-dom.js'
import handleCSR from './csr.js'

function renderFile(filePath, rootDir) {
    let content = fs.readFileSync(filePath, 'utf8')
    
    // 1. Create Mock DOM
    const window = mockDom.createWindow()
    const document = window.document
    
    // 2. Create VM Context
    const sandbox = window
    sandbox.window = sandbox
    sandbox.global = sandbox
    sandbox.console = console
    sandbox.setTimeout = setTimeout
    sandbox.clearTimeout = clearTimeout
    sandbox.URL = URL
    
    vm.createContext(sandbox)
    
    // 3. Parse and Run Scripts
    // We need to extract scripts from the HTML and run them.
    // This is similar to the old script's logic.
    
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gmi
    const srcRegex = /src=["'](.*?)["']/
    const typeRegex = /type=["'](.*?)["']/
    
    // Handle Import Maps first
    let importMap = {}
    const mapRegex = /<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gmi
    let mapMatch
    while ((mapMatch = mapRegex.exec(content)) !== null) {
        try {
            const map = JSON.parse(mapMatch[1])
            if (map.imports) {
                importMap = { ...importMap, ...map.imports }
            }
        } catch (e) {
            console.error('Failed to parse import map', e)
        }
    }
    
    // Helper to load modules
    const loadedModules = new Set()
    function loadModule(modulePath) {
        if (loadedModules.has(modulePath)) return
        console.log(`Loading module: ${modulePath}`)
        loadedModules.add(modulePath)
        
        if (!fs.existsSync(modulePath)) {
            console.error(`Module not found: ${modulePath}`)
            return
        }
        
        const code = fs.readFileSync(modulePath, 'utf8')
        
        // Recursively load dependencies
        // This is a simplified dependency loader. 
        // Real implementation would need full AST parsing or regex for imports.
        // We use the regex from transpiler.js logic implicitly here by checking imports.
        
        const importRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](.*?)['"]|import\s+['"](.*?)['"]/g
        let match
        while ((match = importRegex.exec(code)) !== null) {
            const importPathRaw = match[1] || match[2]
            if (importPathRaw) {
                const resolved = resolvePath(path.dirname(modulePath), importPathRaw, importMap)
                loadModule(resolved)
            }
        }
        
        const transpiled = transpile(code, modulePath)
        const wrapped = `(function(){\n${transpiled}\n})();`
        try {
            vm.runInContext(wrapped, sandbox)
        } catch (e) {
            console.error(`Error running module ${modulePath}:`, e)
        }
    }

    let match
    while ((match = scriptRegex.exec(content)) !== null) {
        const fullTag = match[0]
        const typeMatch = typeRegex.exec(fullTag)
        const type = typeMatch ? typeMatch[1] : ''
        
        if (type === 'importmap') continue
        
        const srcMatch = srcRegex.exec(fullTag)
        const innerScript = match[1]
        
        if (srcMatch) {
            const scriptPathRaw = srcMatch[1]
            const scriptPath = resolvePath(path.dirname(filePath), scriptPathRaw, importMap)
            
            if (type === 'module') {
                loadModule(scriptPath)
            } else {
                if (fs.existsSync(scriptPath)) {
                    const scriptContent = fs.readFileSync(scriptPath, 'utf8')
                    try {
                        vm.runInContext(scriptContent, sandbox)
                    } catch (e) {
                        console.error(`Error running script ${scriptPath}:`, e)
                    }
                }
            }
        } else if (innerScript.trim()) {
            if (type === 'module') {
                // Inline module
                // Scan for dependencies
                const importRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](.*?)['"]|import\s+['"](.*?)['"]/g
                let depMatch
                while ((depMatch = importRegex.exec(innerScript)) !== null) {
                    const importPathRaw = depMatch[1] || depMatch[2]
                    if (importPathRaw) {
                        const resolved = resolvePath(path.dirname(filePath), importPathRaw, importMap)
                        loadModule(resolved)
                    }
                }

                const transpiled = transpile(innerScript, 'inline')
                const wrapped = `(function(){\n${transpiled}\n})();`
                try {
                    vm.runInContext(wrapped, sandbox)
                } catch (e) {
                    console.error('Error running inline module:', e)
                }
            } else {
                try {
                    vm.runInContext(innerScript, sandbox)
                } catch (e) {
                    console.error('Error running inline script:', e)
                }
            }
        }
    }
    
    // 4. Serialize
    // Inject rendered body back into HTML
    // 4. Serialize
    // Inject rendered body back into HTML
    const bodyRegex = /(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i
    const bodyMatch = bodyRegex.exec(content)
    
    // Preserve scripts from the original file (ONLY those in body)
    // Head scripts are preserved by the headRegex replacement below.
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
    }
    
    if (bodyMatch) {
        const openTag = bodyMatch[1]
        const closeTag = bodyMatch[3]
        // Get inner HTML from mock DOM (excluding the body tag itself)
        const bodyInner = document.body.childNodes.map(c => c.toString()).join('')
        
        const newBody = `${openTag}${bodyInner}${bodyScripts}${closeTag}`
        // Use function replacement to avoid $ issues
        content = content.replace(bodyRegex, () => newBody)
    }

    // Inject head changes (e.g. CSS links added by loadCSS)
    // We want to append new links to the existing head, preserving meta/title
    const headRegex = /(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i
    const headMatch = headRegex.exec(content)
    
    if (headMatch) {
        const openTag = headMatch[1]
        const existingContent = headMatch[2]
        const closeTag = headMatch[3]
        
        // Get new links from mock DOM head
        const newLinks = document.head.childNodes.map(c => c.toString()).join('')
        
        const newHead = `${openTag}${existingContent}${newLinks}${closeTag}`
        content = content.replace(headRegex, () => newHead)
    }
    
    return content
}

function handleSSR(req, res, config) {
    const { srcDir, rootDir } = config
    let url = req.url === '/' ? '/index.html' : req.url
    
    if (url.endsWith('.html') || url === '/') {
        let filePath = path.join(srcDir, url === '/' ? 'index.html' : url)
        if (!fs.existsSync(filePath)) {
             filePath = path.join(rootDir, url)
        }
        
        if (fs.existsSync(filePath)) {
            try {
                let html = renderFile(filePath, rootDir)
                
                // Rewrite file:// URLs to server paths
                // The browser cannot load file:// resources. We need to serve them via the server.
                const fileUrlRegex = /["'](file:\/\/.*?)["']/g
                html = html.replace(fileUrlRegex, (match, url) => {
                    try {
                        const urlObj = new URL(url)
                        const absolutePath = path.normalize(urlObj.pathname)
                        
                        // Check if inside srcDir
                        // MODIFIED: We now allow serving from anywhere relative to root
                        const rel = path.relative(rootDir, absolutePath)
                        return `"${rel.startsWith('/') || rel.startsWith('..') ? rel : '/' + rel}"`
                        
                        /* 
                        // Old Logic
                        if (absolutePath.startsWith(srcDir)) {
                            const rel = path.relative(srcDir, absolutePath)
                            return `"${rel.startsWith('/') ? rel : '/' + rel}"`
                        }
                        
                        // Check if inside rootDir
                        if (absolutePath.startsWith(rootDir)) {
                            const rel = path.relative(rootDir, absolutePath)
                            return `"${rel.startsWith('/') ? rel : '/' + rel}"`
                        }
                        */
                        
                        return match
                    } catch (e) {
                        return match
                    }
                })

                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end(html)
            } catch (e) {
                console.error(e)
                res.writeHead(500)
                res.end('SSR Error')
            }
        } else {
            res.writeHead(404)
            res.end('Not found')
        }
    } else {
        // Serve static assets (JS, CSS) as normal files
        // We can reuse CSR handler logic or just serve raw files
        // Usually SSR only renders HTML, assets are static.
        // But if we want to support on-the-fly transpilation for client-side hydration,
        // we might need to use the CSR handler for JS files.
        // Let's delegate to a static file server helper or reuse CSR logic.
        // For simplicity, let's just serve raw files, but wait, 
        // if the client needs to hydrate, it needs transpiled files if they are modules!
        // So we should use the CSR handler for assets.
        
        handleCSR(req, res, config)
    }
}

export { handleSSR, renderFile }
