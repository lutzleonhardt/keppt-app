// Every error code the server can put on the wire. A new code is added here
// together with its throw site, so `ApiErrorCode` stays the closed set that
// both the server's `ApiError` and the web's guard are checked against.
export const API_ERROR_CODES = [
  "invalid_path",
  "path_out_of_scope",
  "file_not_found",
  "not_found",
  "internal_error",
  "turn_in_flight",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorPayload {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
}

/** Body of every API error response. */
export interface ErrorBody {
  readonly error: ApiErrorPayload;
}

// The one place that inspects an untrusted error body: parsed JSON, a text
// body, a `ProgressEvent` on a network failure, or `null`. A payload is
// returned only when every field has the declared shape, so the type is
// honest — an unknown code is `undefined`, never a lie typed as `ApiErrorCode`.
export function apiErrorOf(body: unknown): ApiErrorPayload | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  const { code, message, requestId } = body.error;
  if (!isApiErrorCode(code)) return undefined;
  if (typeof message !== "string" || typeof requestId !== "string")
    return undefined;
  return { code, message, requestId };
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return API_ERROR_CODES.some((code) => code === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
