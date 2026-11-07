# Technical Debt Backlog

Pre-existing findings surfaced by CodeScene change gates. Entries are deduplicated by path, function, and category. `<module>` denotes a file-level finding without a function span.

- [ ] `packages/core/src/__tests__/file-repository.contract.ts` — `runFileRepositoryContract."returns matchCount:0 and leaves file + history untouched when search is absent"` (Code Duplication, L234) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/file-repository.contract.ts` — `runFileRepositoryContract."returns matchCount:2 and leaves file + history untouched when search is ambiguous"` (Code Duplication, L252) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"retries edit_file with extended search after an ambiguity error"` (Complex Method, cc = 10, L177) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"read_file returns out_of_scope and never calls repo.read"` (Code Duplication, L575) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"write_file returns out_of_scope and never calls repo.write"` (Code Duplication, L587) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"edit_file returns out_of_scope and never calls repo.edit"` (Code Duplication, L601) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"write_file attaches the byte-stable reminder on every canonical path"` (Code Duplication, L1043) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"edit_file attaches the byte-stable reminder on every canonical path"` (Code Duplication, L1056) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"write_file against an archive path returns out_of_scope with no reminder"` (Code Duplication, L1071) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"error variants never carry a reminder field"` (Large Method, LoC = 98 lines, L1130) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `"search_files filters hits from paths denied by canRead"` (Excess Number of Function Arguments, Arguments = 7, L620) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `<module>` (Primitive Obsession, 56% of functions have primitive arguments; file-level finding, no line supplied) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/__tests__/tools.test.ts` — `<module>` (String Heavy Function Arguments, 56% of function arguments are strings; file-level finding, no line supplied) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `<module>` (Overall Code Complexity, file-level finding, no numeric metric or line supplied) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `editFileTool` (Complex Method, cc = 11, L231) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `writeFileTool` (Excess Number of Function Arguments, Arguments = 6, L132) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `editFileTool` (Excess Number of Function Arguments, Arguments = 7, L231) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `<module>` (Primitive Obsession, 52% of functions have primitive arguments; file-level finding, no line supplied) — pre-existing; grazed by task 3.1 · source: cs
- [ ] `packages/core/src/tools.ts` — `<module>` (String Heavy Function Arguments, 52% of function arguments are strings; file-level finding, no line supplied) — pre-existing; grazed by task 3.1 · source: cs

- [ ] `apps/cli/src/index.ts` — `main` (Large Method, LoC = 79 lines, L35) — pre-existing; grazed by task 4 · source: cs
- [ ] `apps/cli/test/quick-replies.test.ts` — `"drops the chip call when the model emits an empty question"` (Code Duplication, L279) — pre-existing; grazed by task 4 · source: cs
- [ ] `apps/cli/test/quick-replies.test.ts` — `"does not render or expose a schema-invalid overlong raw call"` (Code Duplication, L292) — pre-existing; grazed by task 4 · source: cs
- [ ] `apps/cli/test/turn-logger-integration.test.ts` — `"T4.2-AC-09: pruning visibility — after 11 same-file read_file turns, turn-011.json's initialRequest.messages contains the pruner stub"` (Complex Method, cc = 11, L357) — pre-existing; grazed by task 4 · source: cs
- [ ] `apps/cli/test/two-phase-save.test.ts` — `"T4.1-AC-16: same-turn read-then-edit — next turn's pruner stubs the stale read because Phase 2 stamps with turnStartedAt"` (Complex Method, cc = 9, L238) — pre-existing; grazed by task 4 · source: cs
- [ ] `packages/core/src/sessions.ts` — `Session.fromJSON` (Complex Method, cc = 18, L52) — pre-existing; grazed by task 4 · source: cs
- [ ] `packages/core/src/sessions.ts` — `Session.fromJSON:77` (Complex Conditional, 2 complex conditional expressions, L77) — pre-existing; grazed by task 4 · source: cs

- [ ] `packages/core/src/turn-engine.ts` — `consumeStream` (Complex Method, cc = 12, L296) — pre-existing; grazed by task 5 · source: cs

- [ ] `apps/server/src/__tests__/files-route.test.ts` — `"rejects the unsafe path %s with 400 invalid_path before touching the repository"` (Code Duplication, L88) — pre-existing; grazed by task 6.1 · source: cs
- [ ] `apps/server/src/__tests__/files-route.test.ts` — `"rejects the out-of-layout path %s with 403 path_out_of_scope before touching the repository"` (Code Duplication, L109) — pre-existing; grazed by task 6.1 · source: cs
- [ ] `apps/server/src/config.ts` — `readPort:69` (Complex Conditional, 2 complex conditional expressions, L69) — pre-existing; grazed by task 6.1 · source: cs
