/*
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('conversation ownership guard', () => {
  const source = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url),
    'utf-8'
  );

  it('chatWithConversation should validate conversation ownership before reuse', () => {
    const section = source.slice(
      source.indexOf('export async function chatWithConversation'),
      source.indexOf('async function generateConversationSummary')
    );

    assert.ok(
      section.includes('.eq("id", convId)') &&
      section.includes('.eq("user_id", userId)') &&
      section.includes('.maybeSingle()'),
      'chatWithConversation must verify the provided conversation belongs to current user'
    );
  });

  it('chatWithConversation should persist messages with user-scoped client', () => {
    const section = source.slice(
      source.indexOf('export async function chatWithConversation'),
      source.indexOf('async function generateConversationSummary')
    );

    assert.ok(
      section.includes('const userSb = supabase;'),
      'chatWithConversation should use request-scoped supabase client for conversation writes'
    );
    assert.ok(
      !section.includes('addMessage(adminSb'),
      'chatWithConversation should not write messages via service-role client'
    );
  });

  it('confirmAndExecutePlan should validate conversation ownership', () => {
    const section = source.slice(
      source.indexOf('export async function confirmAndExecutePlan'),
      source.indexOf('/**\n * Cancel a running plan execution.')
    );

    assert.ok(
      section.includes('.eq("id", conversationId)') &&
      section.includes('.eq("user_id", userId)') &&
      section.includes('.maybeSingle()'),
      'confirmAndExecutePlan must verify the conversation belongs to current user'
    );
  });
});
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Harness V2 conversation ownership', () => {
  const source = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url),
    'utf-8'
  );

  it('chatWithConversation should validate ownership via user_id filter', () => {
    const section = source.slice(
      source.indexOf('async function _chatWithConversationInner'),
      source.indexOf('if (!convId)')
    );
    assert.ok(section.includes('.eq("id", convId)'));
    assert.ok(section.includes('.eq("user_id", userId)'));
  });

  it('plan-specific confirmation entry should be removed', () => {
    assert.ok(!source.includes('confirmAndExecutePlan'));
  });
});

