# docs-plan-beta-mvp-cut — Phase-2a plan rewritten as the beta-MVP cut

### Task
Rewrite `docs/work/phase-2a/plan.md` from a single-user dogfooding milestone into the plan for an invite-only hosted beta (Google login, Supabase persistence, web voice, PWA, deployment), after a full open-items review of Phase 1, keppt-ui, and the specs.

### Status
DONE. Docs-only change; no independent review requested or performed. The plan is untracked and uncommitted; `/commit docs-plan-beta-mvp-cut` lands plan + this log together. A spec amendment to `docs/specs/architecture.md` is owed and deliberately not part of this change (see Open Issues).

### Root Cause
The original Phase-2a plan (written 2026-07, never started) targeted "the app replaces the CLI for Lutz": `DEV_USER_ID` stub, local vault, no auth, no hosting, no voice. The next goal is now "5–10 testers within ~3 weeks", which the plan could not deliver — everything a tester needs (login, hosted storage, voice, deployment) sat in its "Explicitly OUT" list. A gap analysis against the specs also found four items no plan had: server-side timezone (a UTC server flips the day at 01:00/02:00 German time, exactly the evening couch scenario), empty-vault first contact (the opener skips empty vaults silently → blank chat for every new tester), mobile stream re-attach (iOS kills the SSE connection on every background), and an LLM reply-language rule (the prompt has none; the tester network is largely non-German). Context: the strategy roadmap had the public web prototype at end of May 2026; the repo's last commit before this session was 2026-07-14.

### Files Modified
- `docs/work/phase-2a/plan.md` (new to git; rewritten) — amendment block, scope, 15-task list; Tasks 2/4/6/7/8 amended; Tasks 9–13 added (Auth, Supabase persistence, Voice, Deploy+PWA, Launch hygiene); old 9/10 → 14/15 DEFERRED with triggers and the endpoints/ACs cut from Tasks 2 and 7; XC-07..09 added; `/dev/ui` references removed; Railway ruled out in Task 12
- `docs/work/phase-2a/task-log/docs-plan-beta-mvp-cut.md` (new) — this log
- `docs/improvements.md` (new) — improvements register, created by the Open-Issues promotion rule

### Files Read (Context Only)
- `docs/work/main/plan.md`, `docs/work/keppt-ui/plan.md`, all `docs/work/{main,keppt-ui}/task-log/*.md` (Open-Issues sections) — Phase-1/UI state and carried-over issues
- `docs/specs/architecture.md` (Build Milestones, Auth, Database Schema, Dev vs Prod, Voice Input Quality, Context-Aware Session Start, MVP Scope), `docs/specs/angular-chat-ui.md` (headers, Deferred Work)
- `packages/core/src/{search,auto-replan,sessions,in-memory-file-repository,edit,system-prompt,request-builder,vault-readiness,local-file-repository,file-repository,turn-log}.ts` — persistence interfaces, `formatToday`, opener empty-vault path, prompt language rules, `fileVersionAt` seam
- `apps/cli/src/{turn-loop,model-provider,index}.ts`, `apps/cli/src/fs-session-store.ts` — `statSync`, env names, session path
- `apps/web/src/app/{app.config.ts,chat/voice-capture.service.ts,mock/mock-chat.service.ts,navigation/app-drawer.html}`, `apps/web/src/app/chat/components/{assistant-content-message,chat-message-list}.html`, `apps/web/angular.json`, `apps/web/package.json` — provider swaps, voice contract, rendering model, PWA absence
- External: `~/projects/keppt/strategy/{roadmap,pre-launch-distribution-plan}.md`; Railway status/history pages, TechCrunch/The Hacker News/BleepingComputer coverage of the 2026-10-21 Railway incident; Fly.io status history

### Key Decisions
— session 2026-10-24

