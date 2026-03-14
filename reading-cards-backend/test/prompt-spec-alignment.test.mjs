import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, FEW_SHOT_EXAMPLES, TOOL_GROUP_INSTRUCTIONS, MODE_INSTRUCTIONS } from '../src/chat/promptBuilder.mjs';

// ========= Prompt ↔ Spec Alignment Tests =========
// Verify that the system prompt contains all sections required by PRODUCT-SPEC §10.

const DEFAULT_OPTS = {
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'auto',
};

function buildPrompt(overrides = {}) {
  return buildSystemPrompt({ ...DEFAULT_OPTS, ...overrides });
}

describe('Prompt structure: required XML sections', () => {
  const prompt = buildPrompt();

  for (const tag of [
    'role', 'data_model', 'hard_rules', 'autonomy_scaling',
    'epistemic_standards', 'tool_usage_guide', 'available_actions',
    'absolute_prohibitions',
  ]) {
    it(`must contain <${tag}> section`, () => {
      assert.ok(prompt.includes(`<${tag}>`), `Missing <${tag}> section`);
      assert.ok(prompt.includes(`</${tag}>`), `Missing </${tag}> closing tag`);
    });
  }
});

describe('Prompt: AI Behavior Contract §10.1 — Autonomy Scaling', () => {
  const prompt = buildPrompt();

  it('must define autonomy levels from full to user-owned', () => {
    assert.ok(prompt.includes('完全自主'), 'Must mention full autonomy for reading');
    assert.ok(prompt.includes('用户确认'), 'Must require user confirmation for creation');
    assert.ok(prompt.includes('明确批准'), 'Must require explicit approval for deletion');
  });

  it('must encourage proactive analysis as a positive capability', () => {
    assert.ok(prompt.includes('主动分析') || prompt.includes('主动提供洞察'),
      'Prompt must encourage proactive analysis, not just prohibit unauthorized actions');
  });
});

describe('Prompt: AI Behavior Contract §10.5 — Proactive Analysis vs Passive Mutation', () => {
  const prompt = buildPrompt();

  it('must distinguish proactive analysis from data mutation', () => {
    assert.ok(prompt.includes('主动分析') && prompt.includes('征得用户同意'),
      'Prompt must say: proactively analyze yes, but ask before mutating');
  });
});

describe('Prompt: AI Behavior Contract §10.3 — Epistemic Standards', () => {
  const prompt = buildPrompt();

  it('must distinguish evidence from inference', () => {
    assert.ok(prompt.includes('来源原文') && prompt.includes('推断'),
      'Prompt must instruct AI to distinguish evidence from inference');
  });

  it('must flag one-sided evidence (bias warning)', () => {
    assert.ok(prompt.includes('偏见'),
      'Prompt must instruct AI to flag bias when hypothesis has only supporting evidence');
  });

  it('must require raw_snippet from source material', () => {
    assert.ok(prompt.includes('raw_snippet') && prompt.includes('原文摘录'),
      'Prompt must enforce raw_snippet as exact source quote');
  });
});

describe('Prompt: AI Behavior Contract §10.6 — Failure Behavior', () => {
  const prompt = buildPrompt();

  it('must instruct AI to report failures honestly', () => {
    assert.ok(prompt.includes('失败') && prompt.includes('假装'),
      'Prompt must instruct AI to report failures, not pretend success');
  });
});

describe('Prompt: AI Behavior Contract §10.5 — Initiative Limits', () => {
  const prompt = buildPrompt();

  it('must prohibit unsolicited data creation', () => {
    assert.ok(prompt.includes('绝不在用户没有明确要求时创建'),
      'Prompt must prohibit creating data without user request');
  });

  it('must prohibit unsolicited "side effect" operations', () => {
    assert.ok(prompt.includes('附带'),
      'Prompt must prohibit creating cards/nodes as incidental side effects');
  });
});

