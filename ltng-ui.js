/**
* ltng-framework - A lightweight vanilla JS framework
*/

// UUID v7 Generator
function generateUUIDv7() {
	// 1. Get current timestamp in milliseconds
	const timestamp = Date.now()

	// 2. Generate 16 bytes (128 bits) of random data
	const value = new Uint8Array(16)
	crypto.getRandomValues(value)

	// 3. Encode timestamp into the first 48 bits (6 bytes)
	// High 32 bits
	value[0] = (timestamp >> 40) & 0xff
	value[1] = (timestamp >> 32) & 0xff
	value[2] = (timestamp >> 24) & 0xff
	value[3] = (timestamp >> 16) & 0xff
	// Low 16 bits
	value[4] = (timestamp >> 8) & 0xff
	value[5] = timestamp & 0xff

	// 4. Set Version to 7 (0111) in the 4 high bits of the 7th byte
	value[6] = (value[6] & 0x0f) | 0x70

	// 5. Set Variant to 10xx in the 2 high bits of the 9th byte
	value[8] = (value[8] & 0x3f) | 0x80

	// 6. Convert array to standard UUID string format
	return [...value].map((b, i) => {
		const hex = b.toString(16).padStart(2, '0')
		// Insert hyphens at specific positions
		return (i === 4 || i === 6 || i === 8 || i === 10) ? `-${hex}` : hex
	}).join('')
}

// Expose generateUUIDv7 as well if needed, or keep it internal/global
window.generateUUIDv7 = generateUUIDv7

// CSS Loader Helper
window.loadCSS = (href) => {
	if (!document.querySelector(`link[href="${href}"]`)) {
		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = href
		document.head.appendChild(link)
	}
}

// Global Body Alias and Render Method
Object.defineProperty(window, 'Body', {
	get: () => document.body
})

// Global TextNode Alias
window.TextNode = (text) => document.createTextNode(text)

// Internal hydration flag
let isHydrated = false

HTMLBodyElement.prototype.render = function (...children) {
	// Auto-hydration: Clear the body on the very first render call.
	// This ensures that:
	// 1. On Server: We start with an empty body, render content.
	// 2. On Client: We clear the SSR content (nuke) and re-render with interactivity (pave).
	if (!isHydrated) {
		while (this.firstChild) {
			this.removeChild(this.firstChild)
		}
		isHydrated = true
	}

	render(this, ...children)
}

HTMLElement.prototype.render = function (...children) {
	render(this, ...children)
}

HTMLUnknownElement.prototype.render = function (...children) {
	render(this, ...children)
}

function render(parent, ...children) {
	children.forEach(child => {
		if (typeof child === 'string' || typeof child === 'number') {
			parent.appendChild(TextNode(child))
		} else if (child instanceof Node) {
			parent.appendChild(child)
		} else if (Array.isArray(child)) {
			child.forEach(c => render(parent, c)) // child.forEach(appendChild) old and wrong
		} else if (child === null || child === undefined) {
			// Skip
		} else {
			// Try to stringify unknown objects
			parent.appendChild(TextNode(String(child)))
		}
	})
}

// Core Element Creator
function createElement(tag, props, ...children) {
	const element = document.createElement(tag)

	// Handle props
	if (props) {
		for (const [key, value] of Object.entries(props)) {
			// Handle special cases like 'className' if needed, but requirements say 'class'
			// For event listeners, we might want to support 'onClick' etc., but let's stick to setAttribute for now
			// unless it's a function, then we addEventListener?
			// The requirements example uses setAttribute for everything.
			// However, for standard JS events, it's better to check.
			if (key.startsWith('on') && typeof value === 'function') {
				const eventName = key.substring(2).toLowerCase()
				element.addEventListener(eventName, value)
			} else {
				element.setAttribute(key, value)
			}
		}
	} else {
		// Default props if null/undefined
		element.setAttribute('class', tag.toLowerCase())
		element.setAttribute('id', generateUUIDv7())
	}

	// it can now be simplified with prototype render call
	// children.forEach((child) => render(element, child))
	element.render(children)

	return element
}

// Element Wrappers
// We can define common HTML tags here
const tags = [
	'div', 'span', 'header', 'footer', 'main', 'section', 'article',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'input',
	'label', 'ul', 'ol', 'li', 'img', 'form', 'nav',
	// Form elements
	'select', 'option', 'optgroup', 'textarea', 'fieldset', 'legend',
	// Table elements
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
	// Other common elements
	'strong', 'em', 'b', 'i', 'u', 'code', 'pre', 'blockquote', 'hr', 'br',
	'canvas', 'video', 'audio', 'source', 'iframe', 'object', 'embed',
	'details', 'summary', 'dialog', 'menu', 'menuitem',
	'aside', 'figure', 'figcaption', 'address', 'time', 'mark', 'small'
]

tags.forEach(tagName => {
	window[tagName] = (props, ...children) => {
		return createElement(tagName, props, ...children)
	}
})

// Simple Modal Component
window.overlayModal = (props, content) => {
	const overlay = div({
		...props,
		style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;'
	},
		div({
			style: 'background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); min-width: 300px; display: flex; flex-direction: column; gap: 15px;'
		},
			div({ style: 'font-size: 1.1em; color: #333;' }, content),
			div({ style: 'display: flex; justify-content: flex-end;' },
				button({
					onClick: (e) => {
						// Remove the overlay from the DOM
						const overlayEl = e.target.closest('[style*="position: fixed"]')
						if (overlayEl) overlayEl.remove()
					},
					style: 'padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;'
				}, 'Close')
			)
		)
	)

	Body.render(overlay)
}

