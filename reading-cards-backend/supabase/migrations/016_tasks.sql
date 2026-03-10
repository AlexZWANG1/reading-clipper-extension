-- ========= Migration 016: Research Agent Tasks =========

-- 1. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id        UUID REFERENCES topics(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    intent          TEXT NOT NULL,
    task_spec       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    schedule        JSONB DEFAULT '{"type": "manual"}'::jsonb,
    is_running      BOOLEAN DEFAULT false,
    running_run_id  UUID,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    run_count       INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_next_run ON tasks(next_run_at) WHERE status = 'active';

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (auth.uid() = user_id);

-- 2. Task Runs
CREATE TABLE IF NOT EXISTS task_runs (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status        TEXT DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'completed_with_proposals', 'failed')),
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    results       JSONB DEFAULT '{}'::jsonb,
    error         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_runs_task_id ON task_runs(task_id);
CREATE INDEX idx_task_runs_user_id ON task_runs(user_id);

ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_runs_select" ON task_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "task_runs_insert" ON task_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "task_runs_update" ON task_runs FOR UPDATE USING (auth.uid() = user_id);

-- 3. Task Run Steps
CREATE TABLE IF NOT EXISTS task_run_steps (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_id          UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_index      INTEGER NOT NULL,
    phase           TEXT NOT NULL,
    status          TEXT DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
    input_summary   TEXT,
    output_summary  TEXT,
    detail          JSONB DEFAULT '{}'::jsonb,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error           TEXT
);

CREATE INDEX idx_task_run_steps_run_id ON task_run_steps(run_id);

ALTER TABLE task_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "steps_select" ON task_run_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "steps_insert" ON task_run_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "steps_update" ON task_run_steps FOR UPDATE USING (auth.uid() = user_id);

-- 4. Task Proposals
CREATE TABLE IF NOT EXISTS task_proposals (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    run_id          UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
    step_id         UUID REFERENCES task_run_steps(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    proposal_type   TEXT DEFAULT 'single_action'
                    CHECK (proposal_type IN ('single_action', 'patch_bundle')),
    title           TEXT NOT NULL,
    reasoning       TEXT,
    execution_plan  JSONB NOT NULL,
    expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proposals_user_id ON task_proposals(user_id);
CREATE INDEX idx_proposals_task_id ON task_proposals(task_id);
CREATE INDEX idx_proposals_pending ON task_proposals(status) WHERE status = 'pending';

ALTER TABLE task_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_select" ON task_proposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "proposals_insert" ON task_proposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "proposals_update" ON task_proposals FOR UPDATE USING (auth.uid() = user_id);
