import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { translateSignal, TranslocoPipe } from "@jsverse/transloco";
import { LucideDynamicIcon, LucideLoaderCircle } from "@lucide/angular";

import { TOOL_ICON } from "../chat-tool-icons";
import { toolLineIcon, toolLineLabel } from "../chat-tool-registry";
import type { AssistantToolMessage } from "../chat.types";

/**
 * A single tool call as one line: an icon for its kind (or a spinner while it
 * runs) plus the target it acted on. The icon token and label come from the
 * central tool registry, so a new tool needs no change here. The collapsible box
 * around a run of these lives in `keppt-tool-group`.
 */
@Component({
  selector: "keppt-tool-status-row",
  imports: [LucideDynamicIcon, LucideLoaderCircle, TranslocoPipe],
  templateUrl: "./tool-status-row.html",
  styleUrl: "./tool-status-row.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolStatusRowComponent {
  readonly message = input.required<AssistantToolMessage>();

  // The registry hands back a translation key + params (it is pure and cannot
  // translate); data-only labels flow through the `tools.line.plain` passthrough.
  private readonly lineCopy = computed(() => toolLineLabel(this.message()));
  protected readonly label = translateSignal(
    computed(() => this.lineCopy().key),
    computed(() => this.lineCopy().params ?? {}),
  );
  protected readonly icon = computed(() => TOOL_ICON[toolLineIcon(this.message())]);
}
