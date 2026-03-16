import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, TOOL_GROUP_INSTRUCTIONS, MODE_INSTRUCTIONS } from '../src/chat/promptBuilder.mjs';

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
    'role', 'data_model', 'behavior',
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

  it('must tie autonomy to available tools', () => {
    assert.ok(prompt.includes('你可以用的工具'), 'Must mention available tools determine autonomy');
    assert.ok(prompt.includes('系统会自动暂停让用户确认'), 'Must mention system pauses for write ops');
    assert.ok(prompt.includes('草稿系统本身就是安全网'), 'Must mention draft system as safety net');
  });

  it('must encourage proactive analysis in board/cards groups (Progressive Disclosure)', () => {
    const boardPrompt = buildPrompt({ toolGroup: 'board' });
    assert.ok(boardPrompt.includes('主动分析') || boardPrompt.includes('主动提供洞察'),
      'Board prompt must encourage proactive analysis');
  });
});

describe('Prompt: AI Behavior Contract §10.5 — Proactive Analysis vs Passive Mutation', () => {
  // Epistemic standards (including proactive analysis vs mutation) are now conditional — only in board/cards/full
  const prompt = buildPrompt({ toolGroup: 'board' });

  it('must distinguish proactive analysis from data mutation', () => {
    assert.ok(prompt.includes('主动分析') && prompt.includes('征得用户同意'),
      'Prompt must say: proactively analyze yes, but ask before mutating');
  });
});

describe('Prompt: AI Behavior Contract §10.3 — Epistemic Standards (Progressive Disclosure)', () => {
  // Epistemic standards are now in a separate <epistemic_standards> block, only for board/cards/full
  const prompt = buildPrompt({ toolGroup: 'board' });
  const explorePrompt = buildPrompt({ toolGroup: 'explore' });

  it('must distinguish evidence from inference (in board/cards/full)', () => {
    assert.ok(prompt.includes('来源原文') && prompt.includes('推断'),
      'Board prompt must instruct AI to distinguish evidence from inference');
  });

  it('must flag one-sided evidence (bias warning)', () => {
    assert.ok(prompt.includes('偏见'),
      'Board prompt must instruct AI to flag bias when hypothesis has only supporting evidence');
  });

  it('must require raw_snippet from source material', () => {
    assert.ok(prompt.includes('raw_snippet') && prompt.includes('原文摘录'),
      'Board prompt must enforce raw_snippet as exact source quote');
  });

  it('must NOT include epistemic standards in explore mode', () => {
    assert.ok(!explorePrompt.includes('<epistemic_standards>'),
      'Explore prompt should not have epistemic_standards (Progressive Disclosure)');
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

  it('must prohibit unsolicited card creation', () => {
    assert.ok(prompt.includes('绝不用 create_card 存储你自己的分析'),
      'Prompt must prohibit using create_card for AI summaries');
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
  it('chat mode injects read-only constraint inside behavior block', () => {
    const prompt = buildPrompt({ mode: 'chat' });
    assert.ok(prompt.includes('聊天模式'), 'chat mode should mention chat mode');
    assert.ok(prompt.includes('不能创建'), 'chat mode should say cannot create');
  });

  it('agent mode injects confirmation requirement', () => {
    const prompt = buildPrompt({ mode: 'agent' });
    assert.ok(prompt.includes('确认'), 'agent mode should mention confirmation');
  });

  it('auto mode adds no mode text', () => {
    const prompt = buildPrompt({ mode: 'auto' });
    assert.ok(!prompt.includes('当前模式'), 'auto mode should not add mode text');
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
  it('explore group instruction mentions query-only', () => {
    const prompt = buildPrompt({ toolGroup: 'explore' });
    assert.ok(prompt.includes('只能查询和搜索'), 'explore instructions should mention query-only');
  });

  it('board group instruction mentions draft system', () => {
    const prompt = buildPrompt({ toolGroup: 'board' });
    assert.ok(prompt.includes('草稿系统'), 'board instructions should mention draft system');
  });

  it('cards group instruction mentions card creation', () => {
    const prompt = buildPrompt({ toolGroup: 'cards' });
    assert.ok(prompt.includes('创建卡片'), 'cards instructions should mention card creation');
  });
});
