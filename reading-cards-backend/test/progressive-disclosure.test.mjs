/*
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/chat/promptBuilder.mjs';

// ── Test: Progressive Disclosure of prompt content ──

// 1. Explore mode gets minimal data_model (~3 lines)
const explorePrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'auto',
});
assert.ok(explorePrompt.includes('<data_model>'), 'explore should have data_model');
assert.ok(!explorePrompt.includes('Thinking Boards — 可视化推理画布'), 'explore should NOT have full board data model');
assert.ok(!explorePrompt.includes('parent_id'), 'explore data_model should not mention parent_id');
assert.ok(explorePrompt.includes('语义搜索'), 'explore data_model should mention semantic search');

// 2. Board mode gets full data_model
const boardPrompt = buildSystemPrompt({
  surfaceContext: { surface: 'board', topicId: 'tid', boardId: 'bid', topicTitle: '测试' },
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'auto',
});
assert.ok(boardPrompt.includes('Thinking Boards — 可视化推理画布'), 'board should have full board data model');
assert.ok(boardPrompt.includes('parent_id'), 'board data_model should mention parent_id');

// 3. Epistemic standards only for board/cards/full
assert.ok(!explorePrompt.includes('<epistemic_standards>'), 'explore should NOT have epistemic_standards');
assert.ok(boardPrompt.includes('<epistemic_standards>'), 'board should have epistemic_standards');
assert.ok(boardPrompt.includes('来源原文'), 'board epistemic standards should mention source text vs inference');

const cardsPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'cards',
  mode: 'auto',
});
assert.ok(cardsPrompt.includes('<epistemic_standards>'), 'cards should have epistemic_standards');

const fullPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'full',
  mode: 'auto',
});
assert.ok(fullPrompt.includes('<epistemic_standards>'), 'full should have epistemic_standards');

const ingestPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'ingest',
  mode: 'auto',
});
assert.ok(!ingestPrompt.includes('<epistemic_standards>'), 'ingest should NOT have epistemic_standards');

// 4. Board ID fallback — when boardId is missing, prompt should suggest list_boards
const noBoardIdPrompt = buildSystemPrompt({
  surfaceContext: { surface: 'board', topicId: 'tid', topicTitle: '测试' },
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'auto',
});
assert.ok(noBoardIdPrompt.includes('list_boards'), 'missing boardId should suggest list_boards');
assert.ok(noBoardIdPrompt.includes('画板 ID 未自动注入'), 'missing boardId should say board ID not auto-injected');

// With boardId present
assert.ok(boardPrompt.includes('画板参数已自动注入'), 'present boardId should say board params auto-injected');
assert.ok(!boardPrompt.includes('请先调用 list_boards'), 'present boardId should not suggest list_boards');

// 5. Prohibitions trimmed — removed code-enforced rules
assert.ok(!boardPrompt.includes('绝不让用户替你做工具层面的事'), 'code-enforced prohibition (CONTEXT_DEFAULTS) should be removed');
assert.ok(!boardPrompt.includes('回复中绝不展示内部 ID（UUID）'), 'code-enforced prohibition (sanitizeReply) should be removed');
// Kept rules still present
assert.ok(boardPrompt.includes('绝不编造数据'), 'core prohibition should still be present');
assert.ok(boardPrompt.includes('产品语义'), 'product semantics guidance should still be present');

// 6. Token savings estimate — explore prompt should be significantly shorter than board prompt
const exploreLen = explorePrompt.length;
const boardLen = boardPrompt.length;
assert.ok(exploreLen < boardLen, `explore (${exploreLen}) should be shorter than board (${boardLen})`);
console.log(`Token savings: explore=${exploreLen} chars, board=${boardLen} chars, delta=${boardLen - exploreLen} chars (~${Math.round((boardLen - exploreLen) * 0.4)} tokens saved)`);

console.log('All progressive disclosure tests passed!');
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/chat/promptBuilder.mjs';

describe('Harness V2 minimal prompt disclosure', () => {
  it('prompt should keep fixed role/context/rules sections', () => {
    const prompt = buildSystemPrompt({ surfaceContext: null, mode: 'auto' });
    assert.ok(prompt.includes('<role>'));
    assert.ok(prompt.includes('<context>'));
    assert.ok(prompt.includes('<rules>'));
  });

  it('prompt should no longer include legacy tool-group tags', () => {
    const prompt = buildSystemPrompt({ surfaceContext: null, mode: 'auto' });
    assert.ok(!prompt.includes('<data_model>'));
    assert.ok(!prompt.includes('<epistemic_standards>'));
    assert.ok(!prompt.includes('<absolute_prohibitions>'));
  });

  it('board context should only expose topic title, not internal ids', () => {
    const prompt = buildSystemPrompt({
      surfaceContext: { surface: 'board', topicTitle: '研究主题', topicId: 'tid', boardId: 'bid' },
      mode: 'auto',
    });
    assert.ok(prompt.includes('研究主题'));
    assert.ok(!prompt.includes('tid'));
    assert.ok(!prompt.includes('bid'));
  });
});
