-- AI Agent Optimization: required schema changes
-- Spec: docs/superpowers/specs/2026-03-15-ai-agent-optimization-spec.md §9

-- 9.1: Add 'conversation_summary' to message_type CHECK constraint
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'tool_calls', 'plan_proposal', 'plan_confirmed', 'step_progress', 'plan_complete', 'error', 'conversation_summary'));

-- 9.2: Add locked_at column for task lock timeout
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
