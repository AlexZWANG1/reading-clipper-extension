-- ========= Migration 018: Conversations + Plan System Upgrade =========

-- 1. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_select" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conv_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conv_update" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "conv_delete" ON conversations FOR DELETE USING (auth.uid() = user_id);

-- 2. Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT,
    message_type    TEXT DEFAULT 'text'
                    CHECK (message_type IN (
                        'text',
                        'tool_calls',
                        'plan_proposal',
                        'plan_confirmed',
                        'step_progress',
                        'plan_complete',
                        'error'
                    )),
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conv_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_select" ON chat_messages FOR SELECT
    USING (EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id AND user_id = auth.uid()));
CREATE POLICY "msg_insert" ON chat_messages FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE id = conversation_id AND user_id = auth.uid()));

-- 3. Upgrade tasks table for plan system
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_display JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);

-- 4. Upgrade task_run_steps for tool-level tracking
ALTER TABLE task_run_steps ADD COLUMN IF NOT EXISTS tool TEXT;
ALTER TABLE task_run_steps ADD COLUMN IF NOT EXISTS tool_input JSONB;
ALTER TABLE task_run_steps ADD COLUMN IF NOT EXISTS tool_output JSONB;
ALTER TABLE task_run_steps ADD COLUMN IF NOT EXISTS ai_note TEXT;
