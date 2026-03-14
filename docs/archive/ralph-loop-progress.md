# Ralph Loop 进度追踪

## 当前状态
- **迭代**: 5 / 20
- **阶段**: 全部 Phase 完成 + Bug Fix Pass
- **开始时间**: 2026-03-14
- **完成承诺**: OVERNIGHT_REVIEW_DONE

## 已完成

### Phase 1: 安全与关键 Bug (commit cbfbf70)
- [x] 移除硬编码 rc-sidecar-2026 fallback (search.mjs, materials.mjs, ingestion.mjs)
- [x] 统一 Supabase client (search.mjs, materials.mjs, highlights.mjs → supabaseAdmin)
- [x] 修复 orchestrator.mjs .catch(() => {}) 静默吞错
- [x] 修复 ingestion.mjs fire-and-forget promise
- [x] SIDECAR_API_KEY 未设置时启动警告

### Phase 2: 后端代码质量 (commit cdf3ce7)
- [x] cards.mjs updateCard 字段白名单验证
- [x] topics.mjs 标题长度验证 (200字符) + 颜色格式验证 (#RRGGBB)
- [x] aiClient.mjs console.log → 条件 LOG_LEVEL=debug
- [x] RSS scheduler 竞态条件已有 schedulerRunning guard — 无需额外修复

### Phase 3: 前端代码质量 (commit cdf3ce7)
- [x] 创建 ErrorBoundary.jsx，包裹 App.jsx 所有路由
- [x] TopicTimeline.jsx 颜色系统统一 → 从 ui-utils.js 导入
- [x] api.js 添加 30s 请求超时 (AbortController)
- [x] api.js 修复 .json().catch(() => ({})) 静默吞错

### Phase 4: 测试补充 (commit cbfbf70)
- [x] validation.test.mjs — 41个测试全部通过
- [x] 输入验证测试：cards, topics, chat, materials, highlights, search

### Phase 5: 架构文档 (commit c8f2145)
- [x] docs/ARCHITECTURE.md — 技术架构教学文档 (38KB)
- [x] docs/CODE-REVIEW-REPORT.md — 代码审查报告 (21KB)
- [x] docs/LEARNING-GUIDE.md — 技术学习指南 (33KB)

### Phase 6: AI Agent Redesign (Spec + Backend Implementation)
- [x] 完整设计规范文档 `docs/superpowers/specs/2026-03-14-ai-agent-redesign-spec.md`
- [x] **Phase 1 — Foundation**: promptBuilder.mjs, toolGroups.mjs, researchContext.mjs, migration 020
- [x] **Phase 1 — Orchestrator refactor**: 移除 monolithic SYSTEM_PROMPT, dynamic prompt + scoped tools + surface context + post-action hooks
- [x] **Phase 2 — Methodology**: 3 preset templates (MECE, First Principles, 5 Whys), methodology routes, server mount
- [x] **Phase 3 — Draft Engine**: draftEngine.mjs, migration 021, propose_board_changes tool, get_board_health tool
- [x] **Phase 3 — Methodology Guards**: toolExecutor enforces Q→H→E hierarchy, edge relation_type validation
- [x] **Phase 3 — API Endpoints**: boards route health/drafts endpoints (GET health, GET drafts, POST commit, POST reject)
- [x] **Testing**: All modules import cleanly, server boots, methodology guards validated, toolGroups inference verified, promptBuilder assembly verified

#### New files created (8):
- `src/chat/promptBuilder.mjs` — Dynamic system prompt assembly
- `src/chat/toolGroups.mjs` — Tool group definitions + inference
- `src/agents/researchContext.mjs` — Research state computation (no AI calls)
- `src/agents/draftEngine.mjs` — Board draft CRUD + $temp_id resolution
- `src/routes/v2/methodology.mjs` — Methodology CRUD API
- `src/config/methodology-templates/{mece,first-principles,5whys}.md` — 3 preset templates
- `supabase/migrations/020_research_methodology.sql` — New tables + columns
- `supabase/migrations/021_board_drafts.sql` — Board drafts table

#### Modified files (5):
- `src/chat/orchestrator.mjs` — Dynamic prompt, scoped tools, surface context, draft handling
- `src/chat/tools.mjs` — +propose_board_changes, +get_board_health
- `src/chat/toolExecutor.mjs` — +methodology guards, +draft case, +health case
- `src/routes/v2/boards.mjs` — +health endpoint, +draft endpoints
- `src/server.mjs` — Mount methodology routes

### Phase 7: AI-Native Integration (Spec + Full-Stack Implementation)
- [x] 完整设计规范文档 `docs/superpowers/specs/2026-03-14-ai-native-integration-spec.md` (16 sections, 2 rounds code review)
- [x] 实现计划 `docs/superpowers/plans/2026-03-14-ai-native-integration.md` (10 tasks, 4 chunks, 2 rounds plan review)
- [x] **Task 1 — Mode Threading**: promptBuilder +MODE_INSTRUCTIONS +UUID prohibition, orchestrator +mode param, chat route +mode extraction
- [x] **Task 2 — Evidence Card IDs**: researchContext +evidence_card_ids per hypothesis in health endpoint
- [x] **Task 3 — Evidence Suggestion**: cards service +findEvidenceSuggestion (CJK bigram matching), cards route integration (both paths), boards route +quick-link endpoint
- [x] **Task 4 — ChatMessage**: react-markdown + remark-gfm installed, ChatMessage.jsx with v9-compatible rendering
- [x] **Task 5 — Store + API**: useSurfaceContext hook, useChatStore +mode/surfaceContext/boardInvalidation, api.js +5 new board functions
- [x] **Task 6 — GlobalChatPanel**: Floating chat on all pages with mode toggle, replaced BoardChatPanel, Layout integration, ChatPage markdown rendering
- [x] **Task 7 — HealthSidebar**: HypothesisBar + HealthSidebar components, ThinkingBoardPage integration
- [x] **Task 8 — Draft Preview**: DraftNode + DraftCommitBar, ReactFlow integration with draftNode type
- [x] **Task 9 — Evidence Toast**: EvidenceSuggestionToast, MaterialReaderPage integration after card save
- [x] **Task 10 — Story Health Badge**: StoryHealthBadge component created (integration deferred — ReaderContent uses dangerouslySetInnerHTML)
- [x] **Testing**: mode-threading 10/10, evidence-suggestion 5/5, validation 29→31/31 (16 validation tests), frontend build 0 errors, server imports OK

#### New files created (12):
- `web-app/src/components/GlobalChatPanel.jsx` — Floating chat panel for all pages
- `web-app/src/components/ChatMessage.jsx` — Markdown-rendered message component
- `web-app/src/components/HealthSidebar.jsx` — Research health sidebar
- `web-app/src/components/HypothesisBar.jsx` — Per-hypothesis evidence balance bar
- `web-app/src/components/DraftNode.jsx` — Custom ReactFlow node for AI drafts
- `web-app/src/components/DraftCommitBar.jsx` — Draft accept/reject bar
- `web-app/src/components/EvidenceSuggestionToast.jsx` — Post-card-save evidence toast
- `web-app/src/components/StoryHealthBadge.jsx` — Inline health annotation
- `web-app/src/hooks/useSurfaceContext.js` — Route-based surface context detection
- `reading-cards-backend/test/mode-threading.test.mjs` — Mode threading tests
- `reading-cards-backend/test/evidence-suggestion.test.mjs` — Evidence suggestion tests
- `docs/superpowers/specs/2026-03-14-ai-native-integration-spec.md` — Complete spec (16 sections)

#### Modified files (12):
- `reading-cards-backend/src/chat/promptBuilder.mjs` — +MODE_INSTRUCTIONS, +UUID prohibition, +output format
- `reading-cards-backend/src/chat/orchestrator.mjs` — +mode param threading
- `reading-cards-backend/src/routes/v2/chat.mjs` — +mode extraction from req.body
- `reading-cards-backend/src/agents/researchContext.mjs` — +evidence_card_ids per hypothesis
- `reading-cards-backend/src/services/supabase/cards.mjs` — +findEvidenceSuggestion()
- `reading-cards-backend/src/routes/v2/cards.mjs` — +evidence suggestion in both capture paths
- `reading-cards-backend/src/routes/v2/boards.mjs` — +quick-link endpoint
- `web-app/src/lib/store.js` — +mode/surfaceContext/boardInvalidation in useChatStore, +pendingActions skip logic
- `web-app/src/lib/api.js` — +surfaceContext/mode in sendMessage, +5 board API functions
- `web-app/src/components/Layout.jsx` — +GlobalChatPanel
- `web-app/src/pages/ThinkingBoardPage.jsx` — -BoardChatPanel, +HealthSidebar, +DraftNode, +DraftCommitBar
- `web-app/src/pages/ChatPage.jsx` — +ChatMessage rendering
- `web-app/src/pages/MaterialReaderPage.jsx` — +EvidenceSuggestionToast

### Phase 8: Bug Fix Pass (UI/UX Review Fixes)
- [x] **CSS Variables**: Added `--bg-elevated`, `--ai-accent-subtle` to light + dark themes
- [x] **Invalid CSS syntax**: Fixed `var(--accent-500/0.3)` → proper CSS vars in ChatPage.jsx (3 instances)
- [x] **ChatMessage links**: `<span>` → `<a>` with `href`, `target="_blank"`, `rel="noopener noreferrer"`
- [x] **EvidenceSuggestionToast**: All hardcoded Tailwind colors → CSS variables, z-index 60
- [x] **DraftNode**: All hardcoded colors → CSS vars, +`onTouchStart` for touch devices
- [x] **DraftCommitBar**: All hardcoded colors → CSS vars (`--success`, `--error-subtle`, `--error`)
- [x] **GlobalChatPanel responsive**: Fixed 400px → `min(400px, calc(100vw - 48px))`, responsive height
- [x] **GlobalChatPanel mode toggle**: Emoji-only → text labels (聊天/代理/自动)
- [x] **Textarea height reset**: Both ChatPage and GlobalChatPanel reset after send
- [x] **MiniMap overlap**: Added `marginBottom: 60px` to avoid chat button overlap
- [x] **MiniMap draft color**: Added purple color for draftNode type
- [x] **handleReview**: Implemented scroll-to-first-draft behavior (was no-op)
- [x] **GlobalChatPanel pendingActions**: Full write confirmation flow (confirm/cancel)
- [x] **GlobalChatPanel new conversation**: Added Trash2 button in header
- [x] **GlobalChatPanel error feedback**: Error bar with auto-dismiss after 5s
- [x] **Store fix**: Skip pushing empty assistant message when pendingActions are returned
- [x] **Spec updated**: Section 4.5 added for write confirmation flow, status → Implemented

## 总计
- **Commits**: 4 (prior phases) + Phase 6 + Phase 7 + Phase 8 (uncommitted)
- **Files created**: 22 new files
- **Files modified**: 30+
- **Tests**: 31/31 passing (mode-threading 10, evidence-suggestion 5, validation 16)
- **Frontend build**: Clean (0 errors, 2366 modules)
- **Server**: All imports OK
- **Completion**: OVERNIGHT_REVIEW_DONE
