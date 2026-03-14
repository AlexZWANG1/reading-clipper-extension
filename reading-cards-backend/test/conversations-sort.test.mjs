import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Unit test: verify listMessages returns newest-first order
// We can't call Supabase in unit tests, so we test the contract:
// the function should use { ascending: false } in its query.
// We do this by reading the source and verifying the pattern.

import { readFileSync } from 'node:fs';

describe('listMessages sort direction', () => {
  it('should use ascending: false to get newest messages first', () => {
    const source = readFileSync(
      new URL('../src/services/supabase/conversations.mjs', import.meta.url),
      'utf-8'
    );
    // Find the listMessages function and check sort direction
    const fnMatch = source.match(/function\s+listMessages[\s\S]*?ascending:\s*(true|false)/);
    assert.ok(fnMatch, 'listMessages function should exist with an ascending parameter');
    assert.equal(fnMatch[1], 'false', 'listMessages should use ascending: false to get newest first');
  });
});
