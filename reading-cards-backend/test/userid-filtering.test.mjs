import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('userId filtering in toolExecutor', () => {
  const source = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('get_card should pass userId to findCardById', () => {
    // Verify the function call includes userId argument
    assert.ok(
      /findCardById\([^)]*userId/.test(source),
      'findCardById call should include userId argument'
    );
  });

  it('get_board should pass userId to getFullBoard', () => {
    assert.ok(
      /getFullBoard\([^)]*userId/.test(source),
      'getFullBoard call should include userId argument'
    );
  });

  it('get_document should pass userId to getDocument', () => {
    assert.ok(
      /getDocument\([^)]*userId/.test(source),
      'getDocument call should include userId argument'
    );
  });
});
