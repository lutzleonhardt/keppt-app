import { APICallError } from "ai";

export function formatCliError(err: unknown): string {
  if (APICallError.isInstance(err)) {
    return formatApiCallError(err);
  }
  return getErrorMessage(err);
}

function formatApiCallError(err: APICallError): string {
  const providerMessage = extractProviderMessage(err.data) ?? err.message;
  const requestId = err.responseHeaders?.["request-id"];
  const status = err.statusCode ? `HTTP ${err.statusCode}` : "API error";
  const suffix = requestId ? ` Request ID: ${requestId}.` : "";

  if (isLowBalanceMessage(providerMessage)) {
    return `${status}: Anthropic credit balance is too low. Add credits in Anthropic Plans & Billing, then retry.${suffix}`;
  }

  if (err.statusCode === 401 || err.statusCode === 403) {
    return `${status}: Anthropic rejected the API credentials. Check ANTHROPIC_API_KEY and account access.${suffix}`;
  }

  if (err.statusCode === 429) {
    return `${status}: Anthropic rate limit reached. Wait a bit, then retry.${suffix}`;
  }

  if (err.isRetryable) {
    return `${status}: Temporary Anthropic API failure: ${providerMessage}${suffix}`;
  }

  return `${status}: Anthropic API request failed: ${providerMessage}${suffix}`;
}

function extractProviderMessage(data: unknown): string | undefined {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error !== null &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }
  return undefined;
}

function isLowBalanceMessage(message: string): boolean {
  return /credit balance is too low/i.test(message);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
