import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import {
  LucideChevronDown,
  LucideDynamicIcon,
  LucideLoaderCircle,
} from "@lucide/angular";

import { TOOL_ICON } from "../chat-tool-icons";
import { toolGroupIcon, toolGroupSummary } from "../chat-tool-registry";
import type { AssistantToolMessage } from "../chat.types";
import { ToolStatusRowComponent } from "./tool-status-row";

/**
 * A run of consecutive tool calls. A single call renders as a plain line; two or
 * more collapse into one box with a synthesized count header that expands to the
 * individual lines. Header copy and icon come from the central tool registry, so
 * a new tool needs no change here. `suggest_quick_replies` never reaches here —
 * it is not a `ToolName` (see chat-tool-registry.ts), so the group can never
 * count or render it.
 */
@Component({
  selector: "keppt-tool-group",
  imports: [
    ToolStatusRowComponent,
    LucideChevronDown,
    LucideDynamicIcon,
    LucideLoaderCircle,
  ],
  templateUrl: "./tool-group.html",
  styleUrl: "./tool-group.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolGroupComponent {
  readonly tools = input.required<readonly AssistantToolMessage[]>();

  protected readonly expanded = signal(false);
  protected readonly header = computed(() => toolGroupSummary(this.tools()));
  protected readonly icon = computed(() => TOOL_ICON[toolGroupIcon(this.tools())]);
  protected readonly running = computed(() =>
    this.tools().some((tool) => tool.state === "running"),
  );

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
