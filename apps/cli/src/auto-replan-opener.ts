// CLI adapter for the Auto-Replan opener: decides whether today's opener
// runs, prints the banner and hands the fabricated prefix to the shared
// turn engine. Called at startup and from the day-rollover guard.

import {
  buildAutoReplanOpener,
  formatToday,
  gatherAutoReplanContext,
  runTurn,
} from "@gtd/core";
import type { TurnDeps, TurnRefs } from "./turn-loop.js";
import {
  createEngineDeps,
  createTerminalSink,
  renderTurnResult,
} from "./turn-adapter.js";

const AUTO_REPLAN_BANNER =
  "[Auto-Replan] Tagesstart-Check über letzte 5 Dailies + Next-Actions/Waiting…";

export async function maybeRunAutoReplanOpener(
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<void> {
  // The opener opens a day: it runs only into an empty session. Whatever is
  // already there — its own turn, a user turn after a failed or skipped
  // opener — means the day has started without it.
  if (refs.session.messages.length > 0) return;
  await runAutoReplanOpener(deps, refs);
}

export async function runAutoReplanOpener(
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<void> {
  const today = formatToday(refs.turnNow);
  const context = await gatherAutoReplanContext(deps.repo, today);
  // An empty vault gets no opener: the first-contact welcome is the web
  // UI's job.
  if (context.isEmpty) return;

  deps.terminal.autoReplanBanner(AUTO_REPLAN_BANNER);
  refs.lastQuickReplies = null;
  const { sink, pendingChips } = createTerminalSink(deps.terminal, refs);
  const result = await runTurn(createEngineDeps(deps, refs, sink), {
    kind: "opener",
    session: refs.session,
    openerMessages: buildAutoReplanOpener(context, today),
  });
  // Chips of a turn that never reached the disk would answer into a
  // context the next request no longer contains.
  if (result.outcome !== "ok") refs.lastQuickReplies = null;
  await renderTurnResult(deps, result, pendingChips());
}
