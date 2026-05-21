I have now collected all the relevant information. Here is the complete, source-backed answer to all questions:

---

# Vercel AI SDK — Research Results

## 1. Packages & Versions

**Current versions (main/beta branch, as of 2026-04-24):**

- `ai`: [`7.0.0-beta.111`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/package.json?L3)
- `@ai-sdk/anthropic`: [`4.0.0-beta.37`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/package.json?L3)
- **Node requirement**: `>=18` (both packages, defined in [`engines`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/package.json?L65-L67))

> **Caution:** `main` is currently in **pre-release mode** (beta). The latest stable major versions were `ai@4.x` / `@ai-sdk/anthropic@1.x`. Before adopting, check whether you want to use the beta or wait for a stable release.

---

## 2. Claude Model IDs

Directly from [`anthropic-options.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/src/anthropic-options.ts?L4-L21):

```typescript
// Haiku:
'claude-3-haiku-20240307'      // classic, stable
'claude-haiku-4-5-20251001'    // newer generation
'claude-haiku-4-5'             // alias

// Sonnet:
'claude-sonnet-4-20250514'     // currently recommended
'claude-sonnet-4-5-20250929'
'claude-sonnet-4-5'
'claude-sonnet-4-6'

// Opus (for completeness):
'claude-opus-4-20250514'
'claude-opus-4-7'              // newest, with Adaptive Thinking
```

All IDs also accept `(string & {})` — i.e. arbitrary strings are possible for forward-compatibility.

---

## 3. `streamText` vs `generateText`

Both have identical parameter signatures. The difference lies in the return type:

- **`generateText`**: waits for the full response, returns a resolved object (`text`, `toolCalls`, `toolResults`, `usage`, `response.messages`, `steps`)
- **`streamText`**: returns immediately an object with **PromiseLike promises and streams**

### `streamText` Return API (from [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2170-L2870)):

```typescript
const result = streamText({ model, ... });

// Text-only stream — AsyncIterable<string> & ReadableStream<string>
result.textStream            // → throws Error on failure

// All events incl. tool-call, tool-result, error, reasoning
result.fullStream            // → AsyncIterable<TextStreamPart> & ReadableStream<TextStreamPart>

// Promises (consume the stream automatically):
await result.text            // string
await result.usage           // { inputTokens, outputTokens, totalTokens, cachedInputTokens, ... }
await result.totalUsage      // like usage, but sum of all steps in multi-step
await result.toolCalls       // TypedToolCall[]
await result.toolResults     // TypedToolResult[]
await result.finishReason    // 'stop' | 'length' | 'tool-calls' | ...
await result.response        // { id, modelId, timestamp, headers, messages: ResponseMessage[] }
await result.steps           // StepResult[] — all intermediate steps
await result.content         // ContentPart[] of the last step
await result.providerMetadata
```

---

## 4. Tool Definition

### `tool()` signature (from [`tool.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/20-tool.mdx) and [`tools-and-tool-calling.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx)):

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'Optional. What the tool does.',   // influences selection by LLM
  inputSchema: z.object({ ... }),                  // Zod schema OR jsonSchema() — REQUIRED
  execute: async (input, options) => {
    // options: { toolCallId, messages, abortSignal, context }
    return result;  // arbitrary type, returned as JSON to the LLM
  },
  strict: true,           // optional: strict validation (not all providers)
  outputSchema: z.object({ ... }),  // optional: for type inference
  onInputStart: (opts) => {},   // only with streamText, when arguments start streaming
  onInputDelta: ({ inputTextDelta, ...opts }) => {},
  onInputAvailable: ({ input, ...opts }) => {},
});
```

**Schema type:** Zod **or** the `jsonSchema()` helper from the SDK. **No raw JSON schema object** without the helper.

> **Important for v5/v7:** The parameter is now called **`inputSchema`** (formerly `parameters`). There is a codemod in the repo for the migration.

---

## 5. Behavior when `execute` throws

From the docs ([`tools-and-tool-calling.mdx#handling-errors`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L997-L040)):

> "When tool execution fails (errors thrown by your tool's `execute` function), the AI SDK adds them as `tool-error` content parts **to enable automated LLM roundtrips in multi-step scenarios**."

**This means:**
- **The stream does not crash.**
- The error is embedded as a `{ type: 'tool-error', toolName, toolCallId, error }` part in the steps.
- With `streamText` these appear as `tool-error` parts in the `fullStream`.
- In multi-step (`stopWhen`), the LLM is presented with the `tool-error` as a tool result and can process it in the next step.

**For your `edit_file` retry semantics:** You do **not** need to catch the error yourself and feed it back — the SDK does that automatically. You only need to set `stopWhen: isStepCount(N)` so the LLM gets multiple attempts.

---

## 6. `toolChoice`

From [`language-model.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/types/language-model.ts?L96-L106):

```typescript
type ToolChoice<TOOLS> =
  | 'auto'       // Model decides (default)
  | 'required'   // Model MUST call a tool
  | 'none'       // Model may NOT call any tools
  | { type: 'tool', toolName: Extract<keyof TOOLS, string> }  // force a specific tool
```

For the CLI use case: `toolChoice: 'auto'` (default) is correct.

---

## 7. Agentic Loop — `stopWhen` / `isStepCount`

**What counts as a "step"?** From the implementation ([`generate-text.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/generate-text/generate-text.ts?L237)) and the docs:

