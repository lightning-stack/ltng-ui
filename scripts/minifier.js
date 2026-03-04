import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { transpile, minify, resolvePath } from './internal/transpiler.js'
import { bundleCss } from './internal/css-bundler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const BUILD_DIR = path.join(ROOT_DIR, 'build')
const COMPONENTS_DIR = path.join(ROOT_DIR, 'ltng-components')
const MODULES_DIR = path.join(BUILD_DIR, 'modules')
const OUTPUT_DIR = BUILD_DIR

// Ensure output directory exists (it should, since modules are there, but safe to check)
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// Bundle CSS first
bundleCss(ROOT_DIR, COMPONENTS_DIR, OUTPUT_DIR)

const entryPoints = [
    'ltng-framework.js',
    'ltng-testingtools.js',
    'ltng-tools.js',
    'ltng-book.js',
    'ltng-components.js',
    'exports.js'
]

// Track processed files to avoid cycles/duplicates (naive check)
const processedFiles = new Set()

function processModule(filePath, scopeName) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
    }
    
    // Read file
    let code = fs.readFileSync(filePath, 'utf8')
    const fileDir = path.dirname(filePath)

    // Handle "export * from '...'" (Recursive Flattening)
    // We replace the export statement with the transpiled content of the referenced file,
    // using the SAME scope. This effectively merges exports.
    code = code.replace(/export\s+\*\s+from\s+['"](.*?)['"]/g, (match, importPath) => {
        const resolved = resolvePath(fileDir, importPath)
        return `// Flattened export from ${path.basename(resolved)}\n{\n${processModule(resolved, scopeName)}\n}`
    })

    // Handle "export * as alias from '...'" (Namespace Export)
    code = code.replace(/export\s+\*\s+as\s+(\w+)\s+from\s+['"](.*?)['"]/g, (match, alias, importPath) => {
        const resolved = resolvePath(fileDir, importPath)
        const childScope = alias + '_ns_' + Math.random().toString(36).substr(2, 5)
        
        // Wrap in a block to prevent variable leakage (e.g. const run) from clashing
        let bundled = `const ${childScope} = {};\n{\n`
        bundled += processModule(resolved, childScope)
        bundled += `}\n` 
        // Assign the child scope object to the current scope's alias
        bundled += `${scopeName}.${alias} = ${childScope};\n`
        
        return bundled
    })

    // Handle "import * as Name from '...'" (Variable Assignment)
    // We treat this as an internal bundle dependency if found inside a module (less likely for these simple files, but good for robustness)
    // Actually, usually we only see this in the Entry Point. 
    // If a module imports another module, we should probably bundle it too?
    // For now, let's assume "import * as" is only used for dependencies we want to bundle.
    code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"](.*?)['"]/g, (match, alias, importPath) => {
         const resolved = resolvePath(fileDir, importPath)
         const moduleVarName = alias + '_exports_' + Math.random().toString(36).substr(2, 5) // unique temp var
         
         // Wrap in block too
         let bundledContent = `const ${moduleVarName} = {};\n{\n`
         bundledContent += processModule(resolved, moduleVarName)
         bundledContent += `}\n`
         bundledContent += `const ${alias} = ${moduleVarName};\n`
         
         return bundledContent
    })

    // Transpile the remaining code
    // - Converts "export const x" to "scope.x = x"
    // - Converts "import {x} from 'y'" to "var x = window.x" (default importScope)
    return transpile(code, path.basename(filePath), { scope: scopeName, stripLoadCSS: true })
}

function processBundle(entryFile) {
    let content = fs.readFileSync(entryFile, 'utf8')
    const fileDir = path.dirname(entryFile)

    // The entry file is special. It usually contains:
    // import * as X from ...
    // Object.assign(...)
    // export { X }
    
    // We want to bundle imports.
    content = content.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"](.*?)['"]/g, (match, alias, importPath) => {
         const resolved = resolvePath(fileDir, importPath)
         const moduleVarName = alias + '_exports'
         
         // Block wrapping here too
         let bundledContent = `const ${moduleVarName} = {};\n{\n`
         bundledContent += processModule(resolved, moduleVarName)
         bundledContent += `}\n`
         bundledContent += `const ${alias} = ${moduleVarName};\n`
         
         return bundledContent
    })

    // We do NOT transpile the entry file's exports with a scope, 
    // because we want the entry file to actually have `export { ... }` statements 
    // for the final bundle module interface.
    // However, we DO want to strip other imports/exports if they are just re-exports that we already handled?
    // The entry files in build/modules are clean: imports + assigns + final export.
    // So we assume the `content` (after import replacement) is valid JS.
    // But `transpile` also handles `import.meta` and stripping imports.
    // We should run a "light" transpile or manual cleanup on entry file?
    
    // Fix: The entry file might use `import { x }` ?? No, checking files showed `import *`.
    // Valid entry file code after helper function replacement:
    /*
      const ltng_framework_exports = {};
      ... bundled content ...
      const ltng_framework = ltng_framework_exports;
      Object.assign(window, ltng_framework)
      export { ltng_framework }
    */
    // This is valid ESM.
    
    // Warning: `processModule` calls `transpile`.
    // We need to ensure specific identifiers in entry file (like `ltng_framework`) match.
    // It seems fine.
    
    return minify(content)
}

async function build() {
    console.log('Starting minification process...')
    
    for (const entryFile of entryPoints) {
        const fullPath = path.join(MODULES_DIR, entryFile)
        if (!fs.existsSync(fullPath)) {
            console.warn(`Entry point not found: ${fullPath}`)
            continue
        }
        
        console.log(`Building ${entryFile}...`)
        
        // Reset processed check if we wanted to unique-ify per bundle, 
        // but recursion handles scope so duplication is just code bloat, safe effectively.
        // Actually duplicates might break 'const x' redeclaration?
        // Yes. But we are bundling strictly tree-like structures mostly.
        
        try {
            let bundled = processBundle(fullPath)
            const outputName = entryFile.replace('.js', '.min.js')
            if (entryFile === 'exports.js') {
                bundled += `\nwindow.loadCSS(new URL('./ltng-framework-all.esbuild.min.css', import.meta.url).href);`
            }

            fs.writeFileSync(path.join(OUTPUT_DIR, outputName), bundled)
            console.log(`Created ${path.join('build', outputName)} (${bundled.length} bytes)`)
        } catch (e) {
            console.error(`Failed to build ${entryFile}:`, e)
        }
    }
    
    console.log('Minification complete.')
}

build().catch(console.error)
