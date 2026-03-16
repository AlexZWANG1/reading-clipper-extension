/*
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ========= Snippet Traceability Tests =========
// Verify that create_card performs best-effort raw_snippet verification (Spec §12).

describe('Snippet traceability: source-level guards', () => {
  const source = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('create_card must call verifyRawSnippet when source_url and raw_snippet are provided', () => {
    const createCardSection = source.slice(
      source.indexOf('case "create_card"'),
      source.indexOf('case "list_topics"')
    );
    assert.ok(
      createCardSection.includes('verifyRawSnippet'),
      'create_card must invoke verifyRawSnippet for traceability'
    );
  });

  it('verifyRawSnippet must query materials and chunks tables', () => {
    const verifySection = source.slice(source.indexOf('async function verifyRawSnippet'));
    assert.ok(
      verifySection.includes("from('materials')") && verifySection.includes("from('chunks')"),
      'verifyRawSnippet must query both materials and chunks tables'
    );
  });

  it('snippet verification must be non-blocking (wrapped in try-catch)', () => {
    const createCardSection = source.slice(
      source.indexOf('case "create_card"'),
      source.indexOf('case "list_topics"')
    );
    // The verification call must be inside a try-catch so it doesn't block card creation
    assert.ok(
      createCardSection.includes('try') && createCardSection.includes('verifyRawSnippet'),
      'verifyRawSnippet must be called inside try-catch to not block card creation'
    );
  });

  it('snippet verification returns warning not error', () => {
    const createCardSection = source.slice(
      source.indexOf('case "create_card"'),
      source.indexOf('case "list_topics"')
    );
    assert.ok(
      createCardSection.includes('snippet_warning'),
      'Failed snippet verification must return snippet_warning, not block the card'
    );
  });
});
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Harness V2 raw_snippet traceability', () => {
  const source = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('create_card should always run snippet verification (not gated by source_url)', () => {
    const section = source.slice(
      source.indexOf('case "create_card"'),
      source.indexOf('case "list_topics"')
    );
    assert.ok(section.includes('verifyRawSnippetAgainstKnowledge'));
    assert.ok(!section.includes('args.raw_snippet && args.source_url'));
  });

  it('verification should query chunks first, then materials excerpt', () => {
    const verifySection = source.slice(source.indexOf('async function verifyRawSnippetAgainstKnowledge'));
    assert.ok(verifySection.includes('.from("chunks")'));
    assert.ok(verifySection.includes('.from("materials")'));
    assert.ok(verifySection.includes('.ilike("excerpt"'));
  });

  it('verification should include recent-processing soft warning path', () => {
    const verifySection = source.slice(source.indexOf('async function verifyRawSnippetAgainstKnowledge'));
    assert.ok(verifySection.includes('processingMaterials'));
    assert.ok(verifySection.includes('warning: "raw_snippet 未在已完成分块中找到匹配'));
  });
});
