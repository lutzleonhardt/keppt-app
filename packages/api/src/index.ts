// The HTTP wire contract shared by `apps/server` and `apps/web`. Browser-safe
// by rule: nothing here imports Node or the main `@gtd/core` barrel, only
// `@gtd/core/layout`. `tsconfig.json` (`types: []`) rejects a direct `node:*`
// import in these sources; the barrel rule is kept by review, because a
// cross-package import reaches only `.d.ts` files. `ng build` fails if broken.
export {
  API_ERROR_CODES,
  apiErrorOf,
  type ApiErrorCode,
  type ApiErrorPayload,
  type ErrorBody,
} from "./errors.js";
export type { FileContentBody } from "./files.js";
export type { DailyNoteRef } from "./daily-notes.js";
