import fs from 'fs'
import path from 'path'

/**
 * Parse a routes file and return a flat { "/route": "file.html" } map.
 * Supports .json, .toon, and .yaml/.yml formats.
 * 
 * @param {string} filePath - Absolute path to the routes file
 * @returns {Object} Route map: { route: htmlFile }
 */
export function parseRoutesFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Routes file not found: ${filePath}`)
    }

    const ext = path.extname(filePath).toLowerCase()
    const content = fs.readFileSync(filePath, 'utf8')

    switch (ext) {
        case '.json':
            return parseJSON(content)
        case '.toon':
            return parseTOON(content)
        case '.yaml':
        case '.yml':
            return parseYAML(content)
        default:
            throw new Error(`Unsupported routes file format: ${ext}. Supported: .json, .toon, .yaml, .yml`)
    }
}

/**
 * Parse JSON routes file
 */
function parseJSON(content) {
    const parsed = JSON.parse(content)
    validateRouteMap(parsed)
    return parsed
}

/**
 * Parse TOON routes file
 * Format: key: value lines, # comments, blank lines ignored
 * 
 * Example:
 *   # Auth pages
 *   /login: login.html
 *   /signup: signup.html
 *   /profile/*: profile.html
 */
function parseTOON(content) {
    const routes = {}
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // Skip empty lines and comments
        if (!line || line.startsWith('#')) continue

        // Find the first colon that separates key from value
        const colonIndex = findSeparatorColon(line)
        if (colonIndex === -1) {
            throw new Error(`TOON parse error on line ${i + 1}: no key:value separator found in "${line}"`)
        }

        const key = line.substring(0, colonIndex).trim()
        const value = stripInlineComment(line.substring(colonIndex + 1).trim())

        if (!key || !value) {
            throw new Error(`TOON parse error on line ${i + 1}: empty key or value in "${line}"`)
        }

        routes[key] = value
    }

    validateRouteMap(routes)
    return routes
}

/**
 * Parse YAML routes file (flat key:value format only)
 * Supports optional quotes around keys (needed for wildcards like "/profile/*")
 * 
 * Example:
 *   /login: login.html
 *   "/profile/*": profile.html
 */
function parseYAML(content) {
    const routes = {}
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // Skip empty lines and comments
        if (!line || line.startsWith('#')) continue

        // Skip YAML document markers
        if (line === '---' || line === '...') continue

        let key, value

        // Handle quoted keys: "/profile/*": profile.html
        const quotedKeyMatch = line.match(/^["'](.+?)["']\s*:\s*(.+)$/)
        if (quotedKeyMatch) {
            key = quotedKeyMatch[1]
            value = stripInlineComment(stripQuotes(quotedKeyMatch[2].trim()))
        } else {
            // Unquoted key: /login: login.html
            const colonIndex = findSeparatorColon(line)
            if (colonIndex === -1) continue // skip lines without key:value

            key = line.substring(0, colonIndex).trim()
            value = stripInlineComment(stripQuotes(line.substring(colonIndex + 1).trim()))
        }

        if (!key || !value) continue

        routes[key] = value
    }

    validateRouteMap(routes)
    return routes
}

/**
 * Find the colon that separates key from value.
 * For route paths like /login, the colon after the key is the separator.
 * We look for ": " or the last colon on the line.
 */
function findSeparatorColon(line) {
    // Prefer ": " (colon-space) as separator — most readable
    const colonSpace = line.indexOf(': ')
    if (colonSpace !== -1) return colonSpace

    // Fallback: last colon (handles compact "key:value")
    const lastColon = line.lastIndexOf(':')
    // Make sure it's not the only character
    if (lastColon > 0 && lastColon < line.length - 1) return lastColon

    return -1
}

/**
 * Strip surrounding quotes from a value
 */
function stripQuotes(value) {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1)
    }
    return value
}

/**
 * Strip inline comments (# ...) from a value
 */
function stripInlineComment(value) {
    // Only strip if there's a space before #, to avoid stripping from filenames
    const commentIndex = value.indexOf('  #')
    if (commentIndex !== -1) return value.substring(0, commentIndex).trim()

    const commentIndex2 = value.indexOf(' #')
    if (commentIndex2 !== -1) return value.substring(0, commentIndex2).trim()

    return value
}

/**
 * Validate that all values in the route map are strings
 */
function validateRouteMap(map) {
    for (const [key, value] of Object.entries(map)) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid route map: value for "${key}" must be a string, got ${typeof value}`)
        }
    }
}
