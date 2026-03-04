import ltngTest from '../../../ltng-testingtools/ltng-test.mjs'
const { Test } = ltngTest
import { HttpClient, asyncDataParser } from './client.mjs'
import { MapHttpResponseInfo, ExternalServiceCallErr } from './models.mjs'

// Mock fetch
const originalFetch = global.fetch
let mockFetchResponse = null
let mockFetchError = null

// Mock fetch
global.fetch = async (url, options) => {
	if (mockFetchError) {
		throw mockFetchError
	}
	return {
		status: mockFetchResponse.status,
		json: async () => mockFetchResponse.body,
		body: mockFetchResponse.body, // For asyncDataParser check
	}
}
function resetMock() {
	mockFetchResponse = null
	mockFetchError = null
}

Test("HttpClient Get success", async (t) => {
	resetMock()
	const responsePayload = { test: 'this is a test', message: 'hey' }
	mockFetchResponse = { status: 200, body: responsePayload }
	const httpClient = HttpClient({ baseURL: 'http://localhost:30001' })
	const response = await httpClient.Get('/v1/get')
	t.Equal(response.StatusCode, 200, "StatusCode should be 200")
	t.Equal(JSON.stringify(response.Data), JSON.stringify(responsePayload), "Data should match")
	t.Assert(response.Err === null, "Err should be null")
})

Test("HttpClient Get failure", async (t) => {
	resetMock()
	mockFetchResponse = { status: 500, body: null }
	const httpClient = HttpClient({ baseURL: 'http://localhost:30001' })
	const response = await httpClient.Get('/v1/get')
	t.Equal(response.StatusCode, 500, "StatusCode should be 500")
	t.Assert(response.Err !== null, "Err should not be null")
})

Test("HttpClient Post success", async (t) => {
	resetMock()
	const responsePayload = { test: 'this is a test', message: 'hey' }
	mockFetchResponse = { status: 200, body: responsePayload }
	const httpClient = HttpClient({ baseURL: 'http://localhost:30001' })
	const response = await httpClient.Post('/v1/post', { field: 'any-string' })
	t.Equal(response.StatusCode, 200, "StatusCode should be 200")
	t.Equal(JSON.stringify(response.Data), JSON.stringify(responsePayload), "Data should match")
})

Test("MapHttpResponseInfo null response", async (t) => {
	const { MapHttpResponseInfo } = await import('./models.mjs')
	const result = MapHttpResponseInfo(null)
	t.Equal(result.StatusCode, 422, "Should handle null response")
	t.Assert(result.Err !== null, "Should return error for null response")
})

Test("asyncDataParser invalid body", async (t) => {
	const { asyncDataParser } = await import('./client.mjs')
	const response = await asyncDataParser({ body: null, status: 204 })
	t.Equal(response.StatusCode, 204, "Should pass through status code")
	t.Equal(response.Data, null, "Data should be null")
})