> "Each step represents a single LLM invocation."

A step = **one LLM call**. Tool execution itself is not a separate step.

```
Step 1: LLM → produces tool-call → tool is executed
Step 2: LLM receives tool-result → produces a response or another tool-call
```

**Default:** `stopWhen = isStepCount(1)` — i.e. without an explicit `stopWhen`, `streamText`/`generateText` performs **only a single LLM call**, no automatic agentic looping!

**On reaching the limit:** No error, clean termination. The last step result is returned normally. `isStepCount(N)` stops when N steps have been executed (N LLM calls). Default assumption in the SDK docs: `isStepCount(20)` for agentic loops.

```typescript
import { isStepCount } from 'ai';

const result = streamText({
  model,
  tools,
  stopWhen: isStepCount(10),  // max 10 LLM calls
  prompt: '...',
});
```

---

## 8. `response.messages` for Persistence

From [`tools-and-tool-calling.mdx#response-messages`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L535-L560):

```typescript
const messages: ModelMessage[] = [ /* ... */ ];

const { response } = await generateText({ model, messages, tools });
// or with streamText:
const response = await result.response;

messages.push(...response.messages);
// response.messages: Array<ResponseMessage>
// contains assistant-message (with tool-call parts) + tool-message (with tool-result parts)
```

**Format of the messages (`ModelMessage` types):**

```typescript
// Assistant message with tool call:
{
  role: 'assistant',
  content: [
    { type: 'text', text: '...' },
    { type: 'tool-call', toolCallId: '...', toolName: '...', input: { ... } }
  ]
}

// Tool result message:
{
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: '...', toolName: '...', output: { ... } }
    // or on error:
    { type: 'tool-error', toolCallId: '...', toolName: '...', error: Error }
  ]
}
```

You get all steps via `result.steps` (array of `StepResult`); each step has `response.messages`.

---

## 9. Streaming in the Terminal

### `textStream`:

```typescript
const result = streamText({ model, prompt: '...' });

// simple, correct:
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

`textStream` is `AsyncIterableStream<string>` — directly iterable, no helper needed.

### `fullStream` for tool-call events:

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
      // tool finished
      break;
    case 'tool-error':
      console.error(`Tool ${part.toolName} failed:`, part.error);
      break;
    case 'error':
      throw part.error;
  }
}
```

`fullStream` types from [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2849-L2952): `'text'`, `'reasoning'`, `'source'`, `'tool-call'`, `'tool-call-streaming-start'`, `'tool-call-delta'`, `'tool-result'`, `'tool-error'`, `'custom'`, `'error'`, `'finish'`.

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
        return fetch(url, { signal: abortSignal }); // forward
      },
    }),
  },
});
```

The `abortSignal` is automatically forwarded to all tool executes.

---

## 10. System Prompt

The SDK prefers the **`system` parameter** (string):

```typescript
streamText({
  model,
  system: 'You are a helpful CLI assistant.',
  messages: [...],
});
```

Alternatively as the first message with `role: 'system'`:
```typescript
messages: [
  { role: 'system', content: 'You are ...' },
  { role: 'user', content: '...' }
]
```

Both forms work. The `system` parameter is the recommended form in the SDK.

---

## 11. Messages Array Format

```typescript
// User message:
{ role: 'user', content: 'string' }
// or with parts:
{ role: 'user', content: [{ type: 'text', text: '...' }] }

// Assistant message:
{ role: 'assistant', content: [
  { type: 'text', text: '...' },
  { type: 'tool-call', toolCallId: '...', toolName: '...', input: { ... } }
]}

// Tool result message:
{ role: 'tool', content: [
  { type: 'tool-result', toolCallId: '...', toolName: '...', output: { ... } }
]}
```

---

## 12. Model Switching (Router)

Yes, the model is freely chosen **per `streamText` call**:

```typescript
import { anthropic } from '@ai-sdk/anthropic';

function modelRouter(intent: 'fast' | 'complex') {
  return intent === 'fast'
    ? anthropic('claude-haiku-4-5')
    : anthropic('claude-sonnet-4-20250514');
}

const result = streamText({ model: modelRouter(intent), ... });
```

In addition: `prepareStep` even allows a **per-step model switch** within the same agentic loop ([`prepareStep` docs](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx?L469-L505)).

---

## 13. Usage & Token Details

### Basic usage (from [`stream-text.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx?L2192-L2320)):

```typescript
const usage = await result.usage;  // last step
const totalUsage = await result.totalUsage;  // sum of all steps

usage.inputTokens        // number | undefined
usage.outputTokens       // number | undefined
usage.totalTokens        // number | undefined
usage.cachedInputTokens  // number | undefined (deprecated/simple view)
```

### Detailed cache tokens (consider for Phase 1!):

In the `totalUsage` object there is `inputTokenDetails`:

