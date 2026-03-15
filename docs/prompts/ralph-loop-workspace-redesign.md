# Ralph Loop Prompt: Workspace Redesign

执行命令：

```
/ralph-loop "读完 docs/superpowers/specs/2026-03-15-workspace-redesign-design.md（设计规范，16节634行），然后执行这次 Verity 产品全面重设计。参考 docs/PRODUCT-SPEC.md（产品愿景）和 docs/ARCHITECTURE.md（系统架构）。你拥有完全自由度——前端、后端 prompts、API、状态管理、路由、组件都可以改。仔细读现有代码，ultrathink，然后大胆改造。每轮迭代：先检查 git log 看上轮做了什么，决定下一步最有价值的改动，读相关代码，实现，验证（前端 cd web-app && npx vite build，后端 cd reading-cards-backend && node --test test/**/*.test.mjs），commit 带 Spec 引用。做到尽善尽美。当设计规范中描述的工作空间完整实现、构建通过、产品端到端可用时，输出 <promise>WORKSPACE_REDESIGN_COMPLETE</promise>" --max-iterations 100 --completion-promise "WORKSPACE_REDESIGN_COMPLETE"
```
