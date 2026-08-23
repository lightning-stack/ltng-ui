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

bundle:
	bun scripts/build-bundle.bun.js

ltng-book:
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --port=$(port) --mode=csr

ltng-book-ssg:
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --build --mode=ssg
	bun scripts/ltng-ui-server.js --src=pkg/ltng-book --dist=dist/ltng-book --port=$(port) --mode=ssg

################################################################################
# Bundle / Minify Targets (bun build)
# See scripts/BUN_TOOLCHAIN_PROPOSAL.md — esbuild was removed at cutover.
################################################################################

# --target=bun: the server's SSR mode requires the Bun runtime (Bun.serve,
# HTMLRewriter), and consumers run it with bun anyway.
bundle-ui-server:
	bun build scripts/ltng-ui-server.js --target=bun --outfile=build/ltng-ui-server.min.js --minify

bundle-ltng-ui:
	bun build ltng-ui.js --target=browser --outfile=build/ltng-ui.min.js --minify --format=esm

bundle-ltng-components:
	bun build ltng-components/index.mjs --target=browser --outfile=build/ltng-components.min.js --minify --format=esm

# --target=bun keeps node:fs/node:path external instead of polyfilled
bundle-ltng-testingtools:
	bun build ltng-testingtools/index.mjs \
	--target=bun \
	--outfile=build/ltng-testingtools.min.js --minify --format=esm

bundle-ltng-tools:
	bun build ltng-tools/index.mjs --target=browser --outfile=build/ltng-tools.min.js --minify --format=esm

bundle-css:
	bun scripts/bundle-css.js

bundle-all:
	bun scripts/build-bundle.bun.js

bundle-ui: bundle-css bundle-all bundle-ui-server

bundle-all-ui: bundle-ui bundle-ltng-ui bundle-ltng-components bundle-ltng-testingtools bundle-ltng-tools

################################################################################
# Standalone Binary (bun build --compile)
# Embeds the full server graph (CSR/SSR/SSG, both engines, mock DOM).
# Output lives in build/bin/ (gitignored — binaries are not committed).
################################################################################

compile-ui-server:
	bun build scripts/ltng-ui-server.js --compile --minify --outfile=build/bin/ltng-ui-server

compile-ui-server-linux:
	bun build scripts/ltng-ui-server.js --compile --minify --target=bun-linux-x64 --outfile=build/bin/ltng-ui-server-linux-x64

clean:
	rm -f build/*.min.js build/*.min.css build/.tmp-*
