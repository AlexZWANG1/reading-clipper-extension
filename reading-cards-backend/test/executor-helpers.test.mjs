import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test deepResolveRefs inline (it's a pure function)
function deepResolveRefs(value, stepOutputs) {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    return stepOutputs[value.slice(5)] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(v => deepResolveRefs(v, stepOutputs));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepResolveRefs(v, stepOutputs)])
    );
  }
  return value;
}

// Test safeStringify inline
function safeStringify(obj, maxChars = 3000) {
  const full = JSON.stringify(obj);
  if (full.length <= maxChars) return full;
  if (Array.isArray(obj)) {
    const items = [];
    let len = 2;
    for (const item of obj) {
      const s = JSON.stringify(item);
      if (len + s.length + 1 > maxChars - 50) break;
      items.push(item);
      len += s.length + 1;
    }
    return JSON.stringify(items) + ` ...(共 ${obj.length} 项，已截取前 ${items.length} 项)`;
  }
  if (typeof obj === 'object' && obj !== null) {
    const truncated = {};
    for (const [k, v] of Object.entries(obj)) {
      truncated[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '...' : v;
    }
    return JSON.stringify(truncated).slice(0, maxChars);
  }
  return full.slice(0, maxChars) + '...(已截断)';
}

describe('deepResolveRefs', () => {
  it('should resolve top-level $ref', () => {
    const result = deepResolveRefs('$ref:step_1', { step_1: { data: 'hello' } });
    assert.deepEqual(result, { data: 'hello' });
  });

  it('should resolve nested $ref in objects', () => {
    const input = { query: '$ref:step_1', filters: { source: '$ref:step_2' } };
    const outputs = { step_1: 'AI chips', step_2: 'TechCrunch' };
    const result = deepResolveRefs(input, outputs);
    assert.deepEqual(result, { query: 'AI chips', filters: { source: 'TechCrunch' } });
  });

  it('should resolve $ref in arrays', () => {
    const input = ['$ref:step_1', 'literal', '$ref:step_2'];
    const outputs = { step_1: 'first', step_2: 'second' };
    const result = deepResolveRefs(input, outputs);
    assert.deepEqual(result, ['first', 'literal', 'second']);
  });

  it('should leave unresolved refs as-is', () => {
    const result = deepResolveRefs('$ref:missing', {});
    assert.equal(result, '$ref:missing');
  });
});

describe('safeStringify', () => {
  it('should return full JSON for small objects', () => {
    const obj = { a: 1, b: 'hello' };
    assert.equal(safeStringify(obj), '{"a":1,"b":"hello"}');
  });

  it('should truncate arrays by keeping complete items', () => {
    const arr = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = safeStringify(arr, 200);
    assert.ok(result.includes('共 100 项'), 'should indicate total count');
    // Should be valid JSON prefix (before the truncation note)
    const jsonPart = result.split(' ...(')[0];
    const parsed = JSON.parse(jsonPart);
    assert.ok(Array.isArray(parsed), 'should be a valid JSON array');
  });

  it('should truncate long string values in objects', () => {
    const obj = { content: 'A'.repeat(500) };
    const result = safeStringify(obj, 300);
    assert.ok(result.length <= 300, 'should respect maxChars');
  });
});
