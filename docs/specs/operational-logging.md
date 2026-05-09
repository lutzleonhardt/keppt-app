# Operational Logging & Observability Notes

**Date:** 2026-05-09
**Status:** Architecture decision input for Phase 1 follow-up and Phase 2a

## Why This Exists

During the manual Task-3 CLI smoke test, an Anthropic account with insufficient
credit balance caused the Vercel AI SDK to emit a raw `APICallError`. The CLI
catch handler already produced a concise user-facing message, but the SDK's
default stream `onError` handler printed the complete error object to stderr
first, including stack trace, request body values, response headers, and the
provider response body.

That exposed a missing architecture decision: Keppt already has a product audit
trail (`file_history`), but it does not yet have an operational logging and
observability design for CLI, backend, and Web/App clients.

## Current Decision

Operational logging becomes a small shared foundation, not a framework:

- `packages/core` defines a minimal `Logger` / `LogEvent` contract and shared
  error/redaction helpers.
- `packages/core` must not import or call `console`, Pino, Sentry,
  OpenTelemetry, browser APIs, or Capacitor APIs.
- CLI, backend, and frontend each provide their own logger implementation.
- User-facing output is separate from operational logging:
  - CLI terminal output uses a terminal output sink.
  - Backend streaming uses an SSE output sink.
  - Angular/Capacitor rendering uses UI state and components.
- Pino is the backend's normal structured logger.
- Sentry is an error/incident sink, not a logger replacement.
- OpenTelemetry is deferred until distributed tracing is useful.
- For the MVP, the internal Supabase `userId` may be included directly in
  operational metadata. Hashing can be revisited with the privacy policy.

Suggested shared shape:

```ts
interface Logger {
  debug(event: LogEvent): void;
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
}

interface LogEvent {
  message: string;
  code?: string;
  phase?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  err?: unknown;
  meta?: Record<string, unknown>;
}
```

Runtime implementations:

| Runtime | Implementation | Behavior |
|---------|----------------|----------|
| CLI | `CliLogger` | short terminal summary + vault-local JSONL diagnostics |
| Backend | `BackendLogger` | Pino JSON to stdout/stderr + optional redacted Sentry sink |
| Web/Capacitor app | `FrontendLogger` | dev console in development + Sentry client events in production |
| Tests | `NoopLogger` / `MemoryLogger` | no output or in-memory assertions |

## Core Distinction

Keppt needs two separate kinds of history:

1. **Product audit trail**
   - Answers: "What did Keppt change in my GTD files?"
   - Current mechanism: `file_history` table in Supabase or local
     `.keppt/file-history.jsonl`.
   - User-facing trust feature: History/changelog view.
   - Contains file versions, change summaries, actor (`llm`, `user`,
     `system`), timestamps.

2. **Operational diagnostics**
   - Answers: "Why did the app, server, stream, tool loop, or provider call
     fail?"
   - Current CLI mechanism: `.keppt/logs/cli-errors.jsonl`.
   - Future backend mechanism: structured server logs plus an observability
     backend such as Sentry and/or OpenTelemetry.
   - Contains exceptions, stack traces, provider status codes, request IDs,
     redacted headers, retryability, runtime phase, and correlation IDs.

These must not be mixed. `file_history` is part of the user's product data and
trust surface. Operational logs are developer/operator diagnostics with
different retention, privacy, and redaction requirements.

## Current CLI Decision

For the local CLI, the chosen behavior is:

- Print a short, stable terminal error summary.
- Disable the Vercel AI SDK beta's default raw stream logger with
  `onError: () => {}`.
- Write the full diagnostic record to:

  ```text
  VAULT_PATH/.keppt/logs/cli-errors.jsonl
  ```

- Continue the REPL after non-abort stream failures.
- Preserve the existing abort behavior for Ctrl+C.

Example terminal output:

```text
Stream error: HTTP 400: Anthropic credit balance is too low. Add credits in Anthropic Plans & Billing, then retry. Request ID: req_...
Details logged to: /path/to/vault/.keppt/logs/cli-errors.jsonl
```

The CLI log is intentionally local and verbose because Phase 1 is a
single-user dogfooding environment. The developer wants to inspect real provider
failures without losing useful debugging context.

## CLI Log Contents

For `APICallError`, the CLI diagnostic entry may include:

- timestamp
- context, such as `{ phase: "stream" }`
- error kind/name/message/stack
- provider URL
- status code
- retryability
- request body values
- response body
- provider data
- response headers with sensitive headers redacted

Currently redacted headers:

- `set-cookie`
- `cookie`
- `authorization`
- `x-api-key`
- `api-key`

Important caveat: `requestBodyValues` can contain prompt and message content.
After Task 4, it may include active GTD file context. That is acceptable for a
local, developer-owned CLI log, but it is not acceptable as-is for cloud
observability.

## Future Backend / Web-App Direction

Before production deployment, the architecture should specify an operational
observability layer for the Express/Fastify backend and the Angular/Capacitor
client.

Recommended direction:

- Use structured JSON logs in the backend.
- Write backend production logs to stdout/stderr, not long-lived container
  files. The hosting platform is responsible for collection, rotation, and
  retention.
- Attach a correlation/request ID to every `/api/chat` request.
- Include the correlation ID in:
  - server logs
  - SSE stream error events
  - client-visible support/debug messages
  - Sentry/OpenTelemetry events
