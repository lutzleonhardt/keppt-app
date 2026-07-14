import {
  LucideFilePen,
  LucideFilePlus,
  LucideFileText,
  LucideFolderOpen,
  LucideListTree,
  LucideSearch,
  type LucideIcon,
} from "@lucide/angular";

import type { ToolIconName } from "./chat-tool-registry";

/**
 * The view-layer half of the tool registry: it binds each framework-agnostic
 * `ToolIconName` token to its Lucide component. Kept apart from
 * `chat-tool-registry.ts` so that file (and its pure tests) never import the
 * Angular runtime — only the components that actually render icons pull this in.
 *
 * Being a `Record<ToolIconName, …>` makes it compiler-enforced: introduce a new
 * glyph token in the registry and the build fails until it has a component here.
 * `LucideDynamicIcon` accepts the component directly via `[lucideIcon]`, so no
 * `provideLucideIcons` registration is needed.
 */
export const TOOL_ICON: Record<ToolIconName, LucideIcon> = {
  "file-text": LucideFileText,
  "folder-open": LucideFolderOpen,
  search: LucideSearch,
  "file-pen": LucideFilePen,
  "file-plus": LucideFilePlus,
  "list-tree": LucideListTree,
};