// State Management with Selective Subscriptions
window.createStore = (initialState, options = {}) => {
	let state = initialState
	const listeners = new Map() // Map allows storing { callback, keys } with unique Symbol keys
	const persistKey = options.persist

	// Load from localStorage if persist option is set
	if (persistKey) {
		const saved = localStorage.getItem(persistKey)
		if (saved) {
			try {
				state = { ...state, ...JSON.parse(saved) }
			} catch (e) {
				console.error('Failed to parse saved state', e)
			}
		}
	}

	const getState = () => state

	const setState = (partialState) => {
		const prevState = state
		state = { ...state, ...partialState }

		if (persistKey) {
			localStorage.setItem(persistKey, JSON.stringify(state))
		}

		// Get the keys that were actually changed
		const changedKeys = Object.keys(partialState).filter(
			key => prevState[key] !== state[key]
		)

		// Only notify listeners whose watched keys intersect with changed keys
		listeners.forEach(({ callback, keys }) => {
			if (!keys || keys.length === 0 || keys.some(k => changedKeys.includes(k))) {
				callback(state)
			}
		})
	}

	// Enhanced subscribe: pass an array of keys to watch, or omit for all changes
	const subscribe = (listener, keys = null) => {
		const id = Symbol()
		listeners.set(id, { callback: listener, keys })
		// Call listener immediately with current state
		listener(state)
		// Return unsubscribe function
		return () => listeners.delete(id)
	}

	return { getState, setState, subscribe }
}

/**
 * Creates a reactive text node that auto-updates when the specified store key changes.
 * Only works with text-based values (strings, numbers).
 * 
 * @param {Object} store - The store created by createStore()
 * @param {string} key - The state key to watch
 * @returns {Text} A text node that updates automatically
 * 
 * @example
 * // Display count that updates automatically
 * p({ id: "counter" }, "Count: ", reactive(globalStore, 'count'))
 * 
 * // Display user name
 * span({}, "Hello, ", reactive(userStore, 'name'))
 */
window.reactive = (store, key) => {
	const node = document.createTextNode(store.getState()[key])
	
	store.subscribe((state) => {
		node.textContent = state[key]
	}, [key])

	return node
}

/**
 * Creates a reactive element that replaces itself when the specified store key changes.
 * Use for complex values like arrays or objects that need full re-rendering.
 * 
 * @param {Object} store - The store created by createStore()
 * @param {string} key - The state key to watch
 * @param {Function} renderFn - Function that receives the value and returns an element
 * @returns {Element} An element that replaces itself on updates
 * 
 * @example
 * // Reactive list that re-renders when items change
 * reactiveElement(globalStore, 'items', (items) => 
 *     ul({}, ...items.map(item => li({}, item.name)))
 * )
 * 
 * // Reactive user card
 * reactiveElement(userStore, 'user', (user) =>
 *     div({ class: 'card' },
 *         h2({}, user.name),
 *         p({}, user.email)
 *     )
 * )
 */
window.reactiveElement = (store, key, renderFn) => {
	let currentEl = renderFn(store.getState()[key])
	
	store.subscribe((state) => {
		const newEl = renderFn(state[key])
		currentEl.replaceWith(newEl)
		currentEl = newEl
	}, [key])
	
	return currentEl
}

/**
 * Makes an element's attribute reactive to store changes.
 * Returns the element for chaining.
 * 
 * @param {Element} element - The element to modify
 * @param {string} attr - The attribute name to update
 * @param {Object} store - The store created by createStore()
 * @param {string} key - The state key to watch
 * @returns {Element} The same element (for chaining)
 * 
 * @example
 * // Reactive CSS class based on theme
 * reactiveAttr(div({}, "Content"), 'class', themeStore, 'className')
 * 
 * // Reactive disabled state
 * reactiveAttr(button({}, "Submit"), 'disabled', formStore, 'isSubmitting')
 * 
 * // Reactive href
 * reactiveAttr(a({}, "Go"), 'href', navStore, 'currentUrl')
 */
window.reactiveAttr = (element, attr, store, key) => {
	element.setAttribute(attr, store.getState()[key])
	
	store.subscribe((state) => {
		element.setAttribute(attr, state[key])
	}, [key])
	
	return element
}

/**
 * Makes an element's style property reactive to store changes.
 * Returns the element for chaining.
 * 
 * @param {Element} element - The element to modify
 * @param {string} prop - The CSS property name (camelCase, e.g., 'backgroundColor')
 * @param {Object} store - The store created by createStore()
 * @param {string} key - The state key to watch
 * @returns {Element} The same element (for chaining)
 * 
 * @example
 * // Reactive background color
 * reactiveStyle(div({}, "Box"), 'backgroundColor', themeStore, 'bgColor')
 * 
 * // Reactive width
 * reactiveStyle(div({}, "Progress"), 'width', progressStore, 'percentage')
 * 
 * // Reactive visibility
 * reactiveStyle(modal({}), 'display', uiStore, 'modalDisplay')
 */
window.reactiveStyle = (element, prop, store, key) => {
	element.style[prop] = store.getState()[key]
	
	store.subscribe((state) => {
		element.style[prop] = state[key]
	}, [key])
	
	return element
}
