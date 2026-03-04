import ltngTest from '../../ltng-testingtools/ltng-test.mjs'
const { Test } = ltngTest
import { randomIntFromInterval } from './number.mjs'

Test("randomIntFromInterval checks randomness", (t) => {
	const ranges = [
		[0, 100]
	]

	for (let [min, max] of ranges) {
		t.Assert(randomIntFromInterval(min, max) !== randomIntFromInterval(min, max),
			"Should generate different numbers (flaky if unlucky)")
	}
})