- Attach `userId` after auth and `sessionId` once the chat session is known.
- Capture backend exceptions in Sentry or an equivalent service.
- Capture frontend exceptions separately, with release/version metadata.
- Use OpenTelemetry if distributed tracing becomes useful; Sentry alone may be
  enough for the MVP.
- Keep user-facing error responses short and stable.
- Keep developer-facing diagnostic events rich but redacted.

## Suggested Error Surfaces

### CLI

- Human-readable stderr summary.
- Vault-local JSONL diagnostic file.
- No cloud upload.
- Full request diagnostics allowed, because the environment is explicitly
  local and developer-owned.

### Backend API

- Return stable error objects to the client:

  ```json
  {
    "error": {
      "code": "provider_low_balance",
      "message": "The AI provider is temporarily unavailable.",
      "requestId": "..."
    }
  }
  ```

- Do not send stack traces, provider request bodies, raw provider responses, or
  secrets to the client.
- Log full diagnostics server-side after redaction.

### SSE Chat Stream

- Emit a structured stream error event before closing the stream when possible.
- Include a stable error code and correlation ID.
- The client can show a friendly message and offer retry.

### Frontend

- Show a user-appropriate message.
- Include a support/debug ID when useful.
- Send client-side exceptions to Sentry with release/environment metadata.
- Attach platform, app version, `userId`, and `requestId` where available.
- Do not include full chat content by default in frontend error events.

### Backend Structured Log Example

```json
{
  "timestamp": "2026-05-09T12:00:00.000Z",
  "level": "error",
  "service": "api",
  "env": "production",
  "requestId": "req_...",
  "userId": "00000000-0000-0000-0000-000000000000",
  "sessionId": "00000000-0000-0000-0000-000000000001",
  "route": "POST /api/chat",
  "phase": "provider_stream",
  "provider": "anthropic",
  "model": "claude-haiku-4-5",
  "statusCode": 400,
  "errorCode": "provider_low_balance",
  "retryable": false,
  "durationMs": 1234
}
```

This is the shape cloud logs should prefer: enough metadata to debug routing,
provider, cost, and correlation problems without sending user content.

## Redaction Rules Needed For Cloud Logging

Before sending operational events to any cloud service, define redaction for:

- API keys and bearer tokens.
- Cookies and session headers.
- Supabase JWTs.
- OAuth provider tokens.
- Stripe/RevenueCat secrets.
- Full prompt/message bodies.
- GTD file contents.
- User profile contents.
- Tool result payloads that contain file content.
- Provider request/response bodies.

For cloud observability, prefer structured metadata over raw payloads:

- model ID
- provider name
- status code
- retryability
- request ID
- route/phase
- tool name
- file path, if not sensitive
- token counts
- duration
- internal user ID for the MVP; hash later if required by the privacy policy

## Implementation Tasks

### Phase 1 Follow-Up: Shared Logging Abstraction

Add a task after the current CLI observability follow-ups:

- Define `Logger` and `LogEvent` in the shared layer.
- Add `NoopLogger` and `MemoryLogger` for tests.
- Move shared-core console usage behind injected logging.
- Move CLI UX output behind a terminal output sink, separate from logging.
- Keep the current `.keppt/logs/cli-errors.jsonl` behavior for verbose local
  diagnostics.
- Verify `packages/core` has no direct `console.*`, Pino, or Sentry usage.

### Phase 2a.0: Backend Operational Logging Foundation

Before or at the start of the Express/Fastify backend task:

- Add request ID middleware.
- Add `BackendLogger` wrapping Pino.
- Attach `userId` after auth.
- Emit metadata-only JSON logs to stdout/stderr.
- Define the stable API error response and SSE error event shape.
- Add redaction helper tests and server error-shape tests.
- Do not require Sentry yet.

### Phase 2a.x: Sentry Integration

Once backend and app error surfaces exist:

- Add backend Sentry sink for redacted exceptions.
- Add Angular/Capacitor `FrontendLogger`.
- Integrate Angular `ErrorHandler`.
- Attach release, environment, platform, `userId`, and `requestId`.
- Correlate frontend and backend failures via `requestId`.

## Retention

Open decision:

- CLI logs can probably stay in the vault until manually deleted.
- Backend logs should have a defined retention window.
- Sentry/OpenTelemetry retention should match the privacy policy and product
  tier expectations.
- Logs containing user content should either be avoided, aggressively redacted,
  or retained for a very short period.

## Relationship To Existing Architecture

The current `architecture.md` already says:

- The app uses a custom Node process rather than serverless partly because of
  "Full control: Timeouts, connection pooling, caching, logging".
- `file_history` is the source of truth for user-visible change history.
- The History View reads `file_history`.

This note is now reflected in the architecture as:

- Operational logging model.
- Shared logger contract.
- Runtime-specific logger implementations.
- Correlation IDs.
- Error code taxonomy.
- Redaction policy.
- Retention policy.
- Frontend/server/SSE error contract.

## Proposed Follow-Up

The dedicated observability work is split into small tasks:

- Phase 1 follow-up: shared `Logger` abstraction + CLI logger/output cleanup.
- Phase 2a.0: backend Pino/requestId/API/SSE error foundation.
- Phase 2a.x: Sentry backend + frontend integration.

This should be separate from the product `file_history` work.
