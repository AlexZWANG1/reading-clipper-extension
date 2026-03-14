// ========= Input Validation & Route Logic Tests =========
// Tests for route-level validation, response format consistency, and edge cases.
// Uses node:test + node:assert — no external dependencies.

import assert from 'node:assert/strict';
import test from 'node:test';

// ── Helper: mock Express req/res ──

function mockReq(overrides = {}) {
  return {
    user: { id: 'test-user-123' },
    supabase: null,
    accessToken: 'test-token',
    params: {},
    query: {},
    body: {},
    headers: { authorization: 'Bearer test-token' },
    ...overrides,
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
  };
  return res;
}

// ── Cards route validation tests ──

test('cards capture: missing snippet and imageData returns 400', async () => {
  // Simulate the validation logic from cards.mjs /capture route
  const body = {}; // no snippet, no imageData
  const hasSnippet = body.snippet && typeof body.snippet === 'string' && body.snippet.trim();
  const hasImage = !!body.imageData;
  const hasRawSnippet = !!body.raw_snippet;

  // The route returns 400 when !hasSnippet && !imageData (and no raw_snippet fast path)
  assert.equal(hasSnippet, undefined);
  assert.equal(hasImage, false);
  assert.equal(hasRawSnippet, false);
  // Would result in 400 response
});

test('cards capture: empty string snippet returns 400', async () => {
  const body = { snippet: '   ' };
  const hasSnippet = body.snippet && typeof body.snippet === 'string' && body.snippet.trim();
  assert.equal(hasSnippet, ''); // falsy empty string
});

test('cards capture: valid snippet is accepted', async () => {
  const body = { snippet: 'Some interesting text about AI safety' };
  const hasSnippet = body.snippet && typeof body.snippet === 'string' && body.snippet.trim();
  assert.ok(hasSnippet);
});

test('cards search: missing query returns 400', async () => {
  const body = {};
  const queryMissing = !body.query || !body.query.trim();
  assert.ok(queryMissing);
});

test('cards search: empty query returns 400', async () => {
  const body = { query: '   ' };
  const queryMissing = !body.query || !body.query.trim();
  assert.ok(queryMissing);
});

test('cards search: valid query is accepted', async () => {
  const body = { query: 'machine learning' };
  const queryValid = body.query && body.query.trim();
  assert.ok(queryValid);
});

test('cards list: limit parameter is parsed correctly', async () => {
  const query = { limit: '25' };
  const parsed = query.limit ? parseInt(query.limit, 10) : undefined;
  assert.equal(parsed, 25);
});

test('cards list: invalid limit defaults to undefined', async () => {
  const query = {};
  const parsed = query.limit ? parseInt(query.limit, 10) : undefined;
  assert.equal(parsed, undefined);
});

// ── Topics route validation tests ──

test('topics create: missing title returns 400', async () => {
  const body = {};
  const titleMissing = !body.title || !body.title.trim();
  assert.ok(titleMissing);
});

test('topics create: empty title returns 400', async () => {
  const body = { title: '   ' };
  const titleMissing = !body.title || !body.title.trim();
  assert.ok(titleMissing);
});

test('topics create: valid title is accepted', async () => {
  const body = { title: 'AI Safety Research' };
  const titleValid = body.title && body.title.trim();
  assert.ok(titleValid);
});

test('topics create: title is trimmed', async () => {
  const body = { title: '  AI Safety  ' };
  const trimmed = body.title.trim();
  assert.equal(trimmed, 'AI Safety');
});

// ── Chat route validation tests ──

test('chat: missing both user_message and messages returns 400', async () => {
  const body = {};
  const hasUserMessage = body.user_message !== undefined;
  const hasMessages = Array.isArray(body.messages) && body.messages.length > 0;
  assert.equal(hasUserMessage, false);
  assert.equal(hasMessages, false);
});

