/*
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/chat/promptBuilder.mjs';

// Test 1: chat mode injects read-only instruction
const chatPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'chat',
});
assert.ok(chatPrompt.includes('聊天'), 'chat mode instruction missing');
assert.ok(chatPrompt.includes('不能创建'), 'chat mode should mention cannot create');

// Test 2: agent mode injects agent instruction
const agentPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'agent',
});
assert.ok(agentPrompt.includes('代理'), 'agent mode instruction missing');

// Test 3: auto mode adds no extra instruction
const autoPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'auto',
});
assert.ok(!autoPrompt.includes('<mode>'), 'auto mode should not have mode tag');

// Test 4: XML structure present
assert.ok(chatPrompt.includes('<role>'), 'should use XML role tag');
assert.ok(chatPrompt.includes('<absolute_prohibitions>'), 'should use XML prohibitions tag');
assert.ok(chatPrompt.includes('<data_model>'), 'should use XML data_model tag');
assert.ok(!chatPrompt.includes('<epistemic_standards>'), 'explore mode should NOT have epistemic_standards');

// Test 5: UUID prohibition present (now in Chinese)
assert.ok(chatPrompt.includes('UUID'), 'UUID prohibition missing in chat');

// Test 6: describeSurface should not contain UUIDs (IDs auto-injected by toolExecutor)
const boardPrompt = buildSystemPrompt({
  surfaceContext: { surface: 'board', topicId: 'some-uuid-123', boardId: 'board-uuid-456', topicTitle: '测试主题' },
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'auto',
});
assert.ok(!boardPrompt.includes('some-uuid-123'), 'surface should not expose topic UUID');
assert.ok(!boardPrompt.includes('board-uuid-456'), 'surface should not expose board UUID');
assert.ok(boardPrompt.includes('自动注入'), 'should tell AI that IDs are auto-injected');
assert.ok(boardPrompt.includes('思维画板') || boardPrompt.includes('画板'), 'board surface should mention board');

console.log('All prompt builder tests passed!');
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/chat/promptBuilder.mjs';

describe('Harness V2 prompt mode threading', () => {
  it('chat mode should include read-only guidance', () => {
    const prompt = buildSystemPrompt({ surfaceContext: null, mode: 'chat' });
    assert.ok(prompt.includes('聊天模式'));
    assert.ok(prompt.includes('不能执行会产生写入的操作'));
  });

  it('agent mode should include confirmation guidance', () => {
    const prompt = buildSystemPrompt({ surfaceContext: null, mode: 'agent' });
    assert.ok(prompt.includes('代理模式'));
    assert.ok(prompt.includes('系统可能要求用户确认'));
  });

  it('context should mention ID auto-injection', () => {
    const prompt = buildSystemPrompt({
      surfaceContext: { surface: 'board', topicTitle: '测试主题', topicId: 'uuid-1', boardId: 'uuid-2' },
      mode: 'auto',
    });
    assert.ok(prompt.includes('自动注入'));
    assert.ok(!prompt.includes('uuid-1'));
    assert.ok(!prompt.includes('uuid-2'));
  });
});
