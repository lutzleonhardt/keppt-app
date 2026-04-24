# Plan — Phase 1: CLI ("It works in the terminal")

> Spec: [`docs/specs/architecture.md`](../specs/architecture.md) (Build Milestones → Phase 1) + [`docs/specs/product.md`](../specs/product.md)
> SDK-Recherche: [`docs/specs/vercel-sdk.md`](../specs/vercel-sdk.md)

## Scope

Lokale CLI, die end-to-end gegen das eigene Obsidian Vault als `LocalFileRepository` läuft. Vercel AI SDK mit Claude (Haiku + Sonnet), 5 Tools, System Prompt R1-R13, Session pro Tag, Daily-Note-Lifecycle. **Kein Server, kein Supabase, kein Auth, kein Tier-Check.** Ziel: Die GTD-Prompts und den Tool-Loop unter realen Bedingungen validieren.

## SDK-Fixpunkte (aus der Recherche)

- `ai@^7.0.0-beta.111` + `@ai-sdk/anthropic@^4.0.0-beta.37` (beta — prüfen ob stable-Release existiert, sonst beta akzeptieren)
- Node `>=18`
- Modell-IDs: `claude-haiku-4-5` (MVP-Default), `claude-sonnet-4-6` für Planning/Review
- Agentic Loop: `stopWhen: isStepCount(10)` — **Default ist 1, ohne explizites `stopWhen` gibt es keine Loop**
- Tool-Errors: SDK konvertiert Throws aus `execute` automatisch in `tool-error`-Parts — kein manuelles Wrapping nötig
- Tools: `tool({ description, inputSchema: z..., execute })` mit Zod
- Persistenz: `(await result.response).messages` anhängen an Session-Historie
- Streaming: `fullStream` abonnieren, auf `text`, `tool-call`, `tool-error` reagieren
- Testing: `MockLanguageModelV4` aus `ai/test`
- Prompt-Caching: manuell via `providerOptions.anthropic.cacheControl`
- AbortController für Ctrl+C wird automatisch an Tool-Executes weitergereicht

## Flexibility Clause

> The executing agent may adjust scope and ordering based on more up-to-date context discovered during implementation, as long as each task still satisfies the sizing rules from `/plan`.

## Tasks at a glance

1. Monorepo + FileRepository + LocalFileRepository (read/write/list/search + JSON-History)
2. `edit_file` mit atomarem Search/Replace (Uniqueness-Check + strukturierte Error-Returns)
3. CLI + Vercel AI SDK + Tool Handlers (minimaler Prompt) → **erster echter Konsolen-Lauf**
4. System Prompt R1-R13 + Request Builder + Tool-Result-Pruning + Model Router + Session-Persistenz + Input-Heuristik + Prompt-Caching
5. Daily-Note-Lifecycle (R5) + Clock-Injection
6. End-to-End Acceptance gegen echte Claude API + Vault

---

## Task 1: Monorepo + FileRepository + LocalFileRepository

### Instructions

Saubere Basis: pnpm-Monorepo mit zwei Workspaces. Kein LLM, kein CLI — nur das Fundament, gegen das später alles läuft.

**Setup:**
- pnpm Workspace mit `apps/cli` (leeres Gerüst) und `packages/core`
- TypeScript (`strict: true`), Vitest, ESLint (zz. optional), Prettier
- Node-Engine `>=18` in beiden `package.json`
- `.gitignore`, `.nvmrc`, `README.md` (minimal)

**`packages/core/file-repository.ts` (Interface):**
```ts
interface FileRepository {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: 'active' | 'archive' | 'all'): Promise<SearchResult[]>;
  // edit() kommt in Task 2
}
interface SearchResult { filePath: string; snippet: string; line: number; }
```

**`LocalFileRepository`:**
- Konstruktor nimmt `basePath` (Vault-Root) entgegen — Pfad kommt per Env `VAULT_PATH` aus dem CLI-Entrypoint (Task 3)
- `read`: `fs.readFile` auf `basePath/filePath`; File nicht vorhanden → `FileNotFoundError` (nicht null/empty)
- `write`: `fs.mkdir -p` auf Parent, `fs.writeFile`, danach History-Append (siehe unten)
- `list`: rekursiv unter Vault; optionaler Prefix-Filter auf POSIX-Pfaden
- `search`: einfache String-Suche über Files im passenden Scope. `'active'` = `tasks/**` + `daily/YYYY-MM-DD.md` (heutige, falls vorhanden); `'archive'` = `archive/daily/**`; `'all'` = beides. Liefert Snippet (~80 Zeichen um Treffer) und 1-basierte Zeilennummer. `scope` default `'active'`.

**`InMemoryFileRepository`:** Map<string, string> für Tests, gleiches Interface.

**History-Log (lokaler `file_history`-Ersatz):**
- Append-only JSON Lines unter `basePath/.gtd-companion/file-history.jsonl`
- Eine Zeile pro Write/Edit: `{ id, filePath, contentBefore, contentAfter, changeSummary, changedAt, changedBy: 'llm' | 'user' | 'system' }`
- `contentBefore` ist der vorherige Inhalt (leer bei Create). Das ermöglicht Rollback. Für große Files ist das akzeptabel — Phase 1 ist Single-User, einziges Vault.

**Pfad-Konvention:** Alle File-Pfade sind POSIX-Stil (`tasks/inbox.md`), unabhängig von OS. Intern mit `path.posix` arbeiten.

### Acceptance

