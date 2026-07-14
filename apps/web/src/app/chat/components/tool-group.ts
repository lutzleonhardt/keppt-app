import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import { translateSignal, TranslocoPipe } from "@jsverse/transloco";
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
    TranslocoPipe,
  ],
  templateUrl: "./tool-group.html",
  styleUrl: "./tool-group.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolGroupComponent {
  readonly tools = input.required<readonly AssistantToolMessage[]>();

  protected readonly expanded = signal(false);
  // The registry hands back a translation key + params (it is pure and cannot
  // translate). translateSignal subscribes eagerly, so the empty-group fallback
  // IS evaluated (the template's ≥2 guard only gates rendering) — "" is safe
  // because Transloco returns empty keys as-is without invoking the missing-key
  // handler. Don't swap it for a real-looking sentinel key.
  private readonly headerCopy = computed(() => toolGroupSummary(this.tools()));
  protected readonly header = translateSignal(
    computed(() => this.headerCopy()?.key ?? ""),
    computed(() => this.headerCopy()?.params ?? {}),
  );
  protected readonly icon = computed(() => TOOL_ICON[toolGroupIcon(this.tools())]);
  protected readonly running = computed(() =>
    this.tools().some((tool) => tool.state === "running"),
  );

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
