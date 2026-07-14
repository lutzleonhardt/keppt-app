import { Marked } from "marked";
import { describe, expect, it } from "vitest";

import { taskCheckboxExtension } from "./vault-markdown";

describe("taskCheckboxExtension", () => {
  it("renders GFM checkbox tokens as sanitizer-safe, state-bearing spans", () => {
    const parser = new Marked(taskCheckboxExtension);
    const html = parser.parse("- [ ] Offen\n- [x] Erledigt", {
      async: false,
    });

    expect(html).toContain(
      '<span class="task-checkbox" role="checkbox" aria-checked="false" aria-disabled="true"></span> Offen',
    );
    expect(html).toContain(
      '<span class="task-checkbox task-checkbox--done" role="checkbox" aria-checked="true" aria-disabled="true"></span> Erledigt',
    );
    expect(html).not.toContain("<input");
  });

  it("leaves identical raw HTML untouched because it is not a checkbox token", () => {
    const parser = new Marked(taskCheckboxExtension);
    const rawInput = '<input disabled="" type="checkbox">';

    expect(parser.parse(rawInput, { async: false })).toContain(rawInput);
  });
});
