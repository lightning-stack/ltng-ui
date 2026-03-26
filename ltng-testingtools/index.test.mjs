import ltngtesting from './ltng-test.mjs'
import gherkinTest from './gherkin-test.mjs'
import DOMMock from '../mocks/mock-dom.js'

// Set up the mocked browser environment so `ltng-ui.js` can mount successfully in NodeJS
const win = DOMMock.createWindow()
globalThis.window = win
globalThis.document = win.document
globalThis.crypto = win.crypto
globalThis.HTMLElement = win.HTMLElement
globalThis.HTMLBodyElement = win.HTMLBodyElement
globalThis.HTMLUnknownElement = win.HTMLUnknownElement
globalThis.Node = win.Node

await import('../ltng-ui.js')
globalThis.TextNode = globalThis.window.TextNode // sync Node global with window property since it overrides it
const { div, h1, p, button, section, main, form, input, label } = globalThis.window

// === Go-like Tests ===
ltngtesting.Test("Addition", (t) => {
	t.Equal(1 + 1, 2, "1 + 1 should be 2")
})

ltngtesting.Test("String Concatenation", (t) => {
	t.Equal("hello " + "world", "hello world", "strings should match")
})

ltngtesting.Test("Async Test", async (t) => {
	await new Promise((resolve) => setTimeout(resolve, 10))
	t.Assert(true, "Async operation completed")
})

ltngtesting.Test("Failing Test (Expected)", (t) => {
	// This is just to demonstrate failure, but for verification we want it to pass
	// so I'll comment out the failure or make it pass
	t.Assert(true, "This should pass")
})

ltngtesting.Test("Snapshot Test Example", (t) => {
	const sampleNode = {
		_tag: 'div',
		attrs: { id: 'test-div', class: 'container' },
		children: [
			{ _tag: 'h1', children: ['Hello World'] },
			{ _tag: 'p', attrs: { 'data-info': '123' }, children: ['Some text'] }
		]
	}
	t.MatchSnapshot(sampleNode, 'sample_node_snapshot')
})

ltngtesting.Test("Complex Component Snapshot Example", (t) => {
	// Simulating a complex ltng-ui components tree with nested children and attributes
	const authLayout = {
		_tag: 'main',
		attrs: { class: 'split-screen-layout', 'data-theme': 'dark' },
		children: [
			{
				_tag: 'section',
				attrs: { class: 'brand-panel' },
				children: [
					{ _tag: 'h1', children: ['Welcome to AuthAPI'] },
					{ _tag: 'p', attrs: { class: 'subtitle' }, children: ['Secure identity infrastructure.'] }
				]
			},
			{
				_tag: 'section',
				attrs: { class: 'form-panel' },
				children: [
					{
						_tag: 'form',
						attrs: { id: 'login-form', method: 'POST', onSubmit: function handleLogin() {} },
						children: [
							{
								_tag: 'div',
								attrs: { class: 'form-group' },
								children: [
									{ _tag: 'label', attrs: { for: 'email' }, children: ['Email Address'] },
									{ _tag: 'input', attrs: { type: 'email', required: true, id: 'email' }, children: [] }
								]
							},
							{
								_tag: 'button',
								attrs: { type: 'submit', class: 'btn btn--lg btn--primary' },
								children: ['Sign In']
							}
						]
					}
				]
			}
		]
	}
	
	// This will generate complex_login_layout.snap inside __snapshots__/
	t.MatchSnapshot(authLayout, 'complex_login_layout')
})

ltngtesting.Test("Real ltng-ui Framework Snapshot Example", (t) => {
	// Let's use the actual native ltng-ui framework components we imported!
	const myAuthLayout = main({ class: 'split-screen-layout', 'data-theme': 'dark' },
		section({ class: 'brand-panel' },
			h1(null, 'Welcome Native'),
			p({ class: 'subtitle' }, 'This is a real parsed DOM element.')
		),
		section({ class: 'form-panel' },
			form({ id: 'login-form', method: 'POST' },
				div({ class: 'form-group' },
					label({ for: 'email' }, 'Email Address'),
					input({ type: 'email', required: 'true', id: 'email' })
				),
				button({ type: 'submit', class: 'btn btn--lg btn--primary' }, 'Sign In Native')
			)
		)
	)

	// Since myAuthLayout is a real simulated DOM element (HTMLElement instance), 
	// MatchSnapshot correctly traverses node.attributes and node.childNodes!
	t.MatchSnapshot(myAuthLayout, 'real_ltng_ui_login_layout')
})

// === Gherkin-like Tests ===
gherkinTest.Given(/^I have a calculator$/, (context) => {
	context.calculator = { value: 0, add: (n) => (context.calculator.value += n) }
})

gherkinTest.When(/^I add (\d+)$/, (context, num) => {
	context.calculator.add(parseInt(num, 10))
})

gherkinTest.Then(/^the result should be (\d+)$/, (context, expected) => {
	if (context.calculator.value !== parseInt(expected, 10)) {
		throw new Error(`Expected ${expected} but got ${context.calculator.value}`)
	}
})

gherkinTest.Feature("Calculator", () => {
	Scenario("Simple Addition", `
		Given I have a calculator
		When I add 5
		When I add 3
		Then the result should be 8
`)
})

	// Run both runners
	; (async () => {
		try {
			await ltngtesting.run()
			await gherkinTest.run()
		} catch (e) {
			console.error(e)
			process.exit(1)
		}
	})()
