Ich habe jetzt alle relevanten Informationen gesammelt. Hier ist die vollständige, quellengestützte Antwort auf alle Fragen:

---

# Vercel AI SDK — Recherche-Ergebnisse

## 1. Pakete & Versionen

**Aktuelle Versionen (main/beta branch, Stand 2026-04-24):**

- `ai`: [`7.0.0-beta.111`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/package.json?L3)
- `@ai-sdk/anthropic`: [`4.0.0-beta.37`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/package.json?L3)
- **Node-Requirement**: `>=18` (beide Pakete, definiert in [`engines`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/package.json?L65-L67))

> **Achtung:** `main` ist derzeit im **Pre-Release-Modus** (beta). Die letzten stabilen Major-Versionen waren `ai@4.x` / `@ai-sdk/anthropic@1.x`. Prüfe vor dem Einsatz, ob du die Beta nutzen willst oder auf ein stable release wartest.

---

## 2. Claude-Modell-IDs

Direkt aus [`anthropic-options.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/src/anthropic-options.ts?L4-L21):

```typescript
// Haiku:
'claude-3-haiku-20240307'      // klassisch, stabil
'claude-haiku-4-5-20251001'    // neuere Generation
'claude-haiku-4-5'             // alias

// Sonnet:
'claude-sonnet-4-20250514'     // aktuell empfohlen
'claude-sonnet-4-5-20250929'
'claude-sonnet-4-5'
'claude-sonnet-4-6'

// Opus (für Vollständigkeit):
'claude-opus-4-20250514'
'claude-opus-4-7'              // neuestes, mit Adaptive Thinking
```

Alle IDs akzeptieren auch `(string & {})` — d.h. beliebige Strings sind möglich für forward-compatibility.

---

## 3. `streamText` vs `generateText`

Beide haben identische Parameter-Signaturen. Der Unterschied liegt im Return-Typ:

- **`generateText`**: wartet auf die vollständige Antwort, gibt ein aufgelöstes Objekt zurück (`text`, `toolCalls`, `toolResults`, `usage`, `response.messages`, `steps`)
- **`streamText`**: gibt sofort ein Objekt mit **PromiseLike-Promises und Streams** zurück

### `streamText` Return-API (aus [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2170-L2870)):

```typescript
const result = streamText({ model, ... });

// Text-only stream — AsyncIterable<string> & ReadableStream<string>
result.textStream            // → wirft Error bei Fehler

// Alle Events inkl. tool-call, tool-result, error, reasoning
result.fullStream            // → AsyncIterable<TextStreamPart> & ReadableStream<TextStreamPart>

// Promises (konsumieren den Stream automatisch):
await result.text            // string
await result.usage           // { inputTokens, outputTokens, totalTokens, cachedInputTokens, ... }
await result.totalUsage      // wie usage, aber Summe aller Steps bei multi-step
await result.toolCalls       // TypedToolCall[]
await result.toolResults     // TypedToolResult[]
await result.finishReason    // 'stop' | 'length' | 'tool-calls' | ...
await result.response        // { id, modelId, timestamp, headers, messages: ResponseMessage[] }
await result.steps           // StepResult[] — alle Zwischenschritte
await result.content         // ContentPart[] des letzten Steps
await result.providerMetadata
```

---

## 4. Tool-Definition

### Signatur `tool()` (aus [`tool.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/20-tool.mdx) und [`tools-and-tool-calling.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx)):

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'Optional. What the tool does.',   // beeinflusst Auswahl durch LLM
  inputSchema: z.object({ ... }),                  // Zod-Schema ODER jsonSchema() — REQUIRED
  execute: async (input, options) => {
    // options: { toolCallId, messages, abortSignal, context }
    return result;  // beliebiger Typ, wird als JSON an LLM zurückgegeben
  },
  strict: true,           // optional: strikte Validierung (nicht alle Provider)
  outputSchema: z.object({ ... }),  // optional: für Type-Inference
  onInputStart: (opts) => {},   // nur bei streamText, wenn Argumente zu streamen beginnen
  onInputDelta: ({ inputTextDelta, ...opts }) => {},
  onInputAvailable: ({ input, ...opts }) => {},
});
```

**Schema-Typ:** Zod **oder** `jsonSchema()` Helper aus dem SDK. **Kein raw JSON-Schema-Objekt** ohne den Helper.

> **Wichtig für v5/v7:** Der Parameter heißt jetzt **`inputSchema`** (früher `parameters`). Es gibt ein Codemod im Repo für die Migration.

---

## 5. Verhalten wenn `execute` wirft

Aus den Docs ([`tools-and-tool-calling.mdx#handling-errors`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L997-L040)):

> "When tool execution fails (errors thrown by your tool's `execute` function), the AI SDK adds them as `tool-error` content parts **to enable automated LLM roundtrips in multi-step scenarios**."

**Das bedeutet:**
- **Der Stream crasht nicht.**
- Der Fehler wird als `{ type: 'tool-error', toolName, toolCallId, error }` Part in den Steps eingebettet.
- Bei `streamText` erscheinen diese als `tool-error`-Parts im `fullStream`.
- Bei multi-step (`stopWhen`) wird das LLM mit dem `tool-error` als Tool-Result konfrontiert und kann es im nächsten Step verarbeiten.

**Für eure `edit_file`-Retry-Semantik:** Ihr müsst **nicht** selbst den Fehler fangen und zurückspielen — das SDK tut das automatisch. Ihr müsst nur `stopWhen: isStepCount(N)` setzen, damit das LLM mehrere Versuche bekommt.

---

## 6. `toolChoice`

Aus [`language-model.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/types/language-model.ts?L96-L106):

```typescript
type ToolChoice<TOOLS> =
  | 'auto'       // Modell entscheidet (Default)
  | 'required'   // Modell MUSS ein Tool aufrufen
  | 'none'       // Modell darf KEINE Tools aufrufen
  | { type: 'tool', toolName: Extract<keyof TOOLS, string> }  // spezifisches Tool erzwingen
```

Für den CLI-Use-Case: `toolChoice: 'auto'` (Default) ist korrekt.

---

## 7. Agentic Loop — `stopWhen` / `isStepCount`

**Was zählt ein "Step"?** Aus der Implementierung ([`generate-text.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/generate-text/generate-text.ts?L237)) und den Docs:

