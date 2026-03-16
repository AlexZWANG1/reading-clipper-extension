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