1. **Scope redefinition: dogfooding milestone → invite-only beta.** Goal is testers in ~3 weeks; the three core advantages a tester must experience (capture → files change; no maintenance via the opener; trust via tool rows + readable files) became the triage lens. Everything not serving them was deferred.
2. **Hosted filesystem-per-user rejected; Supabase light instead.** First proposal was `LocalFileRepository` with one subfolder per user on a platform volume (spec even mentions the subfolder mapping). Lutz initially read "local folder" as the tester's machine — cleared up — but the real objections stand: a single-node volume is not a backup, and the code would be throwaway because the spec's prod path is Supabase anyway. Cost difference ≈ 2–3 days.
3. **`sessions` as one JSONB row per user-day, not the spec's `messages` table.** `FsSessionStore` already persists exactly `Session.toJSON()`; pruning and origin markers work on the loaded `Session`; no current feature queries messages individually. Normalization later is a data migration, not a redesign. Recorded as a spec deviation in the plan header.
4. **Auth (Task 9) before persistence (Task 10).** RLS tests need real user JWTs; with the order reversed, Task 10 would need a throwaway `DEV_USER_JWT` mechanism.
5. **Google-only login; OTP code login trigger-gated, not built.** Testers are hand-picked, so "no Google account" is avoidable; one login path = one screen, one error path. The OTP fallback exists because iOS home-screen PWAs have storage separate from Safari and may bounce OAuth/magic-link redirects into Safari — resolved empirically in Task 12's iPhone smoke (per the Phase-1 "empirical validation over speculative hardening" rule), not pre-built. Apple Sign-In is not required for a PWA.
6. **JWT verified locally against Supabase's JWKS (`jose`), superseding the spec's `supabase.auth.getUser(token)` sketch.** Zero auth roundtrips per request; matters on the SSE attach path. HS256 shared-secret fallback for legacy projects.
7. **Invite allowlist as `BETA_ALLOWLIST` env (e-mails), not Supabase's signup toggle and not a `profiles` row.** The toggle fails opaquely on Google's page instead of our "not invited" copy; a `profiles` row needs a `user_id` that does not exist before first login. `profiles` is therefore not created in this plan at all (no consumer).
8. **Session lifetime indefinite (rotating refresh tokens), no forced periodic re-login.** Consumer-app norm; forced re-login would hurt the low-friction thesis. Safety comes from rotation + reuse detection, short access tokens (15–60 min), and the admin sign-out kill switch; inactivity timeout is a Supabase Pro feature, noted for later. The client always reads `getSession()` per request so refresh is silent; F5 never shows the login.
9. **PWA before Capacitor; web STT (`MediaRecorder` → `POST /api/transcribe` → OpenAI) before native STT.** Inverts the spec's MVP/v2 voice order. No App Store cycle; one build; phone use via home-screen install. iOS records `audio/mp4`, accepted by the API.
10. **Image input (2a.5) deferred past launch** although `strategy/roadmap.md` has it "V1 locked". Lutz's call: cool feature, not primary for testers. The roadmap text in the external repo still needs updating (Open Issues).
11. **Tasks 9/10 (history UI, editor) → 14/15 DEFERRED with triggers**; `PUT /api/files` (no consumer without the editor) and `GET /api/sessions` + `/:date` (no consumer without the history UI) moved with them together with their ACs (T2-AC-03/04, T7-AC-01). Nothing was dropped, only re-homed.
12. **Timezone fix shape:** `formatToday(d, timeZone?)` via `Intl.DateTimeFormat("en-CA", { timeZone })`, plumbed through `buildTools`, repository options and engine deps; client sends `X-Timezone`; server runs `TZ=UTC`. Rejected alternative: shifting `now()` — it would corrupt `createdAt`/`turnStartedAt` instants and break the pruner's drift comparison against `fileVersionAt`.
13. **Daily turn cap (`DAILY_TURN_LIMIT`, 429 `turn_limit_reached`) as the only cost brake** for the shared API key; in-memory, resets on restart — a beta brake, not billing. No separate transcription cap: LLM cost dominates, and transcription without a turn is pointless.
14. **`fileVersionAt` and `ensureGtdTaskFiles` re-homed for Supabase** — both sit outside the repository interfaces (CLI `statSync`; per-vault boot). Supabase path: one `updated_at` query per turn into a sync map; readiness once per user per process. Made explicit so the swap is interface-only for everything else.
15. **Edit-race mutex from the Task-2 log is moot on the server:** one in-flight turn per user (409) serializes all writes.
16. **Railway ruled out as hosting target (2026-10-21 security incident: customer env vars possibly decrypted, all users told to rotate secrets, builds paused two days, signups suspended; plus the May-2026 8-hour GCP-suspension outage).** Our server's entire configuration is env vars, so an env-store breach is the worst-case failure for it. Task 12 decides between Fly.io (EU region) and a Hetzner VPS with Docker Compose + Caddy. New rule regardless of platform: dedicated prod API keys with spend caps.
17. **`/dev/ui` references removed** — the keppt-ui Task-6 playground was never built; the plan had referenced it as existing.
18. **Spec amendment deliberately not done in this change** (architecture.md Build Milestones 2a.2/2a.4, Voice Input Quality, `sessions` schema). Recorded in the plan header as owed; kept out to keep this a plan commit. Intended as a separate spec commit before Task 9.
19. **Effort estimate (~18 working days, three weeks) stays in the conversation, not in the plan** — plans here carry scope and acceptance, not calendars.

