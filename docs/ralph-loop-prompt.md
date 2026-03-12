# Ralph Loop Overnight Prompt

Below is the exact prompt to pass to `/ralph-loop`. Copy everything between the `---START---` and `---END---` markers.

---START---

You are performing an overnight code quality improvement loop on the Reading Clipper Extension project. You are NOT implementing new features. You are ONLY optimizing, fixing, testing, cleaning, and documenting.

## ABSOLUTE SAFETY RULES (NEVER VIOLATE)

1. **NEVER delete or modify .env files** — they contain live credentials
2. **NEVER modify any file in supabase/migrations/** — database schema is managed externally
3. **NEVER change API endpoint paths, port numbers, or route signatures** — this breaks the running app
4. **NEVER remove or rename exported functions/components that other files import** — check all imports first
5. **NEVER modify AGENTS.md or CLAUDE.md** — these are project operating rules
6. **NEVER add new npm dependencies** without explicit justification in the commit message
7. **ALWAYS run verification after each logical change:**
   - Backend: `cd reading-cards-backend && npm test`
   - Frontend: `cd web-app && npx vite build`
   - If EITHER fails, IMMEDIATELY revert your last change with `git checkout -- .` and try a different approach
8. **ALWAYS commit after each successful change** with a descriptive message prefixed with the phase name
9. **If you are unsure whether a change is safe, SKIP IT** — conservative is better than breaking
10. **NEVER touch browser-extension/ directory** — it has its own build system

## ITERATION TRACKING

At the start of each iteration, create/update the file `docs/ralph-loop-progress.md` with:
- Current iteration number
- Current phase
- What you plan to do this iteration
- Summary of what was done in previous iterations
- Any issues encountered

## PHASE 1: SECURITY & CRITICAL BUGS (Iterations 1-10)

### 1.1 Hardcoded Credentials Cleanup
- [ ] `reading-cards-backend/src/routes/v2/search.mjs` — Remove hardcoded `'rc-sidecar-2026'` fallback on line ~15. Make it throw if env var missing in production.
- [ ] `reading-cards-backend/src/routes/v2/materials.mjs` — Same hardcoded key removal
- [ ] Search all .mjs files for other hardcoded secrets or fallback credentials

### 1.2 Duplicate Supabase Client Consolidation
- [ ] `routes/v2/search.mjs`, `routes/v2/materials.mjs`, `routes/v2/highlights.mjs` — Replace inline `createClient()` calls with the shared `supabaseAdmin` from config
- [ ] Verify no other route files create their own Supabase client

### 1.3 Fire-and-Forget Promise Fixes
- [ ] `src/services/ingestion.mjs` lines ~81-95 — Add proper error logging for sidecar fetch
- [ ] `src/chat/orchestrator.mjs` lines ~589-591 — Log errors from `generateConversationTitle()` instead of `.catch(() => {})`
- [ ] Search for all `.catch(() => {})` or `.catch(()=>{})` patterns and add proper error logging

### 1.4 Silent Error Swallowing
- [ ] `src/services/supabase/cards.mjs` — Ensure topic lookup failures are properly propagated
- [ ] `src/middleware/auth.mjs` `optionalAuth()` — Log JWT validation failures at debug level

**After Phase 1: Run full test suite + build. Commit with prefix `fix(security):`**

## PHASE 2: BACKEND CODE QUALITY (Iterations 11-25)

### 2.1 Error Response Standardization
- [ ] Audit ALL route handlers in `routes/v2/` for HTTP status code consistency:
  - 400 for client validation errors
  - 401 for auth errors
  - 404 for not found
  - 500 for server errors only
- [ ] Standardize response envelope: always include `{ ok: boolean, data?, error? }`
- [ ] Do NOT change the response shape if frontend code depends on the current format — check `web-app/src/lib/api.js` first

### 2.2 Input Validation
- [ ] Add basic input validation to route handlers that accept user input:
  - `routes/v2/cards.mjs` updateCard — validate allowed fields
  - `routes/v2/topics.mjs` — validate title length, color format
  - `routes/v2/sources.mjs` — validate URL format
  - `routes/v2/chat.mjs` — validate messages array length limit
- [ ] Use simple inline validation (no new dependencies). Pattern:
  ```javascript
  if (!title || typeof title !== 'string' || title.length > 500) {
    return res.status(400).json({ ok: false, error: 'Invalid title' });
  }
  ```

### 2.3 Console.log Cleanup
- [ ] Replace excessive `console.log` in `services/aiClient.mjs` with conditional debug logging
- [ ] Add a simple log level check: `if (process.env.LOG_LEVEL === 'debug')` before verbose logs
- [ ] Keep startup logs in `server.mjs` — those are useful
- [ ] Remove any `console.log` that prints sensitive data (tokens, keys, full request bodies)

### 2.4 RSS Scheduler Race Condition
- [ ] `src/services/rss/scheduler.mjs` — Add proper mutex or timestamp check to prevent overlapping `runTick()` calls
- [ ] `src/services/rss/sync.mjs` — Improve duplicate item detection error handling

### 2.5 Dead Code Removal
- [ ] Remove `reading-cards-backend/test_agent1.mjs` (untracked test file at root)
- [ ] Search for any other orphaned test files or unused utility functions
- [ ] Check for commented-out code blocks and remove them

**After Phase 2: Run full test suite + build. Commit with prefix `refactor(backend):`**

## PHASE 3: FRONTEND CODE QUALITY (Iterations 26-40)

### 3.1 Component Decomposition (CAREFUL — high risk of breakage)
IMPORTANT: Before splitting any component, verify it builds and renders correctly. Only split if you can do it safely.

- [ ] `CardsPage.jsx` (~1007 lines) — Extract `EditCardModal` and `CardItem` to separate files in `src/components/`
- [ ] `ThinkingBoardPage.jsx` (~1270 lines) — Extract board configuration, toolbar, and panel logic to sub-components
- [ ] After EACH extraction: run `npx vite build` to verify no import errors

### 3.2 useEffect Cleanup Fixes
- [ ] Search all .jsx files for `useEffect` without cleanup returns
- [ ] Add cleanup functions for:
  - `setTimeout` → return `() => clearTimeout(timer)`
  - `addEventListener` → return `() => removeEventListener(...)`
  - Fetch calls → use AbortController
- [ ] Fix `CardsPage.jsx` line ~373-376: add cleanup for topic/source fetch
- [ ] Fix `CardsPage.jsx` line ~523: add setTimeout cleanup

### 3.3 Error Boundary Addition
- [ ] Create a reusable `ErrorBoundary.jsx` component in `src/components/`
- [ ] Wrap main page routes in App.jsx with ErrorBoundary
- [ ] Wrap `EmbeddedThinkBoard` lazy import with ErrorBoundary + Suspense

### 3.4 Color System Unification
- [ ] Identify all places where topic colors are defined (TopicsPage.jsx line ~18-25, ui-utils.js TOPIC_COLORS)
- [ ] Consolidate to single source of truth in `ui-utils.js`
- [ ] Update all consumers to use the shared definition

### 3.5 API Layer Improvements
- [ ] `src/lib/api.js` — Add request timeout (30s default) using AbortController
- [ ] Fix `.json().catch(() => ({}))` silent error swallowing — at minimum log the parse error
- [ ] Verify all API methods handle network errors gracefully

**After Phase 3: Run `npx vite build` after EVERY file change. Commit with prefix `refactor(frontend):`**

## PHASE 4: TEST COVERAGE (Iterations 41-60)

### 4.1 Backend Test Infrastructure
- [ ] Ensure `npm test` runs correctly with Node.js built-in test runner
- [ ] Create `test/helpers/` directory with shared test utilities if needed

### 4.2 Backend Route Tests
- [ ] Write tests for critical routes:
  - `test/routes-cards.test.mjs` — CRUD operations mock tests
  - `test/routes-topics.test.mjs` — topic CRUD
  - `test/routes-chat.test.mjs` — chat message handling
- [ ] Test input validation (invalid inputs should return 400)
- [ ] Test error paths (missing auth should return 401)
- [ ] Use the Node.js built-in `node:test` and `node:assert` — NO new dependencies

### 4.3 Backend Service Tests
- [ ] `test/services-ingestion.test.mjs` — test ingestion pipeline logic
- [ ] `test/services-rss-sync.test.mjs` — test RSS sync deduplication
- [ ] `test/services-search.test.mjs` — test search query building

### 4.4 Frontend Build Verification
- [ ] Run `cd web-app && npx vite build` and ensure zero warnings/errors
- [ ] Check for any TypeScript-like errors in JSX files
- [ ] Verify all imports resolve correctly

### 4.5 Existing Test Maintenance
- [ ] Run existing RSS tests and fix any failures
- [ ] Ensure all test files follow consistent patterns

**After Phase 4: Run ALL tests. Every test must pass. Commit with prefix `test:`**

## PHASE 5: DOCUMENTATION CLEANUP (Iterations 61-75)

### 5.1 Port Number Fix
- [ ] `README.md` — Change port 3001 references to 3000
- [ ] `TROUBLESHOOTING.md` — Same fix
- [ ] Verify consistency across ALL documentation files

### 5.2 Documentation Consolidation
- [ ] Merge overlapping Verity docs into one:
  - Read: `VERITY-SUMMARY.md`, `VERITY-COMPLETE.md`, `VERITY-TESTING.md`, `FINAL-REPORT.md`
  - Create: `docs/verity-design-system.md` with consolidated content
  - Delete the 4 original files after consolidation
  - Commit the consolidation as a single commit

### 5.3 README Update
- [ ] Verify README.md accurately reflects current project structure
- [ ] Update the tech stack section if outdated
- [ ] Ensure all setup instructions actually work

### 5.4 QUICK-START and QUICK-REFERENCE
- [ ] Verify `QUICK-START.txt` instructions are accurate
- [ ] Verify `QUICK-REFERENCE.md` commands and ports are correct
- [ ] Fix any outdated information

### 5.5 Code Comments Cleanup
- [ ] Remove TODO comments that have been completed
- [ ] Update misleading comments
- [ ] Do NOT add new comments unless code is genuinely confusing

**After Phase 5: Commit with prefix `docs:`**

## PHASE 6: REDUNDANT FILE CLEANUP (Iterations 76-85)

### 6.1 Identify Redundant Files
- [ ] List all files at project root — identify any that don't belong
- [ ] Check for duplicate documentation
- [ ] Check for leftover test/debug files
- [ ] Check `__pycache__` directories — add to .gitignore if not already

### 6.2 Screenshot and Asset Cleanup
- [ ] Check `screenshots/` directory — are these still referenced?
- [ ] Check `verity-homepage.png` at root — should be in screenshots/ or docs/

### 6.3 .gitignore Audit
- [ ] Ensure `.gitignore` covers: `__pycache__`, `node_modules`, `.env`, `dist/`, `build/`
- [ ] Add any missing patterns

### 6.4 Package.json Cleanup
- [ ] Check for unused dependencies in both package.json files
- [ ] Verify scripts are correct and functional

**After Phase 6: Run full test suite + build. Commit with prefix `chore(cleanup):`**

## PHASE 7: ARCHITECTURE & FEATURE SUMMARY (Iterations 86-95)

### 7.1 Generate Technical Architecture Document
Create `docs/ARCHITECTURE.md` with:
- [ ] System overview diagram (text-based)
- [ ] Component map: backend services, frontend pages, browser extension
- [ ] Data flow: user action → API → Supabase → response
- [ ] Technology stack with versions
- [ ] Directory structure explanation
- [ ] External service integrations (Supabase, OpenAI, Jina Reader, RSS)
- [ ] Authentication flow
- [ ] Deployment architecture

### 7.2 Generate Feature Summary Document
Create `docs/FEATURES.md` with:
- [ ] Complete feature inventory organized by module
- [ ] Feature status (stable/beta/experimental)
- [ ] User-facing features vs internal features
- [ ] API endpoint catalog with methods and descriptions
- [ ] Database table overview (what each table stores)

### 7.3 Generate Improvement Report
Create `docs/IMPROVEMENT-REPORT-2026-03-13.md` with:
- [ ] Summary of all changes made during this loop
- [ ] Issues found and fixed
- [ ] Issues found but skipped (with reasons)
- [ ] Test coverage before and after
- [ ] Remaining technical debt
- [ ] Recommendations for future work

**Commit with prefix `docs(architecture):`**

## PHASE 8: FINAL VERIFICATION (Iterations 96-100)

### 8.1 Full Regression Check
- [ ] `cd reading-cards-backend && npm test` — ALL tests must pass
- [ ] `cd web-app && npx vite build` — ZERO errors
- [ ] `git status` — no untracked files that should be committed
- [ ] `git log --oneline -30` — verify all commits have proper prefixes

### 8.2 Smoke Test
- [ ] Review each modified file to ensure no regressions
- [ ] Verify no sensitive data was accidentally committed
- [ ] Check that .env files are still in .gitignore

### 8.3 Final Progress Update
- [ ] Update `docs/ralph-loop-progress.md` with final status
- [ ] List total iterations completed
- [ ] List total commits made
- [ ] List total files modified

When ALL phases are complete and ALL tests pass, output: <promise>ALL_PHASES_COMPLETE</promise>

---END---

## Launch Command

```bash
/ralph-loop "$(cat docs/ralph-loop-prompt.md | sed -n '/---START---/,/---END---/p' | sed '1d;$d')" --max-iterations 100 --completion-promise "ALL_PHASES_COMPLETE"
```

Or simply copy the content between ---START--- and ---END--- and run:

```bash
/ralph-loop "<paste prompt here>" --max-iterations 100 --completion-promise "ALL_PHASES_COMPLETE"
```
