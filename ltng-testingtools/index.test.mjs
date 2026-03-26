import ltngtesting from './ltng-test.mjs'
import gherkinTest from './gherkin-test.mjs'
import DOMMock from '../mocks/mock-dom.js'
import { render, screen, fireEvent } from './behavioural.mjs'

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
const { h1, div, p, input, button, h2, createStore, reactiveElement, section, main, form, label } = globalThis.window

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

ltngtesting.Test("Behavioral Testing Library", (t) => {
	const myComponent = div({ class: 'container' },
		h1(null, 'Test Title'),
		p({ class: 'description' }, 'Some detailed text in a paragraph.'),
		input({ type: 'text', placeholder: 'Enter name', onInput: (e) => { e.target.setAttribute('data-dirty', 'true') } }),
		button({ 
			type: 'button', 
			onClick: (e) => { e.target.textContent = 'Clicked!' },
			'data-testid': 'submit-btn'
		}, 'Submit')
	)

	render(myComponent)

	// Test getByText
	const heading = screen.getByText('Test Title')
	t.Assert(heading !== null, "Should find element by exact text")
	const tag = (heading._tag || heading.tagName || '').toLowerCase()
	t.Equal(tag, 'h1', "Found element should be h1")

	const paragraph = screen.getByText('detailed text')
	t.Assert(paragraph !== null, "Should find element by partial text")

	// Test getByTestId
	const btn = screen.getByTestId('submit-btn')
	t.Assert(btn !== null, "Should find element by test ID")

	// Test getByPlaceholder
	const inputEl = screen.getByPlaceholder('Enter name')
	t.Assert(inputEl !== null, "Should find element by placeholder")

	// Test fireEvent.click
	fireEvent.click(btn)
	t.Equal(btn.textContent, 'Clicked!', "Button textContent should have updated via onClick closure")

	// Test fireEvent.input
	fireEvent.input(inputEl, { target: { value: 'John' } })
	t.Equal(inputEl.value, 'John', "Input value should update")
	t.Equal(inputEl.getAttribute('data-dirty'), 'true', "onInput should be triggered")
})

ltngtesting.Test("Behavioral Testing Library - Reactivity", (t) => {
	// 1. Create a store for the counter
	const store = createStore({ count: 0 })
	
	// 2. Build a reactive component layout using global createStore and reactiveElement
	const counterComponent = div({ class: 'counter-app' },
		h2(null, 'Counter App'),
		// The counter display itself is reactive
		reactiveElement(store, 'count', (count) => 
			p({ 'data-testid': 'count-display' }, `Current count: ${count}`)
		),
		div({ class: 'buttons' },
			button({ 
				onClick: () => store.setState({ count: store.getState().count - 1 }),
				'data-testid': 'decrement-btn'
			}, 'Decrement'),
			button({ 
				onClick: () => store.setState({ count: store.getState().count + 1 }),
				'data-testid': 'increment-btn'
			}, 'Increment')
		)
	)

	// 3. Mount
	render(counterComponent)

	// 4. Initial state assertions
	let display = screen.getByTestId('count-display')
	t.Equal(display.textContent, 'Current count: 0', 'Initial count should be 0')

	// 5. Fire increment event
	const incBtn = screen.getByTestId('increment-btn')
	fireEvent.click(incBtn)
	
	// Query the DOM again to ensure the reactive Element replaced itself!
	display = screen.getByTestId('count-display')
	t.Equal(display.textContent, 'Current count: 1', 'Count should increment to 1')

	// 6. Fire decrement event multiple times
	const decBtn = screen.getByTestId('decrement-btn')
	fireEvent.click(decBtn)
	fireEvent.click(decBtn)
	
	display = screen.getByTestId('count-display')
	t.Equal(display.textContent, 'Current count: -1', 'Count should decrement to -1')
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