- Vitest-Suite in `packages/core` grün:
  - `LocalFileRepository` gegen ein Temp-Verzeichnis: read/write/list/search happy paths + read-on-missing-file wirft definierten Error
  - `InMemoryFileRepository` gegen das gleiche Test-Szenario (dieselben Tests parametrisiert)
  - Write erzeugt einen korrekten History-Eintrag in `.gtd-companion/file-history.jsonl`
  - Search findet Treffer über mehrere Files, respektiert Scope (`active` vs. `archive` vs. `all`)
- `pnpm -r build` grün
- `pnpm -r test` grün

### Key Locations

- `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- `apps/cli/` (leeres Skelett, `package.json` + `src/index.ts` mit `// placeholder`)
- `packages/core/package.json`, `packages/core/tsconfig.json`
- `packages/core/src/file-repository.ts` (Interface)
- `packages/core/src/local-file-repository.ts`
- `packages/core/src/in-memory-file-repository.ts`
- `packages/core/src/history-log.ts`
- `packages/core/src/__tests__/*.test.ts`

### Key Discoveries

- Vault-Layout pro User (siehe Architektur "File-Layout"):
  ```
  tasks/{inbox,focus,next-actions,waiting,someday-maybe}.md
  daily/YYYY-MM-DD.md    ← immer genau eine Datei: heute
  archive/daily/*.md     ← archivierte Daily Notes
  .gtd-companion/        ← App-State (history log, später: sessions)
  ```
- Es gibt **kein** `projects/`-Verzeichnis (R6 — Projekte sind Subheadings in `next-actions.md`).
- Es gibt **kein** `archive/tasks/` (R7 — erledigte Tasks werden gelöscht, Trail in History + Daily-Note-Log).
- History-Einträge sind die einzige Rollback-/Audit-Quelle in Phase 1. Niemals überschreiben, niemals trunkieren.

---

## Task 2: `edit_file` mit atomarem Search/Replace

### Instructions

Trust-kritischstes Stück. Das LLM bekommt bei Search-Ambiguität einen strukturierten Fehler zurück und kann erneut versuchen. Kein Volltext-Rewrite.

**Ergänze das `FileRepository`-Interface:**
```ts
interface SearchReplaceEdit { search: string; replace: string; }
interface EditResult {
  ok: boolean;
  error?: {
    failedSearch: string;
    matchCount: number;   // 0 = nicht gefunden, >1 = mehrdeutig
    currentContent: string;
  };
}
edit(filePath: string, edits: SearchReplaceEdit[], changeSummary: string): Promise<EditResult>;
```

**Implementierung (in `LocalFileRepository` **und** `InMemoryFileRepository`):**
- Datei lesen. File fehlt → `EditResult { ok: false, error: { failedSearch: edits[0].search, matchCount: 0, currentContent: '' } }` (konsistente LLM-Rückmeldung).
- **Planungs-Phase:** Für jedes `edit` im Array die Anzahl der Vorkommen von `edit.search` im **Original**-Content zählen.
  - Genau 1 Treffer → OK, weitermachen.
  - 0 Treffer oder >1 Treffer → sofort abbrechen, `EditResult { ok: false, error: {...} }` mit dem fehlgeschlagenen `search`, dem `matchCount` und dem aktuellen Content zurück.
  - **Keine** Anwendung eines Edits, solange nicht alle validiert sind. Atomar.
