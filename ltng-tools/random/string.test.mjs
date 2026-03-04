import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { Test } = ltngTest
import { generatePass, randomEmail, randomStr, randomStrWithPrefixWithSep } from './string.mjs'

Test("randomStr checks randomness", (t) => {
	const lengths = [1, 5, 10, 15]

	for (let len of lengths) {
		t.Assert(randomStr(len) !== randomStr(len), `Should be different for length ${len}`)
	}
})

Test("randomStr does not generate randomness for length 0", (t) => {
	t.Equal(randomStr(0), randomStr(0), "Should be equal (empty string)")
})

Test("generatePass checks randomness", (t) => {
	t.Assert(generatePass() !== generatePass(), "Should be different")
})

Test("randomEmail checks randomness", (t) => {
	t.Assert(randomEmail() !== randomEmail(), "Should be different")
})

Test("randomStrWithPrefixWithSep checks randomness", (t) => {
	const lengths = [1, 5, 10, 15]

	for (let len of lengths) {
		t.Assert(
			randomStrWithPrefixWithSep(len, "init", "-") !== randomStrWithPrefixWithSep(len, "init", "-"),
			`Should be different for length ${len}`
		)
	}
})

Test("randomStrWithPrefixWithSep does not generate randomness for length 0", (t) => {
	t.Equal(
		randomStrWithPrefixWithSep(0, "init", "-"),
		randomStrWithPrefixWithSep(0, "init", "-"),
		"Should be equal"
	)
})
