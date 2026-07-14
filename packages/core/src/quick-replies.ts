export const QUICK_REPLY_LABEL_MAX_LENGTH = 40;

// Keep a generous input ceiling so slightly overlong model output reaches the
// tool and can be normalized instead of failing before `execute`. This is a
// safety bound, not the UI contract; the tool schema still asks for labels no
// longer than QUICK_REPLY_LABEL_MAX_LENGTH.
export const QUICK_REPLY_LABEL_INPUT_MAX_LENGTH = 200;

export function normalizeQuickReplyLabel(label: string): string {
  const compact = label.trim().replace(/\s+/gu, " ");
  if (compact.length <= QUICK_REPLY_LABEL_MAX_LENGTH) return compact;

  // Build by Unicode code point while budgeting the UTF-16 length used by
  // Zod's string max check. This avoids cutting a surrogate pair in half.
  let prefix = "";
  for (const character of compact) {
    if (prefix.length + character.length > QUICK_REPLY_LABEL_MAX_LENGTH - 1) {
      break;
    }
    prefix += character;
  }
  // This is intentionally a hard fallback clip: retaining all available
  // prefix information is safer than collapsing to an arbitrarily early word.
  return `${prefix.trimEnd()}…`;
}

export function preprocessQuickReplyLabel(value: unknown): unknown {
  if (
    typeof value !== "string" ||
    value.length > QUICK_REPLY_LABEL_INPUT_MAX_LENGTH
  ) {
    return value;
  }
  return normalizeQuickReplyLabel(value);
}
