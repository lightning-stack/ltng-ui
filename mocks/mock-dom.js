/**
* mock-dom.js
* A lightweight, dependency-free DOM implementation for SSR/SSG.
*/

class Node {
	constructor() {
		this.childNodes = []
	}

	appendChild(child) {
		if (!child) return
		this.childNodes.push(child)
		child.parentNode = this
		return child
	}

	// Stub for remove
	remove() {
		if (this.parentNode) {
			const index = this.parentNode.childNodes.indexOf(this)
			if (index > -1) {
				this.parentNode.childNodes.splice(index, 1)
			}
		}
	}

	replaceWith(newElement) {
		if (this.parentNode) {
			const index = this.parentNode.childNodes.indexOf(this)
			if (index > -1) {
				this.parentNode.childNodes.splice(index, 1, newElement)
				newElement.parentNode = this.parentNode
				this.parentNode = null
			}
		}
	}
}

class TextNode extends Node {
	constructor(text) {
		super()
		this.textContent = text
	}

	toString() {
		return this.textContent
	}
}

class HTMLElement extends Node {
	constructor(tagName) {
		super()
		this.tagName = tagName.toLowerCase()
		this.attributes = {}
		this.style = {}
		this.classList = {
			add: (...classes) => {
				const existing = (this.attributes['class'] || '').split(' ').filter(Boolean)
				this.attributes['class'] = [...new Set([...existing, ...classes])].join(' ')
			}
		}
		this._listeners = {}
	}

	setAttribute(name, value) {
		this.attributes[name] = String(value)
	}

	getAttribute(name) {
		return this.attributes[name]
	}

	addEventListener(type, listener) {
		if (!this._listeners[type]) this._listeners[type] = []
		this._listeners[type].push(listener)
	}

	// Stub for closest
	closest() { return null }

	get textContent() {
		return this.childNodes.map(c => c.textContent || '').join('')
	}

	set textContent(text) {
		this.childNodes = [new TextNode(text)]
	}

	toString() {
		const attrs = Object.entries(this.attributes)
			.map(([key, val]) => ` ${key}="${val}"`)
			.join('')

		const styleStr = Object.entries(this.style)
			.map(([key, val]) => `${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${val}`)
			.join(';')

		const styleAttr = styleStr ? ` style="${styleStr}"` : ''

		// Self-closing tags
		if (['img', 'input', 'br', 'hr', 'meta', 'link'].includes(this.tagName)) {
			return `<${this.tagName}${attrs}${styleAttr} />`
		}

		const childrenHtml = this.childNodes.map(c => c.toString()).join('')
		return `<${this.tagName}${attrs}${styleAttr}>${childrenHtml}</${this.tagName}>`
	}
}

class HTMLBodyElement extends HTMLElement {
	constructor() {
		super('body')
	}
}

class HTMLHeadElement extends HTMLElement {
	constructor() {
		super('head')
	}
}

class HTMLLinkElement extends HTMLElement {
    constructor() {
        super('link')
    }
    
    set href(val) {
        this.setAttribute('href', val)
    }
    get href() {
        return this.getAttribute('href')
    }
    
    set rel(val) {
        this.setAttribute('rel', val)
    }
    get rel() {
        return this.getAttribute('rel')
    }
}

class HTMLUnknownElement extends HTMLElement {
	constructor(tagName) {
		super(tagName)
	}
}

// Mock Document
class Document {
	constructor() {
		this.head = new HTMLHeadElement()
		this.body = new HTMLBodyElement()
	}

	createElement(tagName) {
		if (tagName.toLowerCase() === 'body') return this.body
        if (tagName.toLowerCase() === 'link') return new HTMLLinkElement()
		// For known tags, we could return specific classes, but HTMLElement is fine.
		// For unknown, technically HTMLUnknownElement, but for this mock, HTMLElement is sufficient.
		// However, the framework extends HTMLUnknownElement.prototype, so we need it.
		return new HTMLElement(tagName)
	}

	createTextNode(text) {
		return new TextNode(text)
	}

    querySelector(selector) {
        // Very basic selector support for loadCSS: link[href="..."]
        // We only check head children for now as that's where links go
        if (selector.startsWith('link[href=')) {
            const href = selector.match(/href=["'](.*?)["']/)[1]
            return this.head.childNodes.find(node => node.tagName === 'link' && node.attributes['href'] === href) || null
        }
        return null
    }

    getElementById(id) {
        const find = (node) => {
            if (node.attributes && node.attributes['id'] === id) return node
            if (node.childNodes) {
                for (const child of node.childNodes) {
                    const found = find(child)
                    if (found) return found
                }
            }
            return null
        }
        
        const inBody = find(this.body)
        if (inBody) return inBody
        const inHead = find(this.head)
        return inHead
    }
}

// Mock Window
class Window {
	constructor() {
		this.document = new Document()
		this.console = console
		this.HTMLElement = HTMLElement
		this.HTMLBodyElement = HTMLBodyElement
		this.HTMLUnknownElement = HTMLUnknownElement
		this.Node = Node
		this.TextNode = TextNode // For our framework's alias
		this.localStorage = {
			getItem: () => null,
			setItem: () => { },
			removeItem: () => { },
			clear: () => { }
		}
		this.crypto = {
			getRandomValues: (arr) => {
				// Simple pseudo-random for server
				for (let i = 0; i < arr.length; i++) {
					arr[i] = Math.floor(Math.random() * 256)
				}
				return arr
			}
		}
	}
}

function createWindow() {
	return new Window()
}

module.exports = {
	createWindow,
	HTMLElement,
	HTMLBodyElement,
	HTMLUnknownElement,
	Node,
	TextNode,
    HTMLLinkElement
}
