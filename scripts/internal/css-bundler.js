import fs from 'fs'
import path from 'path'

function bundleCss(rootDir, componentsDir, buildDir) {
    console.log('Bundling CSS...');
    const cssFiles = [];

    // Helper to recursively find CSS
    function findCss(dir) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            const res = path.resolve(dir, file.name);
            if (file.isDirectory()) {
                findCss(res);
            } else if (file.name.endsWith('.css')) {
                cssFiles.push(res);
            }
        }
    }
    findCss(componentsDir);

    // Prioritize theme.css to ensure variables are defined first
    const themeIdx = cssFiles.findIndex(f => f.endsWith('theme.css'));
    if (themeIdx > -1) {
        const theme = cssFiles.splice(themeIdx, 1)[0];
        cssFiles.unshift(theme);
    } else {
        console.warn('Warning: theme.css not found in ltng-components.');
    }

    let cssBundleContent = '';
    for (const file of cssFiles) {
        cssBundleContent += fs.readFileSync(file, 'utf8') + '\n';
    }

    const cssBundlePath = path.join(buildDir, 'ltng-framework-all.esbuild.min.css');
    fs.writeFileSync(cssBundlePath, cssBundleContent);
    console.log(`CSS bundled to ${cssBundlePath} (${cssFiles.length} files).`);
}

export {
    bundleCss
}
