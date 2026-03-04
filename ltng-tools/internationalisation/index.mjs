import { kebabToLowerSnakeCase } from '../converter/index.mjs'

// MakeDictionaries creates a dictionary for the ltng-internationalization lib.
function MakeDictionaries(dictionaries, defaultLocale) {
	let state = {
		localLocale: defaultLocale,
		internalDictionaries: dictionaries,
		dictionary: dictionaries[defaultLocale],
	}

	return {
		getLocale: () => state.localLocale,
		setLocale: (locale) => {
			let newLocale = kebabToLowerSnakeCase(locale || '')
			if (!locale) {
				newLocale = 'en'
			}
			state.localLocale = newLocale
			state.dictionary = state.internalDictionaries[newLocale]
		},
		t: () => state.dictionary,
		tFrom: (locale) => state.internalDictionaries[locale],
		text: () => state.dictionary,
		textFrom: (locale) => state.internalDictionaries[locale],
	}
}

export { MakeDictionaries }

export default {
	MakeDictionaries
}
