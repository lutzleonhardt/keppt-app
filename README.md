# GTD Companion

pnpm monorepo.

- `apps/cli` — CLI entrypoint (Phase 1).
- `packages/core` — domain logic: file repository, history log, (later) prompt, tools, session.

## Prerequisites

- Node `>=18` (`.nvmrc` pins 20)
- pnpm

## Commands

```sh
pnpm install
pnpm -r build
pnpm -r test
```

See `docs/specs/architecture.md` and `docs/plans/phase-1-cli.md` for roadmap.
