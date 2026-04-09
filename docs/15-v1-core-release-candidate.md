# Waypath v1-core Release Candidate

## 상태

`waypath`은 현재 **terminal-installable local-first v1-core RC** 상태다.

핵심 구현:

- SQLite truth kernel
- graph-aware session-start
- truth-backed recall
- durable evidence bundle persistence
- page / promote / review loop
- review queue / inspect ergonomics
- real local Jarvis / jarvis-brain read-only import path

## 설치 방식

현재 기준 공식 사용 경로는 **로컬 tarball 설치**다.

```bash
npm run build
npm pack
npm install -g ./waypath-0.1.0-rc.0.tgz
```

필수 런타임:

- Node 25+

## 검증된 사용 흐름

```bash
waypath --help
waypath source-status --json
waypath import-seed --json --project demo-project --store-path /tmp/jf-demo.db
waypath import-local --json --project local-project --store-path /tmp/jf-local.db
waypath codex --json --project demo-project --objective bootstrap --task smoke --store-path /tmp/jf-demo.db
waypath recall --json --query "shared backend" --store-path /tmp/jf-demo.db
waypath page --json --subject demo-project --store-path /tmp/jf-demo.db
waypath promote --json --subject "remember this decision" --store-path /tmp/jf-demo.db
waypath review --json --candidate-id <id> --status accepted --notes "approved" --store-path /tmp/jf-demo.db
waypath review-queue --json --store-path /tmp/jf-demo.db
waypath inspect-page --json --page-id page:session:demo-project --store-path /tmp/jf-demo.db
waypath inspect-candidate --json --candidate-id <id> --store-path /tmp/jf-demo.db
```

## 포함 범위

- shared backend + thin host shim
- explicit read-only source adapters
- namespaced import normalization
- source-aware prioritization
- contradiction / stale / pending-review surfacing
- operator-facing inspect / review queue flows

## 제외 범위

- MemPalace real adapter
- registry publish
- complete Claude parity
- adaptive learning/ranking loop
- hosted or multi-user operation

## final verification baseline

- `npm run typecheck`
- `npm test`
- `npm pack --dry-run`
- fresh prefix install from packed tarball
- install smoke:
  - `waypath --help`
  - `waypath source-status --json`
  - `waypath import-seed --json ...`

## 운영 원칙

- source systems are read-only
- truth owner remains the local SQLite store
- promotion remains explicit and reviewable
- packed artifact should contain only runtime files + README
