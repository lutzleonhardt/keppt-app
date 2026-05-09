# Operational Logging & Observability Notes

**Date:** 2026-05-09
**Status:** Draft / architecture follow-up input

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
- Attach a correlation/request ID to every `/api/chat` request.
- Include the correlation ID in:
  - server logs
  - SSE stream error events
  - client-visible support/debug messages
  - Sentry/OpenTelemetry events
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
- Do not include full chat content by default in frontend error events.

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
- user ID hash or internal user ID, depending on privacy policy

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

What is missing:

- Operational logging model.
- Cloud observability provider decision.
- Correlation IDs.
- Error code taxonomy.
- Redaction policy.
- Retention policy.
- Frontend/server/SSE error contract.

## Proposed Follow-Up

Add a dedicated architecture task before or during Phase 2a:

**Operational observability spec**

Scope:

- Define error code taxonomy for API/SSE/client surfaces.
- Define request/correlation ID propagation.
- Choose Sentry, OpenTelemetry, or a minimal structured-log-only MVP.
- Define redaction rules for prompts, files, tool results, headers, tokens, and
  provider payloads.
- Define retention defaults.
- Define what the client displays vs. what the server logs.
- Add tests for redaction helpers and server error response shape.

This should be separate from the product `file_history` work.
