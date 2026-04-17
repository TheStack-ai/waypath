# Contributing to Waypath

Thanks for your interest in making waypath better. This is a short, practical guide.

## What we want

Waypath is a **local-first, single-binary CLI**. PRs are most welcome when they:

- fix a real bug with a reproduction,
- add a **host shim** for a concrete agent (Cursor, Continue, Aider, Cline, …),
- add a **source adapter** for a concrete memory tool (mem0, zep, letta, Obsidian, …),
- improve retrieval precision or benchmark scores,
- improve docs, examples, or onboarding.

PRs that are less likely to merge:

- introduce a hard cloud dependency or telemetry,
- break the zero-config default (`waypath --help` must work with no env vars),
- expand the public CLI surface without a linked use case.

## Dev setup

```bash
git clone https://github.com/TheStack-ai/waypath.git
cd waypath
npm install          # installs optional better-sqlite3 fallback
npm run build
npm test             # 131 tests, no network needed
```

Requirements: **Node.js ≥ 22**. No cloud accounts, no env vars.

## Local smoke

```bash
node dist/src/cli.js --help
node dist/src/cli.js source-status --json
node dist/src/cli.js codex --json \
  --project demo --objective test --task smoke \
  --store-path /tmp/demo.db
```

## Running tests

- `npm test` — build + all 131 tests
- `npm run build` — transform TS → JS (syntax only; see `#typecheck` issue for real `tsc` integration)

## Code style

- ES modules only; prefer Node 22 built-ins over npm deps
- No cloud SDKs, no telemetry, no auto-network
- New CLI commands require a **unit test**
- New facade verbs require an **integration test**
- Follow the existing file layout under `src/` (truth-kernel, archive-kernel, ontology-support, promotion, facade, host-shims, mcp, shared)

## PR flow

1. **Open an issue first** if the change is non-trivial — saves round-trips.
2. Branch off `main`.
3. Keep PRs **scoped** (under 400 LOC when possible).
4. Run `npm test` before pushing.
5. Update the README command table if you add a command.
6. Use **Conventional Commits** for the first line (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
7. Fill the PR template honestly — "verification" section matters most.

## What makes a great first contribution

- Look for issues labeled **`good first issue`** or **`help wanted`**.
- Host shims and source adapters are the highest-leverage external contributions — they directly extend waypath's reach without touching the core.
- Docs/screenshots/GIFs in the README are always welcome.

## Questions

Open a GitHub **Discussion** or an **issue** — Korean or English both fine.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
