import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { Test } = ltngTest
import {
	kebabToLowerSnakeCase,
	lowerCamelCaseToLowerCaseLowerKebabCase,
} from './strings.mjs'

Test("lowerCamelCaseToLowerCaseLowerKebabCase table tests with object", (t) => {
	const objMatching = {
		enUk: 'en-uk',
		enGb: 'en-gb',
		camelCase: 'camel-case',
	}

	for (let key in objMatching) {
		const str = lowerCamelCaseToLowerCaseLowerKebabCase(key)
		t.Equal(str, objMatching[key], `Should convert ${key} to ${objMatching[key]}`)
	}
})

Test("lowerCamelCaseToLowerCaseLowerKebabCase table tests with list", (t) => {
	const listMatching = [
		['enUk', 'en-uk'],
		['enGb', 'en-gb'],
		['camelCase', 'camel-case'],
	]

	for (let [key, value] of listMatching) {
		const str = lowerCamelCaseToLowerCaseLowerKebabCase(key)
		t.Equal(str, value, `Should convert ${key} to ${value}`)
	}
})

Test("kebabToLowerSnakeCase table tests with object", (t) => {
	const objMatching = {
		'en-UK': 'en_uk',
		'en-GB': 'en_gb',
	}

	for (let key in objMatching) {
		const str = kebabToLowerSnakeCase(key)
		t.Equal(str, objMatching[key], `Should convert ${key} to ${objMatching[key]}`)
	}
})

Test("kebabToLowerSnakeCase table tests with list", (t) => {
	const listMatching = [
		['en-UK', 'en_uk'],
		['en-GB', 'en_gb'],
	]

	for (let [key, value] of listMatching) {
		const str = kebabToLowerSnakeCase(key)
		t.Equal(str, value, `Should convert ${key} to ${value}`)
	}
})