```typescript
totalUsage.inputTokenDetails.noCacheTokens    // non-cached input tokens
totalUsage.inputTokenDetails.cacheReadTokens  // cache reads (cheap)
totalUsage.inputTokenDetails.cacheWriteTokens // cache writes (more expensive)
totalUsage.outputTokenDetails.textTokens
totalUsage.outputTokenDetails.reasoningTokens
```

Also via the `onFinish` callback:

```typescript
streamText({
  model,
  onFinish({ usage, totalUsage, steps, text, finishReason }) {
    console.log(totalUsage.inputTokenDetails.cacheReadTokens);
    console.log(totalUsage.inputTokenDetails.cacheWriteTokens);
  }
});
```

The raw provider data is accessible via `usage.raw`.

---

## 14. Anthropic Prompt Caching

### Automatic vs. manual:

The SDK **does not provide automatic caching** — you must set `cacheControl` markers explicitly.

### Method 1: Via `providerOptions` on messages (recommended):

From the [Dynamic Prompt Caching Cookbook](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/cookbook/05-node/90-dynamic-prompt-caching.mdx):

```typescript
// Message-level (SDK translates to the last content block):
{
  role: 'user',
  content: 'my message',
  providerOptions: {
    anthropic: { cacheControl: { type: 'ephemeral' } }
  }
}
```

### Method 2: Via `providerOptions` on the `streamText` call (system prompt + tools):

From [`anthropic-options.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/anthropic/src/anthropic-options.ts?L115-L120):

```typescript
streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'Long system prompt...',
  providerOptions: {
    anthropic: {
      cacheControl: { type: 'ephemeral' }
      // optional: ttl: '5m' | '1h'
    }
  }
});
```

**What gets cached:** Anthropic caches everything up to the last block marked with `cacheControl`. Standard strategy: system prompt + tool definitions + message history (using `prepareStep` to mark the end of the latest message at every step).

**TTL:** Default `5m`, alternatively `1h` via the `ttl` field.

**Cache costs:** Cache writes cost 25% more than normal input tokens; cache reads cost 10%.

---

## 15. Testing with `MockLanguageModelV4`

**Officially supported**, importable from `ai/test`:

```typescript
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
```

**Signature** ([`mock-language-model-v4.ts`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/src/test/mock-language-model-v4.ts)):

```typescript
new MockLanguageModelV4({
  provider?: string,       // default: 'mock-provider'
  modelId?: string,        // default: 'mock-model-id'

  // doGenerate: for generateText
  doGenerate?:
    | LanguageModelV4['doGenerate']           // async function
    | LanguageModelV4GenerateResult           // a fixed result
    | LanguageModelV4GenerateResult[],        // array for sequential calls

  // doStream: for streamText
  doStream?:
    | LanguageModelV4['doStream']
    | LanguageModelV4StreamResult
    | LanguageModelV4StreamResult[],
})
```

**Example of a deterministic tool-call chain** (from the [testing docs](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/55-testing.mdx)):

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

Tool-call sequences: pass `doStream` as an **array** — each entry is the response of the Nth LLM call in the multi-step loop.

---

## 16. Telemetry (`experimental_telemetry`)

From [`telemetry.mdx`](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/content/docs/03-ai-sdk-core/60-telemetry.mdx) and the implementation:

```typescript
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

// Once at app startup:
registerTelemetry(new OpenTelemetry());

// Per-call opt-out or metadata:
streamText({
  telemetry: { functionId: 'my-agent-step' },
  // or: experimental_telemetry (deprecated alias, still works)
});
```

By default, after registration, **all AI SDK calls** are tracked automatically. No per-call opt-in is required.

---

## 17. Rate Limit / 429 Handling

From the [CHANGELOG](https://lutzleo.sourcegraph.app/r/github.com/vercel/ai/-/blob/packages/ai/CHANGELOG.md?L3987-L3990):

> "Added automatic support for respecting rate limit headers (`retry-after-ms` and `retry-after`) in the SDK's retry logic. When these headers are present and contain reasonable values (0–60 seconds), the retry mechanism will use the server-specified delay instead of exponential backoff."

**The SDK has built-in auto-retry with rate-limit awareness.** No custom wrapping is required. The retry logic respects Anthropic's `retry-after` header automatically.

---

## Summary of the critical points for your implementation

| Topic | Result |
|---|---|
| Tool error → LLM retry | Automatic via `tool-error` parts — the SDK handles it, no manual wrapping required |
| Agentic loop | `stopWhen: isStepCount(N)` — one step = one LLM call; default is 1 (no loop!) |
| Persisting messages | `result.response.messages` (or `(await result.response).messages` for streamText) |
| Terminal streaming | `for await (const chunk of result.textStream) process.stdout.write(chunk)` — done |
| Showing tool status | Subscribe to `fullStream`, react to `tool-call` / `tool-call-streaming-start` |
| Cache tokens | Via `totalUsage.inputTokenDetails.{cacheReadTokens, cacheWriteTokens}` |
| Prompt caching | Explicit: `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` |
| Testing | `MockLanguageModelV4` from `ai/test` — official, production-ready |
