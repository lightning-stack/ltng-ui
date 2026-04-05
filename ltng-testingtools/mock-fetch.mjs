/**
 * ltng-testing-library (mock-fetch.mjs)
 * Provides a MockFetch class to intercept and mock `globalThis.fetch` calls.
 */

export class MockFetch {
  constructor() {
    this.routes = [];
    this.originalFetch = globalThis.fetch;
    this.enabled = false;
  }
  
  /**
   * Register a route handler.
   * @param {string} method HTTP method (GET, POST, etc.)
   * @param {string|RegExp} routePattern URL pattern to match
   * @param {any|function} responseData Response JSON object or a function returning one
   * @param {number} status HTTP status code
   */
  on(method, routePattern, responseData, status = 200) {
    this.routes.push({
      method: method.toUpperCase(),
      route: routePattern,
      responseData,
      status
    });
  }
  
  /**
   * Clear all registered routes.
   */
  reset() {
    this.routes = [];
  }
  
  /**
   * Enable the mock fetch interceptor.
   */
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    
    globalThis.fetch = async (url, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      
      const match = this.routes.find(r => 
        method === r.method &&
        (typeof r.route === 'string' ? url.includes(r.route) : r.route.test(url))
      );
      
      if (match) {
        let body = match.responseData;
        if (typeof match.responseData === 'function') {
          // Pass the parsed URL and original options to the handler
          body = await match.responseData(url, options);
        }
        
        return {
          ok: match.status >= 200 && match.status < 300,
          status: match.status,
          json: async () => body,
          text: async () => typeof body === 'string' ? body : JSON.stringify(body),
        };
      }
      
      console.warn(`[MockFetch]: Unhandled API call -> ${method} ${url}`);
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: `Not found in mock: ${method} ${url}`, error: 'Not Found' }),
        text: async () => `Not found in mock: ${method} ${url}`
      };
    };
  }
  
  /**
   * Disable the mock fetch interceptor and restore the original fetch.
   */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    globalThis.fetch = this.originalFetch;
  }
}
