import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { Test } = ltngTest
import { objStrDasher } from './objects.mjs'

Test("objStrDasher should test case", (t) => {
	const result = objStrDasher({ "testCase": "any-value" })
	t.Equal(JSON.stringify(result), JSON.stringify({ "test-case": "any-value" }), "Should be equal")
})