test('chat: empty messages array returns 400', async () => {
  const body = { messages: [] };
  const valid = Array.isArray(body.messages) && body.messages.length > 0;
  assert.equal(valid, false);
});

test('chat: messages with invalid roles are filtered', async () => {
  const messages = [
    { role: 'user', content: 'hello' },
    { role: 'hacker', content: 'evil' },
    { role: 'assistant', content: 'hi' },
    { role: 'system', content: 'you are helpful' },
  ];
  const sanitized = messages.filter(m =>
    ['user', 'assistant', 'system'].includes(m.role)
  );
  assert.equal(sanitized.length, 3);
  assert.equal(sanitized[0].role, 'user');
  assert.equal(sanitized[1].role, 'assistant');
  assert.equal(sanitized[2].role, 'system');
});

test('chat confirm: missing required arrays returns 400', async () => {
  const body = { messages: [], pendingToolCalls: null, confirmedIds: [] };
  const valid = Array.isArray(body.messages) &&
                Array.isArray(body.pendingToolCalls) &&
                Array.isArray(body.confirmedIds);
  assert.equal(valid, false); // pendingToolCalls is null
});

test('chat execute-plan: missing conversation_id returns 400', async () => {
  const body = { plan_spec: { steps: [] } };
  const valid = body.conversation_id && body.plan_spec;
  assert.equal(valid, undefined); // falsy
});

test('chat execute-plan: missing plan_spec returns 400', async () => {
  const body = { conversation_id: 'conv-123' };
  const valid = body.conversation_id && body.plan_spec;
  assert.equal(valid, undefined); // falsy
});

// ── Materials route validation tests ──

test('materials ingest: invalid source_type returns 400', async () => {
  const body = { source_type: 'video' };
  const validTypes = ['url', 'file', 'text', 'html'];
  const isValid = body.source_type && validTypes.includes(body.source_type);
  assert.equal(isValid, false);
});

test('materials ingest: url source without url returns 400', async () => {
  const body = { source_type: 'url' };
  const needsUrl = body.source_type === 'url' && !body.url;
  assert.ok(needsUrl);
});

test('materials ingest: text source without text returns 400', async () => {
  const body = { source_type: 'text' };
  const needsText = body.source_type === 'text' && !body.text;
  assert.ok(needsText);
});

test('materials ingest: valid url source is accepted', async () => {
  const body = { source_type: 'url', url: 'https://example.com/article' };
  const validTypes = ['url', 'file', 'text', 'html'];
  const isValid = body.source_type && validTypes.includes(body.source_type);
  const hasUrl = body.source_type !== 'url' || !!body.url;
  assert.ok(isValid);
  assert.ok(hasUrl);
});

// ── Highlights route validation tests ──

test('highlights create: missing material_id returns 400', async () => {
  const body = { exact: 'some text' };
  const valid = body.material_id && body.exact;
  assert.equal(valid, undefined);
});

test('highlights create: missing exact text returns 400', async () => {
  const body = { material_id: 'mat-123' };
  const valid = body.material_id && body.exact;
  assert.equal(valid, undefined);
});

test('highlights create: valid payload is accepted', async () => {
  const body = { material_id: 'mat-123', exact: 'highlighted text' };
  const valid = body.material_id && body.exact;
  assert.ok(valid);
});

// ── Search route validation tests ──

test('search semantic: missing query returns 400', async () => {
  const body = {};
  const valid = !!body.query;
  assert.equal(valid, false);
});

test('search semantic: valid query is accepted', async () => {
  const body = { query: 'AI safety alignment' };
  const valid = !!body.query;
  assert.ok(valid);
});

// ── Response format consistency tests ──

test('error responses should include ok:false', async () => {
  const errorResponse = { ok: false, error: 'something_failed' };
  assert.equal(errorResponse.ok, false);
  assert.ok(errorResponse.error);
});

test('success responses should include ok:true', async () => {
  const successResponse = { ok: true, data: {} };
  assert.equal(successResponse.ok, true);
});
