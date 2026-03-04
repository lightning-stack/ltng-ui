import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { run, Group } = ltngTest
import { fileURLToPath } from 'url'

await Group("HTTP Tests", async () => {
	await import('./http/client.test.mjs')
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run()
}
