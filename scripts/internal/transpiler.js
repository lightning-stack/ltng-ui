import fs from 'fs'
import path from 'path'

/**
 * Resolves a path relative to a base directory or using an import map.
 * @param {string} basePath - The directory of the file initiating the import.
 * @param {string} importPath - The path to resolve.
 * @param {object} importMap - Optional import map.
 * @returns {string} The resolved absolute path.
 */
function resolvePath(basePath, importPath, importMap = {}) {
    if (importMap[importPath]) {
        // Import map paths are usually relative to the root or specific locations.
        // We assume they resolve to a path relative to the project root or absolute.
        // If it starts with /, it's absolute (from project root).
        // If relative, it's relative to what? usually the HTML file, but here we might need context.
        // For now, let's assume import map values are relative to the project root if they start with ./ or ../
        // Or if they are absolute paths.
        const mapped = importMap[importPath]
        if (path.isAbsolute(mapped)) {
            return mapped
        }
        // If mapped path is relative, it's relative to the project root?
        // Let's assume project root is 2 levels up from this script? 
        // No, we shouldn't make assumptions about where this script is running relative to project root 
        // without passing project root.
        // But for now, let's just resolve it relative to basePath if it looks relative.
        return path.resolve(basePath, mapped)
    }
    
    return path.resolve(basePath, importPath)
}

/**
 * Transpiles ES module code to a global-assignment format.
 * @param {string} code - The source code.
 * @param {string} filename - The filename for context (optional).
 * @returns {string} Transpiled code.
 */
function transpile(code, filename = '', options = {}) {
    let transpiled = code
    const scope = options.scope || 'window'

    // 1. Handle Imports
    // ... (existing import logic, slightly modified to use scope if needed, but imports usually assign to local vars)
    // Actually existing logic assigns imports to window?
    // "var ${alias} = window.${original};"
    // We should probably change this to `var ${alias} = ${scope}.${original};` if we are bundling packages?
    // But for now let's focus on Exports.

    // 2. Handle Exports
    // export const/var/let
    // We convert all to 'var' to allow assignment chaining: var x = window.x = scope.x = val
    // This ensures global availability even when scoped.
    transpiled = transpiled.replace(/export\s+(const|var|let)\s+(\w+)/g, `var $2 = window.$2 = ${scope}.$2`)
    

    // export function
    transpiled = transpiled.replace(/export\s+function\s+(\w+)/g, `window.$1 = ${scope}.$1 = function $1`)
    
    // export class
    transpiled = transpiled.replace(/export\s+class\s+(\w+)/g, `window.$1 = ${scope}.$1 = class $1`)
    
    // export default {} 
    if (/export\s+default\s+\{/.test(transpiled)) {
        transpiled = transpiled.replace(/export\s+default\s+\{/, 'var __ltng_default_export = {')
        transpiled += `\nObject.assign(${scope}, __ltng_default_export);\nObject.assign(window, __ltng_default_export);`
    }

    // export default Identifier
    transpiled = transpiled.replace(/export\s+default\s+(\w+)/g, `window.default = ${scope}.default = $1`)
    
    // export { x, y as z }
    transpiled = transpiled.replace(/export\s+\{([\s\S]*?)\}/g, (match, exports) => {
        return exports.split(',').map(part => {
            part = part.trim()
            if (!part) return ''
            // Handle comments inside existing export blocks? Regex might be fragile but let's assume standard format
            if (part.includes(' as ')) {
                const [original, alias] = part.split(' as ').map(s => s.trim())
                return `window.${alias} = ${scope}.${alias} = ${original};`
            } else {
                return `window.${part} = ${scope}.${part} = ${part};`
            }
        }).join('\n')
    })
    
    // Remove export * from ... (should be handled by bundler logic or ignored)
    transpiled = transpiled.replace(/export\s+\*\s+from\s+['"].*?['"]/g, '')

    // ... imports handling ...
    // The existing import handling replaces imports with var assignments from window.
    // We should make that configurable too? 
    // "var ${alias} = window.${original};"
    
    const importScope = options.importScope || 'window'
    
    const importRegex = /import\s+\{([\s\S]*?)\}\s+from\s+['"](.*?)['"]/g
    transpiled = transpiled.replace(importRegex, (match, imports, source) => {
         const assignments = imports.split(',').map(part => {
            part = part.trim()
            if (!part) return ''
            if (part.includes(' as ')) {
                const [original, alias] = part.split(' as ').map(s => s.trim())
                return `var ${alias} = ${importScope}.${original};`
            } else {
                return `var ${part} = ${importScope}.${part};`
            }
        }).filter(Boolean).join('\n')
        return assignments
    })


    // Remove plain imports
    transpiled = transpiled.replace(/import\s+['"].*?['"]/g, '')
    transpiled = transpiled.replace(/import\s+.*?from\s+['"].*?['"]/g, '')

    // ... loadCSS stripping ...
    if (options.stripLoadCSS) {
        transpiled = transpiled.replace(/window\.loadCSS\(new URL\(.*?, import\.meta\.url\)\.href\)/g, '')
         // Also match scope.loadCSS if scope != window? No, loadCSS is usually global.
    }

    // Handle import.meta
    if (filename && filename !== 'inline') {
        const fileUrl = 'file://' + (filename.startsWith('/') ? '' : '/') + filename
        transpiled = transpiled.replace(/import\.meta/g, `({ url: '${fileUrl}' })`)
    } else {
        transpiled = transpiled.replace(/import\.meta/g, `({ url: 'file:///unknown' })`)
    }

    return transpiled
}


/**
 * Minifies code by removing comments and whitespace.
 * @param {string} code 
 * @returns {string}
 */
function minify(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
        .replace(/^\s*\/\/.*$/gm, '')     // Line comments
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
}

export {
    resolvePath,
    transpile,
    minify
}
