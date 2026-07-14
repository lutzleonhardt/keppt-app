import type { MarkedExtension } from "marked";

/**
 * Renders GFM task-list checkbox tokens as styleable, state-bearing `<span>`s.
 * Necessary, not cosmetic: ngx-markdown runs marked's output through Angular's
 * HTML sanitizer (`SecurityContext.HTML`), which strips `<input>` entirely.
 * Spans and their ARIA state survive sanitization, so it can remain enabled.
 */
export const taskCheckboxExtension: MarkedExtension = {
  renderer: {
    checkbox({ checked }) {
      const doneClass = checked ? " task-checkbox--done" : "";

      return `<span class="task-checkbox${doneClass}" role="checkbox" aria-checked="${checked}" aria-disabled="true"></span> `;
    },
  },
};