describe('Prompt: AI Quality §13.5 — Response Style', () => {
  const prompt = buildPrompt();

  it('must instruct action-oriented responses', () => {
    assert.ok(prompt.includes('行动导向'),
      'Prompt must instruct AI to be action-oriented per §13.5');
  });

  it('must instruct same-language responses (§10.4)', () => {
    assert.ok(prompt.includes('与用户相同的语言'),
      'Prompt must instruct AI to respond in same language as user');
  });

  it('must prohibit exposing UUIDs (§10.4)', () => {
    assert.ok(prompt.includes('UUID') && prompt.includes('标题'),
      'Prompt must instruct AI to use titles instead of UUIDs');
  });
});

describe('Prompt: mode instruction injection', () => {
  it('chat mode injects read-only constraint', () => {
    const prompt = buildPrompt({ mode: 'chat' });
    assert.ok(prompt.includes('<mode>'), 'chat mode should inject <mode> tag');
    assert.ok(prompt.includes('不能创建'), 'chat mode should say cannot create');
  });

  it('agent mode injects confirmation requirement', () => {
    const prompt = buildPrompt({ mode: 'agent' });
    assert.ok(prompt.includes('确认'), 'agent mode should mention confirmation');
  });

  it('auto mode adds no mode tag', () => {
    const prompt = buildPrompt({ mode: 'auto' });
    assert.ok(!prompt.includes('<mode>'), 'auto mode should not add mode tag');
  });
});

describe('Prompt: surface context injection', () => {
  it('board surface mentions thinking board', () => {
    const prompt = buildPrompt({ surfaceContext: { surface: 'board' } });
    assert.ok(prompt.includes('思维画板'), 'board surface should mention thinking board');
  });

  it('reader surface mentions reading material', () => {
    const prompt = buildPrompt({ surfaceContext: { surface: 'reader' } });
    assert.ok(prompt.includes('阅读'), 'reader surface should mention reading');
  });

  it('surface context does not leak UUIDs', () => {
    const prompt = buildPrompt({
      surfaceContext: { surface: 'board', topicId: 'abc-123-uuid' },
    });
    assert.ok(!prompt.includes('abc-123-uuid'), 'surface context must not expose UUIDs');
  });
});

describe('Prompt: methodology and research state injection', () => {
  it('includes methodology document when provided', () => {
    const prompt = buildPrompt({
      methodology: { document: 'Use MECE framework for decomposition.' },
    });
    assert.ok(prompt.includes('MECE'), 'methodology document should be included');
    assert.ok(prompt.includes('<user_methodology>'), 'should use methodology XML tag');
  });

  it('includes research state when hypotheses exist', () => {
    const prompt = buildPrompt({
      researchState: {
        total_hypotheses: 2,
        total_evidence: 5,
        blind_spots: 1,
        unanswered_questions: 0,
        hypotheses_summary: [
          { text: 'AI will replace jobs', support: 3, refute: 1, status: 'mixed' },
          { text: 'Regulation will slow AI', support: 1, refute: 0, status: 'bias_warning' },
        ],
      },
    });
    assert.ok(prompt.includes('AI will replace jobs'), 'should include hypothesis text');
    assert.ok(prompt.includes('偏见警告'), 'should show bias warning status');
    assert.ok(prompt.includes('<current_research_state>'), 'should use research state XML tag');
  });

  it('omits research state when no hypotheses', () => {
    const prompt = buildPrompt({
      researchState: { total_hypotheses: 0, hypotheses_summary: [] },
    });
    assert.ok(!prompt.includes('<current_research_state>'), 'should not include empty research state');
  });
});

describe('Prompt: tool group instructions', () => {
  it('explore group instruction mentions read-only', () => {
    const prompt = buildPrompt({ toolGroup: 'explore' });
    assert.ok(prompt.includes('只读'), 'explore instructions should mention read-only');
  });

  it('board group instruction mentions propose changes', () => {
    const prompt = buildPrompt({ toolGroup: 'board' });
    assert.ok(prompt.includes('propose_board_changes'), 'board instructions should mention draft proposal tool');
  });

  it('cards group instruction mentions card creation', () => {
    const prompt = buildPrompt({ toolGroup: 'cards' });
    assert.ok(prompt.includes('创建卡片'), 'cards instructions should mention card creation');
  });
});
