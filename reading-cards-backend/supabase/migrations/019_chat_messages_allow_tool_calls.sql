-- ========= Migration 019: Allow tool_calls chat message type =========

ALTER TABLE chat_messages
DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

ALTER TABLE chat_messages
ADD CONSTRAINT chat_messages_message_type_check
CHECK (
  message_type IN (
    'text',
    'tool_calls',
    'plan_proposal',
    'plan_confirmed',
    'step_progress',
    'plan_complete',
    'error'
  )
);