### Review Focus
- **Behavior claims:** (1) Every acceptance criterion cut from Tasks 2 and 7 is preserved verbatim in Tasks 14/15. (2) Task numbering, cross-references and the "Tasks at a glance" list are consistent (verified by grep, see Test Evidence). (3) The amendment block names every decision and every spec deviation in one place.
- **Plan deviations:** No plan (fix lane).
- **Assumptions / choices:** Supabase asymmetric JWT signing keys / JWKS are available on the project (HS256 fallback documented). The iPhone home-screen PWA can complete the Google redirect (trigger-gated fallback if not). Platform choice (Fly.io vs Hetzner) left to Task 12 start. The `<9000` prompt-size test bound may need adjusting for the language rule (Task 13 says so).
- **Scope notes:** `pnpm-workspace.yaml` (`allowBuilds`, pre-existing uncommitted tooling change) is **not** part of this commit — it belongs with Task 1. A memory note was written outside the repo. The strategy repo (`~/projects/keppt`) was read but not touched.
- **Read next:** `plan.md` amendment block (lines 6–9) for the decision list; Task 6 "Client timezone" paragraph — the only core change that touches CLI behavior defaults; Task 10 "`fileVersionAt` without `statSync`" — the one non-obvious seam in the Supabase swap.

### Test Evidence
Docs-only change; no build or test suite applies.

- Structural check after the rewrite:
  ```
  grep -n "^## Task\|^## Cross" docs/work/phase-2a/plan.md
  ```
  → 15 task headers in numeric order, Cross-Cutting last; 682 lines.
- Cross-reference check:
  ```
  grep -n "Task 9\b\|Task 10\b\|Task 14\|Task 15" docs/work/phase-2a/plan.md
  ```
  → every hit refers to the new numbering (Auth/Supabase/deferred); no stale reference to the old Task 9/10 meaning remained after the Task-15 "Task 2's 403" fix.
- `grep -n "dev/ui"` → only the XC-03 note stating the playground was never built; the three "stays for tests and `/dev/ui`" mentions were removed.
- Code facts cited in the plan were verified by reading the source this session: `formatToday` uses local getters (`packages/core/src/search.ts`), opener `isEmpty` skips (`auto-replan.ts`), no language rule in `system-prompt.ts`, `fileVersionAt` via `statSync` (`apps/cli/src/turn-loop.ts`), `InMemoryFileRepository` 114 lines, `VoiceCaptureService` doc comments prescribe `MediaRecorder` + STT POST, no `MediaRecorder`/manifest/service worker in `apps/web`.
- Railway/Fly facts: status pages and three independent news sources fetched 2026-10-24 (links in the conversation; the plan cites the facts, not the URLs).

### Open Issues
- `pnpm-workspace.yaml` `allowBuilds` block is uncommitted tooling needed by the new server workspace (→ Task 1, commit it there).
- Promoted: `docs/specs/architecture.md` must be amended to this plan — Build Milestones 2a.2 (no separate Supabase checkpoint, JSONB sessions, no migration) and 2a.4 (web STT first), "Voice Input Quality" (web STT is MVP), "Database Schema" `sessions`/`messages` rows, Auth section's `getUser(token)` sketch → local JWKS verification (→ improvements register; intended as one spec commit before Task 9).
- Promoted: `~/projects/keppt/strategy/roadmap.md` still lists image input as "V1 locked" and Phase 4 as the mobile phase; both superseded by this plan (PWA now, image input post-launch) — external repo, Lutz edits (→ improvements register).

### Context for Next Task
- Start with `/start-task 1`. Tasks 1–8 run on the dev path (`REPOSITORY=local`, `AUTH=stub`) against Lutz's vault; nothing in them requires Supabase or Google.
- Task 4 must already add `timeZone?: string` to the engine deps (one field) so Task 6 does not retrofit the engine signature.
- `/dev/ui` does not exist; `MockVaultRepository`/`MockChatService`/`MockVoiceCaptureService` stay for tests only.
- Known sandbox artefact: untracked dotfiles (`.bashrc`, `.zshrc`, `.vscode`, …) appear in `git status` since Phase 1 — never stage them.

### Git State
```
$ git diff --stat
 pnpm-workspace.yaml | 5 +++++
 1 file changed, 5 insertions(+)

$ git status --short   (sandbox dotfiles filtered)
 M pnpm-workspace.yaml
?? docs/work/phase-2a/
?? docs/improvements.md
```

### Sessions
- claude-code 47ef51a7-d427-46e3-97cf-c4d3d9a70dfa (2026-10-24) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/47ef51a7-d427-46e3-97cf-c4d3d9a70dfa.jsonl
