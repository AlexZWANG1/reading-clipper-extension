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
assert.ok(!autoPrompt.includes('聊天'), 'auto mode should not have chat instruction');
assert.ok(!autoPrompt.includes('代理'), 'auto mode should not have agent instruction');

// Test 4: UUID prohibition present in all modes
assert.ok(chatPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in chat');
assert.ok(agentPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in agent');
assert.ok(autoPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in auto');

// Test 5: output format guidance present
assert.ok(chatPrompt.includes('card\'s title as a heading'), 'output format guidance missing');

// Test 6: default mode (undefined) behaves like auto
const defaultPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
});
assert.ok(!defaultPrompt.includes('聊天'), 'default mode should behave like auto');

// Test 7-9: Tool group resolution with mode parameter
import { inferToolGroup } from '../src/chat/toolGroups.mjs';

// Helper that mirrors the actual orchestrator logic
function resolveToolGroup(mode, message, surfaceContext, toolGroupOverride) {
  return toolGroupOverride || (mode === 'chat' ? 'explore' : inferToolGroup(message, surfaceContext));
}

// Even with board keywords, chat mode should force explore
assert.equal(
  resolveToolGroup('chat', '帮我分解这个假说', { surface: 'board' }, null),
  'explore',
  'chat mode should force explore group regardless of keywords'
);

// Agent mode uses inference
assert.equal(
  resolveToolGroup('agent', '帮我分解这个假说', { surface: 'board' }, null),
  'board',
  'agent mode should use keyword/surface inference'
);

// toolGroupOverride always wins over mode
assert.equal(
  resolveToolGroup('chat', '搜索', null, 'full'),
  'full',
  'toolGroupOverride should win over chat mode'
);

// Test 10: computeResearchState exports
import { computeResearchState } from '../src/agents/researchContext.mjs';
assert.equal(typeof computeResearchState, 'function', 'computeResearchState should be a function');

console.log('✅ All mode threading tests passed (10/10)');