> "Each step represents a single LLM invocation."

Ein Step = **ein LLM-Call**. Tool-Execution selbst ist kein separater Step.

```
Step 1: LLM → erzeugt tool-call → Tool wird ausgeführt
Step 2: LLM erhält tool-result → erzeugt Antwort oder weiteren tool-call
```

**Default:** `stopWhen = isStepCount(1)` — d.h. ohne explizites `stopWhen` macht `streamText`/`generateText` **nur einen einzigen LLM-Call**, kein automatisches agentic looping!

**Beim Erreichen:** Kein Error, sauberer Abbruch. Das letzte Step-Ergebnis wird normal zurückgegeben. `isStepCount(N)` stoppt, wenn N Steps ausgeführt wurden (N LLM-Calls). Die Default-Annahme der SDK-Docs: `isStepCount(20)` für agentische Loops.

```typescript
import { isStepCount } from 'ai';

const result = streamText({
  model,
  tools,
  stopWhen: isStepCount(10),  // max 10 LLM-Calls
  prompt: '...',
});
```

---

## 8. `response.messages` für Persistenz

Aus [`tools-and-tool-calling.mdx#response-messages`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L535-L560):

```typescript
const messages: ModelMessage[] = [ /* ... */ ];

const { response } = await generateText({ model, messages, tools });
// oder bei streamText:
const response = await result.response;

messages.push(...response.messages);
// response.messages: Array<ResponseMessage>
// enthält assistant-message (mit tool-call parts) + tool-message (mit tool-result parts)
```

**Format der Messages (`ModelMessage`-Typen):**

```typescript
// Assistant-Message mit Tool-Call:
{
  role: 'assistant',
  content: [
    { type: 'text', text: '...' },
    { type: 'tool-call', toolCallId: '...', toolName: '...', input: { ... } }
  ]
}

// Tool-Result-Message:
{
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: '...', toolName: '...', output: { ... } }
    // oder bei Fehler:
    { type: 'tool-error', toolCallId: '...', toolName: '...', error: Error }
  ]
}
```

Alle Steps bekommt ihr über `result.steps` (Array von `StepResult`), jeder Step hat `response.messages`.

---

## 9. Streaming im Terminal

### `textStream`:

