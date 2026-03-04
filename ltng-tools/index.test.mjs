import ltngTest from '../ltng-testingtools/ltng-test.mjs'
const { run, Group } = ltngTest

import { fileURLToPath } from 'url'

await Group("Converter Tests", async () => {
	await import('./converter/index.test.mjs')
})

await Group("Random Lib", async () => {
	await import('./random/index.test.mjs')
})

await Group("Internationalisation Lib", async () => {
	await import('./internationalisation/index.test.mjs')
})

await Group("Transport Lib", async () => {
	await import('./transport/index.test.mjs')
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run()
}
