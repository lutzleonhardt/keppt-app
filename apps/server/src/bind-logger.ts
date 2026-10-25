import type { LogEvent, Logger } from "@gtd/core";

export interface LogCorrelation {
  requestId?: string;
  userId?: string;
  sessionId?: string;
}

// Returns a Logger that fills in correlation fields the event itself leaves
// unset. Knows nothing about Express; the middleware that owns a field is
// the one that binds it.
export function bindLogger(inner: Logger, fields: LogCorrelation): Logger {
  const merge = (event: LogEvent): LogEvent => ({
    ...event,
    requestId: event.requestId ?? fields.requestId,
    userId: event.userId ?? fields.userId,
    sessionId: event.sessionId ?? fields.sessionId,
  });
  return {
    debug: (event) => inner.debug(merge(event)),
    info: (event) => inner.info(merge(event)),
    warn: (event) => inner.warn(merge(event)),
    error: (event) => inner.error(merge(event)),
  };
}