```typescript
const result = streamText({ model, prompt: '...' });

// einfach, korrekt:
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

`textStream` ist `AsyncIterableStream<string>` — direkt iterierbar, kein Helper nötig.

### `fullStream` für Tool-Call-Events:

```typescript
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text':
      process.stdout.write(part.text);
      break;
    case 'tool-call':
      process.stdout.write(`\n[${part.toolName}...]\n`);
      break;
    case 'tool-call-streaming-start':
      process.stdout.write(`\n[${part.toolName} starting...]\n`);
      break;
    case 'tool-result':
      // tool fertig
      break;
    case 'tool-error':
      console.error(`Tool ${part.toolName} failed:`, part.error);
      break;
    case 'error':
      throw part.error;
  }
}
```

`fullStream`-Typen aus [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2849-L2952): `'text'`, `'reasoning'`, `'source'`, `'tool-call'`, `'tool-call-streaming-start'`, `'tool-call-delta'`, `'tool-result'`, `'tool-error'`, `'custom'`, `'error'`, `'finish'`.

### AbortController:

```typescript
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

const result = streamText({
  model,
  abortSignal: controller.signal,
  tools: {
    myTool: tool({
      execute: async (args, { abortSignal }) => {
        return fetch(url, { signal: abortSignal }); // weiterleiten
      },
    }),
  },
});
```

Das `abortSignal` wird automatisch an alle Tool-Executes weitergegeben.

---

## 10. System Prompt

Das SDK bevorzugt den **`system`-Parameter** (String):

```typescript
streamText({
  model,
  system: 'You are a helpful CLI assistant.',
  messages: [...],
});
```

Alternativ als erste Message mit `role: 'system'`:
```typescript
messages: [
  { role: 'system', content: 'You are ...' },
  { role: 'user', content: '...' }
]
```

Beide Formen funktionieren. Der `system`-Parameter ist die empfohlene Form im SDK.

---

## 11. Messages-Array-Format

```typescript
// User-Message:
{ role: 'user', content: 'string' }
// oder mit Parts:
{ role: 'user', content: [{ type: 'text', text: '...' }] }

// Assistant-Message:
{ role: 'assistant', content: [
  { type: 'text', text: '...' },
  { type: 'tool-call', toolCallId: '...', toolName: '...', input: { ... } }
]}

// Tool-Result-Message:
{ role: 'tool', content: [
  { type: 'tool-result', toolCallId: '...', toolName: '...', output: { ... } }
]}
```

---

## 12. Modellwechsel (Router)

Ja, das Modell wird **pro `streamText`-Call** frei gewählt:

```typescript
import { anthropic } from '@ai-sdk/anthropic';

function modelRouter(intent: 'fast' | 'complex') {
  return intent === 'fast'
    ? anthropic('claude-haiku-4-5')
    : anthropic('claude-sonnet-4-20250514');
}

const result = streamText({ model: modelRouter(intent), ... });
```

Zusätzlich: `prepareStep` erlaubt sogar einen **Per-Step-Modellwechsel** innerhalb desselben agentic loops ([`prepareStep`-Docs](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L469-L505)).

---

## 13. Usage & Token-Details

### Basis-Usage (aus [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2192-L2320)):

```typescript
const usage = await result.usage;  // letzter Step
const totalUsage = await result.totalUsage;  // Summe aller Steps

usage.inputTokens        // number | undefined
usage.outputTokens       // number | undefined
usage.totalTokens        // number | undefined
usage.cachedInputTokens  // number | undefined (deprecated/simple view)
```

### Detaillierte Cache-Tokens (für Phase 1 berücksichtigen!):

Im `totalUsage`-Objekt gibt es `inputTokenDetails`:

```typescript
totalUsage.inputTokenDetails.noCacheTokens    // nicht gecachte Input-Tokens
totalUsage.inputTokenDetails.cacheReadTokens  // Cache-Reads (billig)
totalUsage.inputTokenDetails.cacheWriteTokens // Cache-Writes (teurer)
totalUsage.outputTokenDetails.textTokens
totalUsage.outputTokenDetails.reasoningTokens
```

Außerdem via `onFinish`-Callback:

```typescript
streamText({
  model,
  onFinish({ usage, totalUsage, steps, text, finishReason }) {
    console.log(totalUsage.inputTokenDetails.cacheReadTokens);
    console.log(totalUsage.inputTokenDetails.cacheWriteTokens);
  }
});
```

Die rohen Provider-Daten sind über `usage.raw` erreichbar.

---

## 14. Anthropic Prompt Caching

### Automatisch vs. manuell:

Das SDK **bietet kein automatisches Caching** — ihr müsst `cacheControl`-Marker explizit setzen.

### Methode 1: Via `providerOptions` auf Messages (empfohlen):

Aus dem [Dynamic Prompt Caching Cookbook](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/cookbook/05-node/90-dynamic-prompt-caching.mdx):

```typescript
// Message-level (SDK übersetzt auf letzten Content-Block):
{
  role: 'user',
  content: 'my message',
  providerOptions: {
    anthropic: { cacheControl: { type: 'ephemeral' } }
  }
}
```

### Methode 2: Via `providerOptions` auf dem `streamText`-Call (System Prompt + Tools):

Aus [`anthropic-options.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/src/anthropic-options.ts?L115-L120):