- **Apply-Phase:** Edits sequenziell auf einen Working-Content anwenden (`String.replace` mit einem Literal — nicht Regex — und nur den ersten Treffer ersetzen, der per Plan bereits als eindeutig bekannt ist).
  - Wichtig: Die Uniqueness-Prüfung gilt gegen den **Originalinhalt**, nicht gegen den schon teilweise mutierten. Grund: ein späterer Edit darf nicht versehentlich einen durch einen vorherigen Edit entstandenen neuen Textblock treffen. Falls zwei Edits sich überlappen (d.h. nach Apply von Edit N wäre Edit N+1's Search nicht mehr im Content vorhanden), → `EditResult { ok: false }` mit passender Fehlermeldung (`matchCount: 0` nach Mutation, mit `changeSummary` "overlapping edits").
- Kein Write bei Fehler. Bei Erfolg: atomares Write + History-Eintrag.
- `search`/`replace` werden **exakt** als Literals verwendet (inkl. Whitespace, Tabs, Newlines). Keine Trim/Normalize-Magie.

**Tool-seitig (vorbereitend für Task 3):** Die Tool-Execute-Funktion wird später `edit_file` direkt aufrufen und das `EditResult` als normales Tool-Output zurückgeben (nicht throw) — das LLM sieht `ok: false` + `currentContent` und kann einen angepassten Search-Block versuchen. Kein Exception-Pfad nötig.

### Acceptance

Vitest-Suite (gegen `InMemoryFileRepository`, weil deterministisch schneller):

- Single-Edit happy path: 1 Treffer → wird appliziert, History-Eintrag geschrieben, Rückgabe `{ ok: true }`
- Multi-Edit happy path (3 Edits, alle eindeutig): alle drei appliziert, **ein** History-Eintrag
- `matchCount === 0`: Rückgabe `{ ok: false, error: { matchCount: 0, currentContent, failedSearch } }`, File unverändert, **kein** History-Eintrag
- `matchCount > 1`: Rückgabe `{ ok: false, error: { matchCount: 2, ... } }`, File unverändert
- Atomarität: Bei 3 Edits, wenn der 2. ambig ist → kein einziger Edit wird geschrieben
- Overlapping Edits (Edit 2's Search wird durch Edit 1's Replace zerstört) → sauberer Error, File unverändert
- `LocalFileRepository` nochmal mit Temp-Verzeichnis: ein Happy-Path-Test, um sicherzustellen dass die Implementierung identisch funktioniert

### Key Locations

- `packages/core/src/edit.ts` (Search/Replace-Logik, wiederverwendbar von beiden Repos)
- `packages/core/src/local-file-repository.ts` (+ `edit`-Method)
- `packages/core/src/in-memory-file-repository.ts` (+ `edit`-Method)
- `packages/core/src/__tests__/edit.test.ts`

### Key Discoveries

- Die strukturierte Error-Rückgabe (nicht Throw) ist die bewusste Design-Entscheidung: das LLM soll `ok: false` als normales Tool-Result bekommen und im nächsten Step reagieren. Das Vercel AI SDK würde Throws zwar automatisch als `tool-error`-Parts einbetten, aber der Kontrollfluss bleibt sauberer mit `EditResult` als reguläres Output-Schema.
- Aider-Inspiration: Bei Ambiguität erweitert das LLM den `search`-Block um ein paar Zeilen Kontext davor/danach, bis er eindeutig ist. Keine speziellen Anfragen an das LLM nötig — der Error-Content reicht als Feedback.
- Atomarität über alle Edits einer Invocation ist Pflicht (Spec "edit_file"-Abschnitt). Weekly-Review-Cleanup mit 20 gleichzeitigen `[x]`-Entfernungen ist ein realer Use-Case.

---

## Task 3: CLI + Vercel AI SDK + Tool Handlers → erster echter Konsolen-Lauf

### Instructions

Ziel dieses Tasks: **In einem realen Terminal mit echter Claude-Haiku-API gegen ein echtes Vault arbeiten.** Absichtlich minimal — System Prompt ist stub, kein Model-Router, keine Session-Persistenz, kein Pruning. Die "Productization-Passe" kommt in Task 4.

**Pakete:**
- `ai@^7.0.0-beta` in `packages/core` und `apps/cli`
- `@ai-sdk/anthropic@^4.0.0-beta` in `packages/core`
- `zod` (für Tool-Schemas)

**`packages/core/src/tools.ts` — die 5 Tool-Definitionen:**
```ts
import { tool } from 'ai';
import { z } from 'zod';

export function buildTools(repo: FileRepository) {
  return {
    read_file: tool({
      description: 'Liest den Markdown-Inhalt einer Datei relativ zum Vault-Root.',
      inputSchema: z.object({ file_path: z.string() }),
      execute: async ({ file_path }) => repo.read(file_path),
    }),
    edit_file: tool({
      description: 'Wendet atomare Search/Replace-Edits an. Jeder search muss genau einmal im File vorkommen.',
      inputSchema: z.object({
        file_path: z.string(),
        edits: z.array(z.object({ search: z.string(), replace: z.string() })).min(1),
        change_summary: z.string(),
      }),
      execute: async ({ file_path, edits, change_summary }) =>
        repo.edit(file_path, edits, change_summary),
    }),
    write_file: tool({
      description: 'Schreibt den kompletten Inhalt. Nur für Create oder Full-Rewrite — sonst edit_file.',
      inputSchema: z.object({
        file_path: z.string(),
        content: z.string(),
        change_summary: z.string(),
      }),
      execute: async ({ file_path, content, change_summary }) => {
        await repo.write(file_path, content, change_summary);
        return { ok: true };
      },
    }),
    list_files: tool({
      description: 'Listet Pfade, optional per Prefix gefiltert.',
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => repo.list(prefix),
    }),
    search_files: tool({
      description: 'Volltextsuche. scope=active (default), archive, oder all.',
      inputSchema: z.object({
        query: z.string(),
        scope: z.enum(['active', 'archive', 'all']).optional(),
      }),
      execute: async ({ query, scope }) => repo.search(query, scope ?? 'active'),
    }),
  };
}
```

**`apps/cli/src/index.ts` — der CLI-Entrypoint:**
- Liest `VAULT_PATH` und `ANTHROPIC_API_KEY` aus dem Env. Wirft wenn eine der beiden fehlt.
- `LocalFileRepository(vaultPath)` instanziieren
- `readline.createInterface` auf stdin/stdout, Prompt `> `
- Pro User-Zeile:
  - Zeichenlimit prüfen (2000 chars, feste Grenze — Heuristik kommt in Task 4)
  - Messages-Array in-memory pflegen (pro CLI-Run eine Session, keine Persistenz)
  - `streamText` aufrufen:
    ```ts
    const result = streamText({
      model: anthropic('claude-haiku-4-5'),
      system: MINIMAL_SYSTEM_PROMPT,
      messages,
      tools: buildTools(repo),
      stopWhen: isStepCount(10),
      abortSignal: controller.signal,
    });
    ```
  - `for await (const part of result.fullStream)` und:
    - `text` → `process.stdout.write(part.text)`
    - `tool-call` → `process.stdout.write('\n[' + part.toolName + '…]\n')` (UX-Feedback)
    - `tool-error` → `console.error('Tool error:', part.toolName, part.error)`
    - `error` → throw
  - Nach dem Stream: `messages.push(...(await result.response).messages)` um assistant/tool-Messages zu persistieren (nur im Array, nicht auf Disk)
- `process.on('SIGINT')` → `controller.abort()` — aktueller Stream bricht sauber ab, Prompt kommt zurück. Zweimal Ctrl+C beendet den Prozess.

**Minimaler System Prompt (in `apps/cli/src/index.ts` inline, noch nicht in `packages/core`):**
```
Du bist ein GTD-Assistent. Der User arbeitet mit einem Obsidian-Vault,
das folgende Dateien enthält:
- tasks/inbox.md, tasks/focus.md, tasks/next-actions.md, tasks/waiting.md, tasks/someday-maybe.md
- daily/YYYY-MM-DD.md (heutige Note), archive/daily/ (vergangene)

Nutze die Tools read_file, edit_file, write_file, list_files, search_files.
Bevorzuge edit_file (Search/Replace) gegenüber write_file für Änderungen an existierenden Files.
Bei mehrdeutigem Search: erweitere search um Kontext-Zeilen und versuche es erneut.

Heute ist {TODAY_ISO} ({TODAY_WEEKDAY}).
```
(Full R1-R13 kommt in Task 4.)

**`pnpm --filter cli dev` Script:** startet die CLI mit `tsx` oder `ts-node` direkt.

### Acceptance

- **Manueller Smoke-Test** (dokumentiert im PR/Commit-Message als Transcript) gegen ein echtes Test-Vault + echte Haiku-API:
  1. `> Liste meine Tasks` — LLM ruft `list_files({ prefix: 'tasks/' })` + `read_file(...)` und antwortet sinnvoll
  2. `> Neuer Task: Milch kaufen` — LLM ruft `edit_file` auf `tasks/inbox.md`, neue Zeile erscheint
  3. `> Hak Milch kaufen ab` — LLM findet den Task, setzt `[x]` oder entfernt ihn
  4. `> Was steht heute an?` — LLM liest Focus + heutige Daily Note und antwortet
  5. Ctrl+C während Stream: Stream bricht ab, Prompt ist zurück

- **Vitest-Integrationstest** mit `MockLanguageModelV4` (`ai/test`):
  - Skripte eine 3-Step-Tool-Chain: (1) `list_files` → (2) `read_file` → (3) Text-Response
  - Repo ist `InMemoryFileRepository` mit vordefiniertem State
  - Assertion: Nach dem Run wurden die erwarteten Tool-Calls gemacht **in der richtigen Reihenfolge**; letzter Step enthält den erwarteten Text
  - Zweiter Test: Simulierte `edit_file`-Ambiguität → LLM bekommt `{ ok: false, error: ... }` als tool-result → zweiter `edit_file`-Aufruf mit erweitertem Search → erfolgreicher Apply

### Key Locations

- `apps/cli/src/index.ts`
- `apps/cli/src/minimal-prompt.ts` (temporär, Task 4 ersetzt)
- `packages/core/src/tools.ts`
- `packages/core/src/__tests__/tools.test.ts` (Mock-LLM-Integrationstest)
- `apps/cli/package.json` mit `dev`/`start`-Scripts

### Key Discoveries

- **`stopWhen` ist essenziell.** Ohne explizites `stopWhen: isStepCount(N)` macht das SDK nur **einen** LLM-Call — kein agentic loop! Default = `isStepCount(1)`. Für uns: `isStepCount(10)`.
- **Tool-Errors brauchen kein Wrapping.** Wenn `execute` wirft, baut das SDK automatisch einen `tool-error`-Part in die Conversation ein, und das LLM kann im nächsten Step darauf reagieren. Für `edit_file` geben wir aber bewusst **kein** Throw zurück, sondern `EditResult { ok: false, error: ... }` als normales Tool-Output — das LLM sieht ein strukturiertes Feedback-Objekt, nicht einen Error-String.
- **`fullStream` vs `textStream`:** Wir wollen Tool-Call-Events im Terminal sehen ("[read_file…]"), also `fullStream`. `textStream` würde nur das LLM-Reden zeigen.
- **Response-Messages persistieren:** `(await result.response).messages` liefert die assistant-Message (inkl. tool-call-Parts) + tool-Messages (mit tool-result-Parts) des letzten Runs. Die an `messages`-Array anhängen reicht für die in-memory Session. Persistenz auf Disk kommt in Task 4.
- **Aktuelles Datum im Stub-Prompt:** Auch dieser minimale Prompt muss das aktuelle Datum enthalten (R13), sonst rätselt Haiku über Wochentage.

---

## Task 4: System Prompt R1-R13 + Request Builder + Tool-Result-Pruning + Model Router + Session-Persistenz + Input-Heuristik + Prompt-Caching

### Instructions

Die "Productization-Passe" über Task 3. Der Inline-Code aus Task 3 wird in saubere Core-Module refaktoriert, und alles was für MVP-Qualität fehlt wird ergänzt.

**`packages/core/src/system-prompt.ts`:**
- Export `buildSystemPrompt(ctx: { today: Date })`: baut den vollständigen System Prompt mit R1-R13 aus der Architektur-Spec
- Konkrete Regeln, die im Prompt materialisiert werden:
  - **R1:** Fünf Listen + Daily Note, Zweck + Crosscheck-Relevanz-Tabelle inline
  - **R2:** Single-Location-Invariante + Focus↔Next-Actions-Ausnahme
  - **R3:** Daily-Note ↔ Tasksystem-Beziehung
  - **R4:** Crosscheck-Protokoll-Schritte 1–5 als explizite Schritt-Liste
  - **R5:** Daily-Note-Lifecycle (Hinweis: der Server-Side-Move passiert automatisch via Task 5, das LLM muss das nicht selbst tun — aber es muss wissen dass `daily/` immer nur die heutige Note enthält)
  - **R6:** Next-Actions-Struktur (eine Datei, zweistufig)
  - **R7:** Weekly Review mit Review-Marker-Format `**Letztes Weekly Review: YYYY-MM-DD (Wochentag)**` im Focus-Header
  - **R8:** Task-Format (Markdown-Checkboxen)
  - **R9:** Daily-Note-Format (Plan, Log, Notizen)
  - **R10:** Natürlich-Sprache-Kommandos (Beispiele)
  - **R11:** Proaktive Hinweise (situativ, kein Schedule)
  - **R12:** Context-Aware Session Start (da Phase 1 keine Generative UI hat: als Text-Response rendern)
  - **R13:** Datum zur Laufzeit injizieren: `Heute ist {weekday}, {dd. month yyyy}.`
- Prompt-Länge im Blick halten (~1K Tokens Ziel, hart <2K)

**`packages/core/src/request-builder.ts`:**
- Export `buildRequest(opts: { repo, today, profile, messages, userMessage })` → `{ system, messages, tools, ... }`
- Lädt aktive Files synchron: `tasks/*.md` + `daily/YYYY-MM-DD.md` (falls vorhanden)
- Baut eine einzelne "Active State"-System-Addendum-Message oder injiziert die Files als initial-context-Prefix in `system` — Entscheidung auf Basis Prompt-Caching (siehe unten)
- Ruft `buildSystemPrompt` + fügt Profil + aktive Files an
- Ruft `pruneToolResults` auf die `messages`-Historie an
- Fügt die neue User-Message an

**`packages/core/src/tool-result-pruning.ts`:**
- Export `pruneToolResults(messages: ModelMessage[], k: number): ModelMessage[]`
- Iteriere rückwärts durch `messages`. Die letzten K `tool`-Rollen-Messages bleiben unberührt. Alle älteren `tool`-Messages werden so transformiert:
  - Für jeden `tool-result`-Content-Part: `output` wird durch den Stub-String ersetzt: `[Previous ${toolName} result — superseded by current state; re-read if needed]`. `toolCallId` und `toolName` bleiben erhalten.
  - `tool-error`-Parts bleiben unangetastet (Error-Info kann für das LLM relevant bleiben).
- `user`- und `assistant`-Messages (inkl. `tool-call`-Parts!) werden **niemals** verändert.
- K aus MVP-Spec: 5.

**`packages/core/src/model-router.ts`:**
- Export `routeModel(userMessage: string): 'haiku' | 'sonnet'`
- Keyword/Regex-basiert für MVP:
  - Sonnet-Keywords: "plan", "räum auf", "review", "priorisiere", "wichtig", "morgen plan"
  - Alles andere → Haiku
- Kein Throw bei Unsicherheit — Default ist Haiku
- Tests decken Grenz-Cases ab

**Session-Persistenz:**
- `packages/core/src/sessions.ts`: `loadOrCreateSession(repo, today)` / `appendMessages(session, new)` / `saveSession(repo, session)`
- Session-Storage: `basePath/.gtd-companion/sessions/YYYY-MM-DD.json` mit `{ date, messages: ModelMessage[] }`
- CLI lädt die heutige Session beim Start, schreibt nach jedem Turn
- Session-Switching (vergangene Session weiterchatten) ist **nicht** MVP — steht nicht in Phase 1

**Input-Heuristik (`packages/core/src/input-validation.ts`):**
- Max 2000 chars (hard reject mit freundlicher Nachricht)
- Heuristik-Reject bei:
  - > 5 Zeilen UND entweder >20% Zeilen starten mit whitespace (Code-Indent) ODER Anteil von `{};()=` im Input >5%
  - > 1500 chars UND >3 Code-Block-Marker (` ``` `)
- Response bei Reject: "Das sieht nicht nach einer Task-Anfrage aus. Ich bin dein GTD-Assistent — was kann ich für deine Aufgaben tun?" (CLI zeigt, LLM wird nicht aufgerufen)

**Prompt-Caching:**
- `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` auf dem `streamText`-Call
- Anthropic cacht dann System Prompt + Tool-Definitions (stabil über Turns) — ein `cacheControl`-Marker am Ende reicht
- `totalUsage.inputTokenDetails.cacheReadTokens` bzw. `cacheWriteTokens` ausloggen (simple `console.debug` hinter `DEBUG=1`)

**CLI-Refactor:**
- `apps/cli/src/index.ts` nutzt jetzt `buildRequest` + `routeModel` + Session-Persistenz + Input-Validation
- Minimaler Stub-Prompt aus Task 3 wird entfernt

### Acceptance

Vitest-Suite grün:
- `buildSystemPrompt({ today: new Date('2026-04-24') })` enthält `"Heute ist Freitag, 24. April 2026"` und alle R1-R13-Markerstrings (jede Regel bekommt einen eindeutigen Anchor im Prompt — Test prüft alle 13 Anchor)
- `pruneToolResults`:
  - K=5, 10 tool-messages → älteste 5 werden zu Stubs, neueste 5 bleiben identisch
  - user/assistant-Messages unberührt (inkl. assistant-Messages die `tool-call`-Parts enthalten)
  - Eine Message mit gemischten Parts (text + tool-call im assistant): unverändert
  - tool-error-Parts bleiben erhalten
- `routeModel`:
  - "Plan meinen Tag" → sonnet, "Neuer Task: Milch" → haiku, "Räum die Inbox auf" → sonnet, "Hak X ab" → haiku
- Session-Roundtrip:
  - `loadOrCreateSession` in leerem Vault → neue Session-Datei
  - Append + Save → Load liefert identische Messages zurück
  - Neuer Tag → neue Session-Datei (alte bleibt)
- Input-Validierung:
  - 2001 chars → reject
  - 2000 chars normale Sprache → accept
  - `function foo() { return 1; }`-Paste mit 50 Zeilen → reject
  - Normaler Task "Neuer Task: Angebot für VW schreiben" → accept

**Manueller Smoke-Test** (dokumentiert im PR): 3 Turns gegen echtes Vault, der erste erzeugt Cache-Writes, der zweite Cache-Reads (beobachtbar in Debug-Log), dritter ebenfalls Cache-Reads. Eine "Plan meinen Tag"-Nachricht routet zu Sonnet (sichtbar im Debug-Log).

### Key Locations

- `packages/core/src/system-prompt.ts` (+ evtl. `system-prompt.template.md` als Datei, die zur Compile-Zeit via `import` reingeladen wird)
- `packages/core/src/request-builder.ts`
- `packages/core/src/tool-result-pruning.ts`
- `packages/core/src/model-router.ts`
- `packages/core/src/sessions.ts`
- `packages/core/src/input-validation.ts`
- `packages/core/src/__tests__/` — ein Test-File pro Module
- `apps/cli/src/index.ts` (refaktoriert)

### Key Discoveries

- **Prompt-Caching ist manuell.** Das SDK cached nichts automatisch. Der `cacheControl`-Marker bestimmt das Ende des gecachten Blocks. Strategie für Phase 1: Ein einziger Marker auf dem `streamText`-Call, der alles bis dahin (System + Tool-Definitions) als cachebar markiert. Message-Ende-Marker mit `prepareStep` (für Message-History-Caching) ist Phase-2-Thema.
- **Tool-Result-Pruning transformiert nur `role: 'tool'`-Messages.** Assistant-Messages mit `tool-call`-Parts bleiben unangetastet (sie zeigen "ein Call ist passiert", was für den Kontext wichtig ist — nur der konkrete Result wird gestubbt).
- **Ein `tool-result`-Part hat die Felder `type: 'tool-result'`, `toolCallId`, `toolName`, `output`** (siehe SDK-Recherche §8). Pruning ersetzt `output` durch einen String, nicht das ganze Part.
- **K=5** laut Architektur-Spec. Tunable, aber MVP-Fix.
- **R12 Session-Start-Suggestion** ist in Phase 1 eine Text-Response (keine Generative UI). Der System Prompt enthält die State-Tabelle aus R12; die Entscheidung welche Suggestion trifft das LLM beim ersten Turn einer neuen Session.
- **Input-Heuristik darf nicht zu aggressiv sein.** Ein Task wie "Schreib Code-Review für PR #42" enthält zwar Sonderzeichen, aber nicht in den Proportionen die die Heuristik rejected. Testfälle decken ehrliche Kantenfälle ab.
- **Session-Switching ist explizit kein MVP-Feature.** Die Session-Datei der heutigen Session wird geladen; vergangene Sessions liegen nur auf Disk, werden aber von der CLI nicht angefasst. Phase 2a bringt die UI dafür.

---

## Task 5: Daily-Note-Lifecycle (R5) + Clock-Injection

### Instructions

Automatische Archivierung beim Tageswechsel. Läuft server-side (hier: CLI-side) **vor** jedem LLM-Request, damit das LLM immer einen sauberen Tages-State sieht.

**`packages/core/src/lifecycle.ts`:**
```ts
export async function runDailyLifecycle(
  repo: FileRepository,
  today: Date,
): Promise<{ archivedPaths: string[]; createdTodayPath: string | null }>;
```

- `todayIso = YYYY-MM-DD` aus dem übergebenen `today`
- `existing = await repo.list('daily/')` (nur direkte Kinder, keine Subfolder)
- Für jedes `daily/YYYY-MM-DD.md` mit `date < today`:
  - `content = await repo.read(file)`
  - Offene Checkboxen `- [ ]` in Zeilen entfernen (exakt: Zeilen die mit optionalem Whitespace + `- [ ]` beginnen, werden gestrichen — nicht durchgestrichen, einfach weg)
  - Im Log-Bereich am Ende der Note: `- Archiviert am ${todayIso}: offene Items entfernt (→ manuell neu einplanen)` anhängen, falls offene Items entfernt wurden
  - `- [x]`-Zeilen bleiben
  - Write zu `archive/daily/YYYY-MM-DD.md` via `repo.write(newPath, newContent, 'Archived daily note')`
  - **Delete-Semantik:** Da es in `FileRepository` kein `delete` gibt, wird der alte `daily/YYYY-MM-DD.md` durch einen **expliziten Move** ersetzt. Ergänze das Interface um `move(from, to, changeSummary)` — einfacher Read + Write(to) + Delete(from). Implementierungen:
    - `LocalFileRepository.move`: `fs.rename` + History-Eintrag mit `contentBefore`/`contentAfter`
    - `InMemoryFileRepository.move`: Map-Umbenennen + History
  - History-Eintrag mit `changeSummary: 'Archived daily note YYYY-MM-DD'` und `changedBy: 'system'`
- Wenn `daily/${todayIso}.md` nicht existiert: `repo.write('daily/' + todayIso + '.md', '', 'Created new daily note for today')` mit `changedBy: 'system'`
- Return-Objekt für Logging/Tests

**Clock-Injection:**
- `runDailyLifecycle` nimmt `today: Date` als Parameter — **niemals intern `new Date()`**
- CLI-Entrypoint:
  - Default: `today = new Date()` direkt vor jedem LLM-Request
  - Env-Override: `GTD_NOW_OVERRIDE=2026-04-25T09:00:00Z` → `today = new Date(env)` — für Task-6-E2E-Tests und manuelle Tageswechsel-Simulation
- Model-Router und System-Prompt-Builder kriegen denselben `today`-Wert — Single Source of Truth pro Request.

**CLI-Integration:**
- Vor jedem `streamText`-Aufruf: `await runDailyLifecycle(repo, today)`
- Nur einmal pro CLI-Run dagegen zu prüfen wäre falsch — wenn der User die CLI über Mitternacht offen lässt, soll der Wechsel erkannt werden
- Kein Crash wenn nix zu archivieren ist; der Aufruf ist idempotent

### Acceptance

Vitest-Suite gegen `InMemoryFileRepository` + gemockten Clock:

- **Szenario A — Gestrige Note vorhanden, heutige fehlt:**
  - Vor: `daily/2026-04-23.md` mit offenen `[ ]` + `[x]`-Mix
  - `runDailyLifecycle(repo, new Date('2026-04-24T09:00Z'))`
  - Nach: `daily/2026-04-23.md` weg, `archive/daily/2026-04-23.md` enthält Content mit entfernten `[ ]`-Zeilen + Log-Vermerk, `[x]`-Zeilen erhalten, neue leere `daily/2026-04-24.md` existiert
  - History hat 2 neue Einträge
- **Szenario B — Mehrere alte Notes (User 3 Tage weg):**
  - Vor: `daily/2026-04-21.md`, `daily/2026-04-22.md`, `daily/2026-04-23.md`
  - Nach: alle drei nach `archive/daily/` verschoben, `daily/2026-04-24.md` neu
- **Szenario C — Heutige Note existiert bereits:**
  - Vor: `daily/2026-04-24.md` mit Content
  - Nach: unverändert, kein History-Eintrag, return `{ archivedPaths: [], createdTodayPath: null }`
- **Szenario D — Idempotenz:**
  - Zweiter Aufruf mit demselben `today` → keine Mutation, keine neuen History-Einträge
- **Szenario E — Offene Checkboxen mit verschachtelter Einrückung:**
  - `  - [ ] Sub-Task` (2 Leerzeichen Einrückung) → wird entfernt
  - `- [x] Erledigt` → bleibt
  - `- Normal text` → bleibt

### Key Locations

- `packages/core/src/lifecycle.ts`
- `packages/core/src/file-repository.ts` (+ `move`-Method)
- `packages/core/src/local-file-repository.ts` (+ `move`-Impl)
- `packages/core/src/in-memory-file-repository.ts` (+ `move`-Impl)
- `packages/core/src/__tests__/lifecycle.test.ts`
- `apps/cli/src/index.ts` (+ `runDailyLifecycle` vor jedem Turn)

### Key Discoveries

- **Lifecycle läuft server-side, nicht LLM-side.** Das LLM bekommt ein fertig-archiviertes Tages-Layout und muss sich nicht um den Move kümmern (Spec "Automatischer Tageswechsel").
- **Offene Checkboxen werden gelöscht, nicht durchgestrichen.** Das Log-Entry dokumentiert den Move; die Detail-Info, *was* offen war, steckt im `file_history`-Eintrag (`contentBefore`).
- **Ein neues `move`-Primitiv im Interface ist sauberer als Read+Write+(Fehlendes Delete).** Ohne `move` wüsste das Repo nicht, dass es eine zweite Zeile im History-Log braucht (eine für Delete der Quell-Datei, eine für Create der Ziel-Datei). Mit `move` ist das ein semantisch atomarer Eintrag.
- **Clock-Injection ist nicht nur Test-Infrastruktur.** Das `GTD_NOW_OVERRIDE`-Env-Var ermöglicht auch manuelle Dogfooding-Tests ("was passiert am Freitag?") ohne das System-Datum zu ändern.

---

## Task 6: End-to-End Acceptance gegen echte Claude API + Vault

### Instructions

Scripted E2E-Harness, die die CLI als Subprozess gegen echte Haiku-API + ein dediziertes Test-Vault laufen lässt. Der erste Test, der beweist dass der gesamte Stack funktioniert.

**`apps/cli/test-e2e/` Struktur:**
- `e2e.test.ts` — Vitest-Test-File (sollte mit `describe.runIf(process.env.ANTHROPIC_API_KEY)` laufen)
- `seed-vault.ts` — generiert ein frisches Test-Vault in `$TMPDIR/gtd-e2e-vault-{uuid}/` mit bekanntem Seed-State
- `cli-harness.ts` — spawnt `apps/cli` als Subprozess (via `execa` oder node `child_process`), schreibt Input, liest Output
- `assertions.ts` — Matcher-Bibliothek, die auf File-State + History-Log assert'ed

**Seed-Vault:**
```
tasks/inbox.md:
- [ ] Alte Inbox-Notiz
- [ ] Idee: Buch über GTD

tasks/focus.md:
- [ ] Praxis-Session vorbereiten
- [ ] VW Angebot schreiben
- [ ] Website-Text überarbeiten

tasks/next-actions.md:
## Work
- [ ] Praxis-Session vorbereiten
- [ ] VW Angebot schreiben
## Persönlich
- [ ] Zahnarzttermin machen

tasks/waiting.md:
- [ ] Rückmeldung von Müller (seit 2026-04-17)

tasks/someday-maybe.md:
- [ ] Garagentor lackieren

daily/{today}.md: (leer)
```

**Szenarien (alle asserten auf File-State, nicht auf LLM-Text):**

1. **Read-only:** `"Was steht heute an?"` → CLI antwortet (stdout nicht leer); keine `file_history`-Einträge mit `changedBy: 'llm'` entstanden.
2. **Create in Inbox:** `"Neuer Task: Milch kaufen"` → `tasks/inbox.md` enthält eine neue Zeile mit "Milch" (case-insensitive substring); Alt-Inhalte intakt.
3. **Move (Single-Location R2):** `"Verschieb Milch kaufen nach Next Actions"` → keine Zeile in `inbox.md` mit "Milch", genau eine Zeile in `next-actions.md` mit "Milch". Spec-Invariante R2 hält.
4. **Complete:** `"Hak Milch kaufen ab"` → Zeile in `next-actions.md` ist `[x]` oder entfernt. Keine offenen "Milch"-Einträge mehr.
5. **Soft-Test Inbox-Cleanup:** `"Räum meine Inbox auf"` → Anzahl offener Items in `inbox.md` ist kleiner als vorher; die Differenz taucht entweder in `next-actions.md`, `waiting.md`, `someday-maybe.md` oder als `[x]` auf. **Property-Assertion:** Summe "offene + erledigte + archivierte" Task-Strings bleibt gleich (Lost-Task-Detektor). Keine Assertion auf welche Kategorie welches Item bekommt.
6. **Tageswechsel:** CLI beenden, `GTD_NOW_OVERRIDE=2026-04-25T09:00:00Z` setzen, CLI neu starten, 1 beliebige User-Message senden → `archive/daily/{yesterday}.md` existiert mit gestrigem Content (offene Items gelöscht, Log-Vermerk vorhanden), neue `daily/2026-04-25.md` existiert.
7. **History-Log-Check:** `.gtd-companion/file-history.jsonl` enthält einen Eintrag pro mutativem Turn (Szenarien 2-5 sowie die Lifecycle-Einträge aus 6).

**Test-Laufzeit und Kosten:**
- Test läuft nur wenn `ANTHROPIC_API_KEY` gesetzt ist (`describe.runIf`), sonst skip
- Alle Turns nutzen Haiku (hardcoded in CLI für diesen Test-Modus, oder weil `routeModel` das so entscheidet)
- Budget-Check: Ein Full-Run soll unter 2 Minuten und unter ~$0.05 bleiben
- Bei Failure: **Kein automatisches Aufräumen** des Test-Vaults — `console.log` gibt den Pfad aus, damit der Entwickler manuell inspizieren kann. Cleanup in `afterEach` nur bei Erfolg.

**Harness-Details:**
- CLI-Subprozess via `execa` mit `PATH`, `VAULT_PATH`, `ANTHROPIC_API_KEY`, optional `GTD_NOW_OVERRIDE`
- Input-Stream: pro Szenario eine Line an stdin schreiben, dann stdout lesen bis der Prompt `> ` wieder erscheint (Ready-Indicator)
- Timeout pro Turn: 30s (Agentic Loop kann mehrere Tool-Calls brauchen)
- Nach allen Szenarien: `SIGINT` + `SIGINT` zum Beenden

### Acceptance

- `pnpm --filter cli test:e2e` grün wenn `ANTHROPIC_API_KEY` gesetzt ist
- Skip-Nachricht klar sichtbar wenn Key fehlt ("skipped — set ANTHROPIC_API_KEY to run e2e")
- Eine Dokumentations-Zeile im `README.md`: wie man den Test lokal laufen lässt, wie teuer er ist

### Key Locations

- `apps/cli/test-e2e/e2e.test.ts`
- `apps/cli/test-e2e/seed-vault.ts`
- `apps/cli/test-e2e/cli-harness.ts`
- `apps/cli/test-e2e/assertions.ts`
- `apps/cli/package.json` (+ `test:e2e`-Script)
- `README.md` (E2E-Abschnitt)

### Key Discoveries

- **LLM-Output ist nicht-deterministisch.** Assertions **nur** auf Dateisystem-State und `file_history`, niemals auf exakten LLM-Text. Erlaubt: grobe String-Checks ("output contains 'Milch'") für Read-only-Szenarien.
- **R2 (Single-Location) ist die stärkste Property-Assertion.** Nach jedem mutativen Turn: für jeden Task-String darf maximal ein offenes Vorkommen existieren (Ausnahme: Focus ↔ Next Actions darf doppeln).
- **Lost-Task-Detektor:** Summe aller unique Task-Strings über alle Listen (inkl. archiviert und erledigt) ist monoton nicht-fallend. Wenn diese Invariante bricht, hat das System einen Task verloren — das ist der Kern-Trust-Risk aus der Produktspec.
- **Szenario 6 (Tageswechsel) funktioniert nur dank Task-5-Clock-Injection.** Ohne `GTD_NOW_OVERRIDE` wäre Tageswechsel nicht reproduzierbar testbar.
- **Die Tests müssen robust gegen Modell-Updates sein.** Wenn Haiku in 6 Monaten anders antwortet, sollen die Tests immer noch grün sein — darum Property-Assertions statt Text-Matches.

---

_Plan erstellt: 2026-04-24. Basiert auf Architecture Spec v1 + Vercel-SDK-Recherche v1._
