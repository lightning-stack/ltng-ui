/**
 * ltng-testing-library (behavioural.mjs)
 * Provides render(), screen, and fireEvent for behavioral testing of ltng-ui components.
 */

// We need a stable reference to the currently rendered tree
let currentRenderTree = []

export function render(componentOutput) {
  currentRenderTree = Array.isArray(componentOutput) ? componentOutput : [componentOutput]
  return screen
}

// Tree traversal/attribute helpers

function getAttr(node, attrName) {
  if (node.getAttribute) return node.getAttribute(attrName)
  if (node.attrs && node.attrs[attrName] !== undefined) return node.attrs[attrName]
  if (node.attributes) {
    if (typeof node.attributes.length === 'number') {
      for (let i = 0; i < node.attributes.length; i++) {
        if (node.attributes[i].name === attrName) return node.attributes[i].value
      }
    } else {
      return node.attributes[attrName]
    }
  }
  return undefined
}

function walkDocs(nodes, matchFn) {
  if (!nodes) return null
  const queue = Array.isArray(nodes) ? [...nodes] : [nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) continue
    if (matchFn(node)) return node
    let childList = node.childNodes ? Array.from(node.childNodes) : (node.children || [])
    if (childList.length > 0) {
      queue.push(...childList)
    }
  }
  return null
}

function walkDocsAll(nodes, matchFn) {
  const results = []
  if (!nodes) return results
  const queue = Array.isArray(nodes) ? [...nodes] : [nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) continue
    if (matchFn(node)) results.push(node)
    let childList = node.childNodes ? Array.from(node.childNodes) : (node.children || [])
    if (childList.length > 0) {
      queue.push(...childList)
    }
  }
  return results
}

export const screen = {
  getByText: (text) => {
    // Collect all elements containing the direct text child to get the deepest match
    const foundList = walkDocsAll(currentRenderTree, n => {
      if (!n || (!n._tag && !n.tagName)) return false
      
      let childList = n.childNodes ? Array.from(n.childNodes) : (n.children || [])
      
      return childList.some(c => {
         if (typeof c === 'string') return c.includes(text)
         if (c.nodeType === 3 || (!c._tag && !c.tagName && c.textContent !== undefined)) {
           return (c.nodeValue || c.textContent || '').includes(text)
         }
         return false
      })
    })
    
    if (foundList.length === 0) throw new Error(`Unable to find element with text: ${text}`)
    return foundList[foundList.length - 1] // Return deepest (last BFS) match
  },
  
  queryByText: (text) => {
    try { return screen.getByText(text) } catch { return null }
  },

  getById: (id) => {
    const found = walkDocs(currentRenderTree, n => getAttr(n, 'id') === id)
    if (!found) throw new Error(`Unable to find element with id: ${id}`)
    return found
  },

  getByTestId: (testId) => {
    const found = walkDocs(currentRenderTree, n => getAttr(n, 'data-testid') === testId)
    if (!found) throw new Error(`Unable to find element with data-testid: ${testId}`)
    return found
  },

  getByRole: (role) => {
    const found = walkDocs(currentRenderTree, n => {
      if (getAttr(n, 'role') === role) return true
      // Implicit roles
      const tag = (n._tag || n.tagName || '').toLowerCase()
      if (role === 'button' && tag === 'button') return true
      if (role === 'link' && tag === 'a') return true
      if (role === 'main' && tag === 'main') return true
      if (role === 'form' && tag === 'form') return true
      
      const typeAttr = getAttr(n, 'type')
      if (role === 'textbox' && tag === 'input' && (!typeAttr || typeAttr === 'text')) return true
      return false
    })
    if (!found) throw new Error(`Unable to find element with role: ${role}`)
    return found
  },
  
  getByPlaceholder: (placeholderText) => {
    const found = walkDocs(currentRenderTree, n => getAttr(n, 'placeholder') === placeholderText)
    if (!found) throw new Error(`Unable to find element with placeholder text: ${placeholderText}`)
    return found
  }
}

export const fireEvent = {
  click: (node, eventInit = {}) => {
    const e = { target: node, preventDefault: () => {}, ...eventInit }
    if (node.attrs && node.attrs.onClick) node.attrs.onClick(e)
    if (node._listeners && node._listeners.click) {
      node._listeners.click.forEach(fn => fn(e))
    }
  },
  input: (node, eventInit = {}) => {
    if (eventInit.target && eventInit.target.value !== undefined && node) {
      node.value = eventInit.target.value // simulate DOM value property sync
    }
    const e = { preventDefault: () => {}, ...eventInit, target: node }
    if (node.attrs && node.attrs.onInput) node.attrs.onInput(e)
    if (node.attrs && node.attrs.onChange) node.attrs.onChange(e)
    
    if (node._listeners && node._listeners.input) node._listeners.input.forEach(fn => fn(e))
    if (node._listeners && node._listeners.change) node._listeners.change.forEach(fn => fn(e))
  },
  submit: (node, eventInit = {}) => {
    const e = { target: node, preventDefault: () => {}, ...eventInit }
    if (node.attrs && node.attrs.onSubmit) node.attrs.onSubmit(e)
    if (node._listeners && node._listeners.submit) node._listeners.submit.forEach(fn => fn(e))
  }
}