```typescript
streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'Langer System-Prompt...',
  providerOptions: {
    anthropic: {
      cacheControl: { type: 'ephemeral' }
      // optional: ttl: '5m' | '1h'
    }
  }
});
```

**Was wird gecacht:** Anthropic cached alles bis zum letzten mit `cacheControl` markierten Block. Standard-Strategie: System Prompt + Tool-Definitions + Message-History (via `prepareStep` bei jedem Step das letzte Message-Ende markieren).

**TTL:** Standard `5m`, alternativ `1h` via `ttl`-Feld.

**Cache-Kosten:** Cache-Writes kosten 25% mehr als normale Input-Tokens; Cache-Reads kosten 10%.

---

## 15. Testing mit `MockLanguageModelV4`

**Offiziell unterstützt**, importierbar aus `ai/test`:

```typescript
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
```

**Signatur** ([`mock-language-model-v4.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/test/mock-language-model-v4.ts)):

```typescript
new MockLanguageModelV4({
  provider?: string,       // default: 'mock-provider'
  modelId?: string,        // default: 'mock-model-id'

  // doGenerate: für generateText
  doGenerate?:
    | LanguageModelV4['doGenerate']           // async function
    | LanguageModelV4GenerateResult           // ein festes Ergebnis
    | LanguageModelV4GenerateResult[],        // Array für sequentielle Calls

  // doStream: für streamText
  doStream?:
    | LanguageModelV4['doStream']
    | LanguageModelV4StreamResult
    | LanguageModelV4StreamResult[],
})
```

**Beispiel deterministischer Tool-Call-Chain** (aus der [Testing-Doku](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/55-testing.mdx)):

```typescript
const result = streamText({
  model: new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 10, text: 10, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  }),
  prompt: 'Hello, test!',
});
```

Tool-Call-Sequenzen: `doStream` als **Array** übergeben — jeder Eintrag ist die Antwort des N-ten LLM-Calls im multi-step loop.

---

## 16. Telemetry (`experimental_telemetry`)

Aus [`telemetry.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/60-telemetry.mdx) und der Implementierung:

```typescript
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

// Einmalig beim App-Start:
registerTelemetry(new OpenTelemetry());

// Per-Call opt-out oder Metadata:
streamText({
  telemetry: { functionId: 'my-agent-step' },
  // oder: experimental_telemetry (deprecated alias, funktioniert noch)
});
```

Standardmäßig werden nach der Registrierung **alle AI SDK Calls** automatisch getrackt. Kein Per-Call-Opt-in nötig.

---

## 17. Rate-Limit / 429 Handling

Aus dem [CHANGELOG](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/CHANGELOG.md?L3987-L3990):

> "Added automatic support for respecting rate limit headers (`retry-after-ms` and `retry-after`) in the SDK's retry logic. When these headers are present and contain reasonable values (0–60 seconds), the retry mechanism will use the server-specified delay instead of exponential backoff."

**Das SDK hat eingebautes Auto-Retry mit Rate-Limit-Awareness.** Kein eigenes Wrapping nötig. Die Retry-Logik respektiert Anthropics `retry-after`-Header automatisch.

---

## Zusammenfassung der kritischen Punkte für eure Implementierung

| Thema | Ergebnis |
|---|---|
| Tool-Fehler → LLM-Retry | Automatisch via `tool-error` Parts — SDK handled das, ihr braucht kein manuelles Wrapping |
| Agentic Loop | `stopWhen: isStepCount(N)` — ein Step = ein LLM-Call; Default ist 1 (kein Loop!) |
| Messages persistieren | `result.response.messages` (oder `(await result.response).messages` bei streamText) |
| Terminal-Streaming | `for await (const chunk of result.textStream) process.stdout.write(chunk)` — fertig |
| Tool-Status anzeigen | `fullStream` abonnieren, auf `tool-call`/`tool-call-streaming-start` reagieren |
| Cache-Tokens | Über `totalUsage.inputTokenDetails.{cacheReadTokens, cacheWriteTokens}` |
| Prompt Caching | Explizit: `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` |
| Testing | `MockLanguageModelV4` aus `ai/test` — offiziell, produktionsreif |
