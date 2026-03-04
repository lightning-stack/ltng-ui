import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { run, Group } = ltngTest
import { fileURLToPath } from 'url'

await Group("Number Tests", async () => {
	await import('./number.test.mjs')
})

await Group("String Tests", async () => {
	await import('./string.test.mjs')
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run()
}
