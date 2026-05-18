import { APICallError } from "ai";

// Vercel AI SDK keeps APICallError as a thin envelope: `statusCode` and
// `isRetryable` are normalized across providers, but `responseHeaders`,
// `responseBody`, and `data` are raw provider passthrough. `err.message`
// is pre-formatted by each provider's `errorToMessage`, so we use it
// directly instead of re-parsing `data`. The two genuinely provider-
// dependent decisions — which header carries the request ID, and which
// message patterns warrant an actionable hint — live in `detectProvider`
// + the two `provider*` helpers below. Adding a new provider = extend the
// switch in those three functions; no adapter interface needed.

type Provider = "anthropic" | "openai" | "unknown";

export function formatCliError(err: unknown): string {
  if (APICallError.isInstance(err)) {
    return formatApiCallError(err);
  }
  return getErrorMessage(err);
}

function formatApiCallError(err: APICallError): string {
  const provider = detectProvider(err.url);
  const requestId = providerRequestId(provider, err.responseHeaders);
  const status = err.statusCode ? `HTTP ${err.statusCode}` : "API error";
  const suffix = requestId ? ` Request ID: ${requestId}.` : "";

  const hint = providerActionableHint(provider, err.message);
  if (hint) return `${status}: ${hint}${suffix}`;

  if (err.statusCode === 401 || err.statusCode === 403) {
    return `${status}: API rejected the credentials. Check the provider API key and account access.${suffix}`;
  }

  if (err.statusCode === 429) {
    return `${status}: Rate limit reached. Wait a bit, then retry.${suffix}`;
  }

  if (err.isRetryable) {
    return `${status}: Temporary API failure: ${err.message}${suffix}`;
  }

  return `${status}: API request failed: ${err.message}${suffix}`;
}

function detectProvider(url: string): Provider {
  if (url.includes("anthropic.com")) return "anthropic";
  if (url.includes("openai.com")) return "openai";
  return "unknown";
}

function providerRequestId(
  provider: Provider,
  headers: Record<string, string> | undefined,
): string | undefined {
  if (!headers) return undefined;
  switch (provider) {
    case "anthropic":
      return headers["request-id"];
    case "openai":
      return headers["x-request-id"];
    case "unknown":
      return (
        headers["request-id"] ??
        headers["x-request-id"] ??
        headers["x-amzn-requestid"]
      );
  }
}

// Returns a fully-formed actionable hint when the provider message matches
// a known pattern with a clear next step the generic fallback could not
// offer. The Anthropic low-balance case is the canonical example: the raw
// message names the problem but not the fix. Return `undefined` to fall
// through to status-code / generic handling.
function providerActionableHint(
  provider: Provider,
  message: string,
): string | undefined {
  switch (provider) {
    case "anthropic":
      if (/credit balance is too low/i.test(message)) {
        return "Anthropic credit balance is too low. Add credits in Anthropic Plans & Billing, then retry.";
      }
      return undefined;
    case "openai":
      // No OpenAI-specific hints yet. Add when we actually route through
      // OpenAI and see which messages warrant a CTA the generic fallback
      // can't deliver (e.g. `insufficient_quota` → billing portal link).
      return undefined;
    case "unknown":
      return undefined;
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
