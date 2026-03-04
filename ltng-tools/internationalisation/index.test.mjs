import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { Test, run } = ltngTest
import { fileURLToPath } from 'url'
import LTNG_INTL from './index.mjs'

const EN_US = {
	Global: {
		greetings: 'greetings from EN_US',
		greetingsTo: (name) => `Hello, ${name}`,
	},
}

const Dictionaries = {
	en: { ...EN_US },
	en_us: { ...EN_US },
}

Test("Pietroski Internationalisation Library should pass", (t) => {
	const dic = LTNG_INTL.MakeDictionaries(Dictionaries, 'en')
	t.Equal(dic.t().Global.greetings, 'greetings from EN_US', "Should get correct greeting")
})

Test("Pietroski Internationalisation Library should switch locale", (t) => {
	const dic = LTNG_INTL.MakeDictionaries(Dictionaries, 'en')
	dic.setLocale('en-us') // Should convert to en_us
	t.Equal(dic.getLocale(), 'en_us', "Should set locale to en_us (snake case)")
	t.Equal(dic.t().Global.greetings, 'greetings from EN_US', "Should get greeting from new locale")
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await run()
}
