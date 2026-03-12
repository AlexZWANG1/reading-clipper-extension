# Ralph Loop Overnight Execution Plan

**Date**: 2026-03-13
**Goal**: Code quality improvement, testing, documentation cleanup, architecture summary
**Constraint**: ZERO new features. Only optimize, fix, test, clean, document.

## Prompt (copy below to /ralph-loop)

See the `PROMPT` section at the bottom of this file.

## Phases Overview

| Phase | Iterations | Focus |
|-------|-----------|-------|
| 1 | 1-10 | Safety: security fixes, critical bugs |
| 2 | 11-25 | Backend code quality & consistency |
| 3 | 26-40 | Frontend code quality & component health |
| 4 | 41-60 | Test coverage expansion |
| 5 | 61-75 | Documentation cleanup & consolidation |
| 6 | 76-85 | Redundant file cleanup |
| 7 | 86-95 | Final architecture & feature summary generation |
| 8 | 96-100 | Final verification pass |

## Safety Guardrails

- Every phase MUST end with `npm test` and `vite build` passing
- NEVER modify .env files or database schemas
- NEVER delete files without creating a git commit first
- NEVER change API endpoint URLs or port numbers
- NEVER modify Supabase migration files
- Commit after every logical change with descriptive message
