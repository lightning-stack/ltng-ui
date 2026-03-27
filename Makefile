# Main Makefile

################################################################################
# --- Test Targets ---
################################################################################

test-ltng-testingtools:
	bun ltng-testingtools/index.test.mjs

update-snapshots:
	UPDATE_SNAPSHOTS=true bun ltng-testingtools/index.test.mjs

test-ltng-tools:
	bun ltng-tools/index.test.mjs

# Test ltng-tools folders (defaults to all, override with tf="converter random")
tf ?= converter internationalisation random transport transport/http
test-ltng-tools-folder:
	@for folder in $(tf); do \
		echo "=== Testing: $$folder ===" ; \
		bun ltng-tools/$$folder/index.test.mjs || exit 1 ; \
	done

test-all: test-ltng-testingtools test-ltng-tools test-ltng-tools-folder

################################################################################
# Playground
################################################################################

pv ?= 001 # playground_version
port ?= 3000

playground-csr:
	bun scripts/ltng-ui-server.js --src=playground/$(pv) --dist=dist/playground/$(pv) --port=$(port) --mode=csr

playground-ssr:
	bun scripts/ltng-ui-server.js --src=playground/$(pv) --dist=dist/playground/$(pv) --port=$(port) --mode=ssr

playground-ssg:
	bun scripts/ltng-ui-server.js --src=playground/$(pv) --dist=dist/playground/$(pv) --build --mode=ssg
	bun scripts/ltng-ui-server.js --src=playground/$(pv) --dist=dist/playground/$(pv) --port=$(port) --mode=ssg

################################################################################
# Examples
################################################################################

example_name ?= state-control-across-multiple-html-pages

example-csr:
	bun scripts/ltng-ui-server.js --src=examples/$(example_name) --dist=dist/examples/$(example_name) --port=$(port) --mode=csr

example-ssr:
	bun scripts/ltng-ui-server.js --src=examples/$(example_name) --dist=dist/examples/$(example_name) --port=$(port) --mode=ssr

example-ssg:
	bun scripts/ltng-ui-server.js --src=examples/$(example_name) --dist=dist/examples/$(example_name) --build --mode=ssg
	bun scripts/ltng-ui-server.js --src=examples/$(example_name) --dist=dist/examples/$(example_name) --port=$(port) --mode=ssg

minify:
	bun scripts/minifier.js

bundle:
	bun scripts/build-bundle.js

ltng-book:
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --port=$(port) --mode=csr

ltng-book-ssg:
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --build --mode=ssg
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --port=$(port) --mode=ssg

################################################################################
# Bundle / Minify Targets (esbuild)
################################################################################

bundle-ui-server:
	npx esbuild scripts/ltng-ui-server.js --bundle --platform=node --outfile=build/ltng-ui-server.min.js --minify

bundle-ltng-ui:
	npx esbuild ltng-ui.js --bundle --platform=browser --outfile=build/ltng-ui.esbuild.min.js --minify --format=esm

bundle-ltng-components:
	npx esbuild ltng-components/index.mjs --bundle --platform=browser --outfile=build/ltng-components.esbuild.min.js --minify --format=esm

bundle-ltng-testingtools:
	npx -y esbuild ltng-testingtools/index.mjs \
	--bundle --platform=browser \
	--external:node:fs --external:node:path \
	--outfile=build/ltng-testingtools.esbuild.min.js --minify --format=esm

bundle-ltng-tools:
	npx esbuild ltng-tools/index.mjs --bundle --platform=browser --outfile=build/ltng-tools.esbuild.min.js --minify --format=esm

bundle-css:
	node -e "\
	const fs = require('fs'); \
	const path = require('path'); \
	const { execSync } = require('child_process'); \
	const dir = 'ltng-components'; \
	const tmp = 'build/.tmp-bundle.css'; \
	function findCss(d, out) { \
		fs.readdirSync(d, { withFileTypes: true }).forEach(f => { \
			const p = path.join(d, f.name); \
			if (f.isDirectory()) findCss(p, out); \
			else if (f.name.endsWith('.css')) out.push(p); \
		}); \
		return out; \
	} \
	const files = findCss(dir, []); \
	const themeIdx = files.findIndex(f => f.endsWith('theme.css')); \
	if (themeIdx > -1) { const t = files.splice(themeIdx, 1)[0]; files.unshift(t); } \
	fs.writeFileSync(tmp, files.map(f => fs.readFileSync(f, 'utf8')).join('\n')); \
	execSync('npx esbuild ' + tmp + ' --minify --outfile=build/ltng-ui-all.min.css'); \
	fs.unlinkSync(tmp); \
	console.log('CSS bundled + minified: build/ltng-ui-all.min.css (' + files.length + ' files)');"

bundle-all:
	npx esbuild build/modules/exports.js \
	--bundle --platform=browser \
	--external:node:fs --external:node:path \
	--outfile=build/ltng-ui-all.esbuild.min.js --minify --format=esm

bundle-ui: bundle-css bundle-all bundle-ui-server

clean:
	rm -f build/*.min.js build/*.min.css build/.tmp-*
