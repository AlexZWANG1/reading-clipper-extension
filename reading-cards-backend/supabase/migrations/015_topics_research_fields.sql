-- ========= Migration 015: Topics 研究字段增强 =========
-- 为 topics 表添加研究容器需要的元数据字段
-- 所有字段都有默认值，不影响现有数据

-- 研究状态（用于 Workbench 状态展示）
ALTER TABLE topics ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'investigating', 'resolved', 'archived'));

-- 研究背景说明（Topic 的研究上下文描述）
ALTER TABLE topics ADD COLUMN IF NOT EXISTS research_context TEXT;

-- 优先级
ALTER TABLE topics ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
  CHECK (priority IN ('critical', 'normal', 'low'));

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_priority ON topics(priority);

-- 验证
COMMENT ON COLUMN topics.status IS '研究状态: active(进行中), investigating(深入研究), resolved(已解决), archived(已归档)';
COMMENT ON COLUMN topics.research_context IS '研究背景说明，描述为什么研究这个 Topic';
COMMENT ON COLUMN topics.priority IS '优先级: critical(紧急), normal(正常), low(低优先级)';
