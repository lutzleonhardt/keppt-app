# Eval Scenario Backlog

This backlog preserves scenario candidates for a future judge-based evaluation
plan. No eval runner is currently scheduled. Promote a candidate into
`docs/evals/scenario-XX-.../` only when repeated-run infrastructure, a separate
calibrated judge, and aggregate reporting are in scope, and when the case is
backed by a real dogfooding trace or a concrete prompt-risk review.

## High-Value Candidates

- **Auto-Replan day boundary**: prove the opener handles a reproducible day
  change, persists `autoReplanRanFor`, and presents stale daily-plan items
  without reviving the old archive-move behavior.
- **Cross-day completion**: a user reports that an item from yesterday's plan
  is now done; the assistant should close the source plan item, update canonical
  task state, and log the event on the correct date with source annotation.
- **Cross-day deferral**: a user says yesterday's planned item was not done and
  should move to today; the assistant should distinguish deferral from
  completion and avoid creating duplicate canonical tasks.
- **R6 past-date correction**: a user corrects a transient daily-only item that
  actually happened yesterday; the assistant should update yesterday's daily,
  not today's log.
- **Inbox cleanup / lost-task detector**: inbox triage should reduce inbox
  clutter without losing task strings or silently misclassifying canonical
  buckets.

## Lower-Value Smoke Candidates

These were part of the old deterministic E2E sketch but should not be promoted
unless a real trace shows a failure that deterministic tests do not cover:

- Read-only "what is on today?"
- Create a simple inbox task.
- Move a simple task from Inbox to Next Actions.
- Complete a simple canonical task.
- Count history-log entries for basic mutating turns.

Those checks mostly prove CLI/provider/tool-loop wiring or repository behavior.
The eval suite should focus on semantic GTD judgment where model variance and
prompt quality matter.
