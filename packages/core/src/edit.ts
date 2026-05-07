export interface SearchReplaceEdit {
  search: string;
  replace: string;
}

export interface EditError {
  failedSearch: string;
  matchCount: number;
  currentContent: string;
}

export interface EditResult {
  ok: boolean;
  error?: EditError;
}

export type PlanResult =
  | { ok: true; next: string }
  | { ok: false; error: EditError };

// Atomic multi-edit planner. Validates every edit's uniqueness against the
// ORIGINAL content (never a partially-mutated buffer), so a later edit cannot
// accidentally target text produced by an earlier replace. Overlap between two
// edits' spans in the original is reported as matchCount:0 on the edit that
// would be destroyed. All-or-nothing: on any failure, `working` is not
// returned and callers must not mutate storage.
export function planAndApplyEdits(
  original: string,
  edits: readonly SearchReplaceEdit[],
): PlanResult {
  if (edits.length === 0) {
    return {
      ok: false,
      error: { failedSearch: "", matchCount: 0, currentContent: original },
    };
  }

  const planned: Array<{ edit: SearchReplaceEdit; pos: number; inputIndex: number }> = [];
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;
    if (edit.search === "") {
      return {
        ok: false,
        error: { failedSearch: "", matchCount: 0, currentContent: original },
      };
    }
    const count = countOccurrences(original, edit.search);
    if (count !== 1) {
      return {
        ok: false,
        error: { failedSearch: edit.search, matchCount: count, currentContent: original },
      };
    }
    planned.push({ edit, pos: original.indexOf(edit.search), inputIndex: i });
  }

  // Range-overlap check in original coordinates. Two edits whose search spans
  // touch would corrupt each other regardless of apply order.
  const sortedByPos = [...planned].sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < sortedByPos.length; i++) {
    const prev = sortedByPos[i - 1]!;
    const cur = sortedByPos[i]!;
    const prevEnd = prev.pos + prev.edit.search.length;
    if (cur.pos < prevEnd) {
      const later = cur.inputIndex > prev.inputIndex ? cur.edit : prev.edit;
      return {
        ok: false,
        error: { failedSearch: later.search, matchCount: 0, currentContent: original },
      };
    }
  }

  // Apply in reverse position order so that earlier (lower-index) spans stay
  // at the positions the plan computed against the original content.
  const applyOrder = [...planned].sort((a, b) => b.pos - a.pos);
  let working = original;
  for (const { edit, pos } of applyOrder) {
    working = working.slice(0, pos) + edit.replace + working.slice(pos + edit.search.length);
  }
  return { ok: true, next: working };
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count++;
    // Advance by one position so overlapping starts (e.g. "aa" in "aaa")
    // are reported as multiple matches. The "exactly one match" contract
    // depends on counting every possible start offset; advancing by
    // needle.length would silently treat a self-overlapping search as
    // unique and apply the first replacement instead of aborting.
    from = idx + 1;
  }
}
