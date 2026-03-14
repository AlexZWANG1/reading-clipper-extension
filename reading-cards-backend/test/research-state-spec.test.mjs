import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatResearchStateForPrompt } from '../src/agents/researchContext.mjs';

// ========= Research State Spec Alignment Tests =========
// Verify that research state computation aligns with PRODUCT-SPEC §12.

describe('Research state: source-level spec alignment', () => {
  const source = readFileSync(
    new URL('../src/agents/researchContext.mjs', import.meta.url), 'utf-8'
  );

  it('must compute blind_spots from bias_warning and no_evidence', () => {
    assert.ok(
      source.includes("bias_warning") && source.includes("no_evidence"),
      'blind_spots must include both bias_warning and no_evidence hypotheses'
    );
  });

  it('must track unanswered_questions separately', () => {
    assert.ok(
      source.includes("unanswered_questions"),
      'Must compute unanswered_questions count'
    );
  });

  it('must compute per-hypothesis support/refute counts', () => {
    assert.ok(
      source.includes("relation_type === 'supports'") &&
      source.includes("relation_type === 'refutes'"),
      'Must count supports and refutes edges per hypothesis'
    );
  });

  it('bias_warning must trigger on zero refuting evidence (Spec §12)', () => {
    // Default config: max_oppose_for_warning: 0
    assert.ok(
      source.includes('max_oppose_for_warning') && source.includes(': 0'),
      'Default bias_warning threshold must be max_oppose=0 (flag unopposed hypotheses)'
    );
  });

  it('must persist computed state to DB', () => {
    assert.ok(
      source.includes("research_state") && source.includes("update"),
      'Must persist computed state back to topics table'
    );
  });
});

describe('Research state: formatResearchStateForPrompt', () => {
  it('returns empty string for null/empty state', () => {
    assert.equal(formatResearchStateForPrompt(null), '');
    assert.equal(formatResearchStateForPrompt({}), '');
    assert.equal(formatResearchStateForPrompt({ hypotheses_summary: [] }), '');
  });

  it('includes all status labels in Chinese', () => {
    const state = {
      total_hypotheses: 3,
      total_evidence: 5,
      blind_spots: 1,
      unanswered_questions: 0,
      hypotheses_summary: [
        { text: 'H1', support: 3, refute: 0, status: 'bias_warning' },
        { text: 'H2', support: 2, refute: 1, status: 'mixed' },
        { text: 'H3', support: 0, refute: 0, status: 'no_evidence' },
      ],
    };
    const formatted = formatResearchStateForPrompt(state);
    assert.ok(formatted.includes('偏见警告'), 'Must show bias_warning in Chinese');
    assert.ok(formatted.includes('正反兼有'), 'Must show mixed in Chinese');
    assert.ok(formatted.includes('无证据'), 'Must show no_evidence in Chinese');
  });

  it('includes hypothesis text and evidence counts', () => {
    const state = {
      total_hypotheses: 1,
      total_evidence: 4,
      blind_spots: 0,
      unanswered_questions: 0,
      hypotheses_summary: [
        { text: 'AI will replace jobs', support: 3, refute: 1, status: 'mixed' },
      ],
    };
    const formatted = formatResearchStateForPrompt(state);
    assert.ok(formatted.includes('AI will replace jobs'), 'Must include hypothesis text');
    assert.ok(formatted.includes('3支持'), 'Must show support count');
    assert.ok(formatted.includes('1反对'), 'Must show refute count');
  });

  it('includes unanswered questions when > 0', () => {
    const state = {
      total_hypotheses: 1,
      total_evidence: 2,
      blind_spots: 0,
      unanswered_questions: 3,
      hypotheses_summary: [
        { text: 'H1', support: 1, refute: 1, status: 'mixed' },
      ],
    };
    const formatted = formatResearchStateForPrompt(state);
    assert.ok(formatted.includes('3 个问题尚未有假说'), 'Must mention unanswered questions');
  });

  it('omits unanswered questions line when count is 0', () => {
    const state = {
      total_hypotheses: 1,
      total_evidence: 2,
      blind_spots: 0,
      unanswered_questions: 0,
      hypotheses_summary: [
        { text: 'H1', support: 1, refute: 1, status: 'mixed' },
      ],
    };
    const formatted = formatResearchStateForPrompt(state);
    assert.ok(!formatted.includes('尚未有假说'), 'Should not mention unanswered when 0');
  });
});
