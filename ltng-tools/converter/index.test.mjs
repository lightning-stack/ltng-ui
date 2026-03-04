import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { run, Group } = ltngTest
import { fileURLToPath } from 'url'

await Group("Object Tests", async () => {
	await import('./objects.test.mjs')
})

await Group("String Tests", async () => {
	await import('./strings.test.mjs')
})

await Group("Style Tests", async () => {
	await import('./style.test.mjs')
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run()
}
