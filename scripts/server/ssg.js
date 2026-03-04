import fs from 'fs'
import path from 'path'
import { renderFile } from './ssr.js'
import { resolvePath } from '../internal/transpiler.js'

function buildSSG(config) {
    const { srcDir, distDir, rootDir } = config
    console.log(`Building SSG from ${srcDir} to ${distDir}...`)
    
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true })
    }
    
    // 1. Find all HTML files in srcDir
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.html'))
    
    files.forEach(file => {
        console.log(`Rendering ${file}...`)
        const filePath = path.join(srcDir, file)
        
        try {
            // Render HTML
            let html = renderFile(filePath, rootDir)
            console.log(`[SSG] Initial HTML length: ${html.length}`)
            
            // 3. Rewrite file:// URLs to relative paths
            const fileUrlRegex = /["'](file:\/\/.*?)["']/g
            html = html.replace(fileUrlRegex, (match, url) => {
                try {
                    const urlObj = new URL(url)
                    const absolutePath = urlObj.pathname
                    
                    let destPath
                    const relToSrc = path.relative(srcDir, absolutePath)
                    const isInsideSrc = !relToSrc.startsWith('..') && !path.isAbsolute(relToSrc)
                    
                    if (isInsideSrc) {
                        destPath = path.join(distDir, relToSrc)
                    } else {
                        const relFromRoot = path.relative(rootDir, absolutePath)
                        destPath = path.join(distDir, relFromRoot)
                    }
                    
                    const htmlDir = path.dirname(path.join(distDir, file))
                    let finalRelPath = path.relative(htmlDir, destPath)
                    
                    if (!finalRelPath.startsWith('.')) {
                        finalRelPath = './' + finalRelPath
                    }
                    
                    return `"${finalRelPath}"`
                } catch (e) {
                    return match
                }
            })
            console.log(`[SSG] HTML length after file:// URL rewrite: ${html.length}`)

            // Helper to rewrite paths
            const rewritePath = (p, currentFile, outputDir) => {
                if (!p || p.startsWith('http') || p.startsWith('data:') || p.startsWith('/') || p.startsWith('#')) return p
                
                try {
                    // Resolve source path relative to the HTML file in srcDir
                    const srcAssetPath = resolvePath(path.dirname(path.join(srcDir, currentFile)), p)
                    
                    // Determine where this asset ends up in distDir
                    let destAssetPath
                    const relToSrc = path.relative(srcDir, srcAssetPath)
                    const isInsideSrc = !relToSrc.startsWith('..') && !path.isAbsolute(relToSrc)
                    
                    if (isInsideSrc) {
                        destAssetPath = path.join(outputDir, relToSrc)
                    } else {
                        const relFromRoot = path.relative(rootDir, srcAssetPath)
                        destAssetPath = path.join(outputDir, relFromRoot)
                    }
                    
                    // Calculate relative path from the HTML file (in dist) to the asset (in dist)
                    const htmlDir = path.dirname(path.join(outputDir, currentFile))
                    let finalRelPath = path.relative(htmlDir, destAssetPath)
                    
                    if (!finalRelPath.startsWith('.')) {
                        finalRelPath = './' + finalRelPath
                    }
                    
                    return finalRelPath
                } catch (e) {
                    return p
                }
            }

            // Rewrite src attributes
            const srcRegex = /src=["'](.*?)["']/g
            html = html.replace(srcRegex, (match, src) => {
                if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) return match
                const rewritten = rewritePath(src, file, distDir)
                return `src="${rewritten}"`
            })
            console.log(`[SSG] HTML length after src rewrite: ${html.length}`)

            // Rewrite href attributes
            const hrefRegex = /href=["'](.*?)["']/g
            html = html.replace(hrefRegex, (match, href) => {
                if (href.startsWith('http') || href.startsWith('//') || href.startsWith('#') || href.startsWith('data:')) return match
                const rewritten = rewritePath(href, file, distDir)
                return `href="${rewritten}"`
            })
            console.log(`[SSG] HTML length after href rewrite: ${html.length}`)

            // Rewrite Import Maps
            const importMapRegex = /<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gmi
            html = html.replace(importMapRegex, (match, content) => {
                try {
                    const map = JSON.parse(content)
                    if (map.imports) {
                        Object.keys(map.imports).forEach(key => {
                            const val = map.imports[key]
                            if (!val.startsWith('http') && !val.startsWith('//')) {
                                map.imports[key] = rewritePath(val, file, distDir)
                            }
                        })
                    }
                    return `<script type="importmap">\n${JSON.stringify(map, null, 2)}\n</script>`
                } catch (e) {
                    return match
                }
            })
            console.log(`[SSG] HTML length after importmap rewrite: ${html.length}`)
            
            // Save HTML
            fs.writeFileSync(path.join(distDir, file), html)
            
            // 2. Scan and Copy Assets
            // We need to parse the *original* content (or rendered?) to find assets.
            // Rendered HTML has the scripts, so we can parse that.
            
            const assetsToCopy = new Set()
            
            // Scripts and Links
            const assetRegex = /<(?:script|link)\b[^>]*?(?:src|href)=["'](.*?)["'][^>]*>/gmi
            let match
            while ((match = assetRegex.exec(html)) !== null) {
                const assetPath = match[1]
                if (assetPath && !assetPath.startsWith('http')) {
                    assetsToCopy.add(assetPath)
                }
            }
            
            // Import Maps (from original content usually, but they are in rendered too)
            const mapRegex = /<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gmi
            const originalContent = fs.readFileSync(filePath, 'utf8')
            while ((match = mapRegex.exec(originalContent)) !== null) {
                try {
                    const map = JSON.parse(match[1])
                    if (map.imports) {
                        Object.values(map.imports).forEach(p => {
                            if (!p.startsWith('http')) assetsToCopy.add(p)
                        })
                    }
                } catch (e) {}
            }
            
            // Helper to recursively scan module dependencies
            function scanDependencies(filePath) {
                if (!fs.existsSync(filePath)) return
                
                const content = fs.readFileSync(filePath, 'utf8')
                const importRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"](.*?)['"]|import\s+['"](.*?)['"]/g
                let match
                while ((match = importRegex.exec(content)) !== null) {
                    const importPathRaw = match[1] || match[2]
                    if (importPathRaw && !importPathRaw.startsWith('http')) {
                        const resolved = resolvePath(path.dirname(filePath), importPathRaw)
                        console.log(`Scanned dependency: ${importPathRaw} -> ${resolved}`)
                        if (!assetsToCopy.has(resolved)) {
                            assetsToCopy.add(resolved)
                            scanDependencies(resolved)
                        }
                    }
                }

                // Scan for new URL(..., import.meta.url)
                const urlRegex = /new\s+URL\s*\(\s*['"](.*?)['"]\s*,\s*import\.meta\.url\s*\)/g
                while ((match = urlRegex.exec(content)) !== null) {
                    const assetPathRaw = match[1]
                    if (assetPathRaw && !assetPathRaw.startsWith('http')) {
                        const resolved = resolvePath(path.dirname(filePath), assetPathRaw)
                        console.log(`Scanned asset: ${assetPathRaw} -> ${resolved}`)
                        if (!assetsToCopy.has(resolved)) {
                            assetsToCopy.add(resolved)
                        }
                    }
                }
            }

            // Copy Loop
            // We need to process the initial assetsToCopy set and expand it
            // Note: assetsToCopy contains paths relative to dist/index.html (because we scanned rewritten HTML)
            // We need to resolve them back to source paths?
            // NO! We scanned rewritten HTML. The paths are relative to dist/index.html.
            // But we need to find the SOURCE file.
            // This is tricky.
            // Better to scan the ORIGINAL content or use the resolved paths from SSR?
            
            // Actually, we can just scan the ORIGINAL content for assets to copy.
            // And use the rewritten paths only for the HTML.
            
            // Let's re-scan original content for assets to copy.
            assetsToCopy.clear()
            
            // Scan original HTML for assets
            const originalAssetRegex = /<(?:script|link)\b[^>]*?(?:src|href)=["'](.*?)["'][^>]*>/gmi
            while ((match = originalAssetRegex.exec(originalContent)) !== null) {
                const assetPath = match[1]
                if (assetPath && !assetPath.startsWith('http')) {
                    // Resolve relative to source file
                    const resolved = resolvePath(path.dirname(filePath), assetPath)
                    assetsToCopy.add(resolved)
                }
            }
            
            // Scan import maps in original content
            while ((match = mapRegex.exec(originalContent)) !== null) {
                try {
                    const map = JSON.parse(match[1])
                    if (map.imports) {
                        Object.values(map.imports).forEach(p => {
                            if (!p.startsWith('http')) {
                                const resolved = resolvePath(path.dirname(filePath), p)
                                assetsToCopy.add(resolved)
                            }
                        })
                    }
                } catch (e) {}
            }

            const initialAssets = Array.from(assetsToCopy)
            assetsToCopy.clear() 

            for (const assetPath of initialAssets) {
                 if (fs.existsSync(assetPath)) {
                     assetsToCopy.add(assetPath)
                     // If it's a JS file, scan for dependencies
                     if (assetPath.endsWith('.js') || assetPath.endsWith('.mjs')) {
                         scanDependencies(assetPath)
                     }
                 }
            }

            for (const srcPath of assetsToCopy) {
                try {
                    // Resolve dest path
                    let destPath
                    
                    // Check if srcPath is inside srcDir
                    const relToSrc = path.relative(srcDir, srcPath)
                    const isInsideSrc = !relToSrc.startsWith('..') && !path.isAbsolute(relToSrc)
                    
                    if (isInsideSrc) {
                        // Keep relative structure from srcDir
                        destPath = path.join(distDir, relToSrc)
                    } else {
                        // Outside srcDir (e.g. shared libs)
                        // Mirror project structure relative to root
                        const relFromRoot = path.relative(rootDir, srcPath)
                        destPath = path.join(distDir, relFromRoot)
                    }
                    
                    if (fs.existsSync(srcPath)) {
                        const destDirPath = path.dirname(destPath)
                        if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true })
                        
                        fs.copyFileSync(srcPath, destPath)
                        console.log(`Copied ${path.relative(rootDir, srcPath)} to ${path.relative(rootDir, destPath)}`)
                    }
                } catch (e) {
                    console.error(`Failed to copy asset ${srcPath}`, e)
                }
            }
            
        } catch (e) {
            console.error(`Failed to render ${file}`, e)
        }
    })
    
    console.log('SSG Build complete.')
}

function handleSSGServe(req, res, config) {
    const { distDir } = config
    // Serve static files from distDir
    // We can reuse a simple static file server logic
    
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

export { buildSSG, handleSSGServe }
