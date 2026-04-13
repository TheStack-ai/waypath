# AI External Brain & Agent Memory 시스템 경쟁 환경 조사 보고서 (2026.04 Update)

## 1. 개요
2026년 4월 현재, AI 에이전트 시장은 단순한 컨텍스트 윈도우 확장을 넘어, 지식을 구조화하고 시간에 따른 진실을 관리하는 **'External Brain'** 경쟁으로 진화했습니다. 본 보고서는 Waypath의 핵심 경쟁사 7종에 대한 최신(2026.04) 조사 결과와 전략적 차별화 포인트를 분석합니다.

## 2. 조사 대상별 상세 분석 (2026년 4월 기준)

### ① gbrain (Garry Tan / github.com/garrytan/gbrain)
- **최신 상태**: 2026년 4월 초 정식 출시. 출시 24시간 만에 5,400 Star 기록, 현재 약 **6,500+ Stars**.
- **핵심 아키텍처**: 
    - **Local-First**: 마크다운 파일(Git)을 Source of Truth로 사용.
    - **PGLite 기반**: 로컬에서 Wasm 기반 Postgres(PGLite) + pgvector로 작동하여 의존성 최소화.
    - **Dream Cycle**: 에이전트가 유휴 시간에 지식을 그래프화하고 엔티티를 추출하는 자동화 프로세스.
- **Waypath 대비**:
    - **강점**: Garry Tan의 강력한 영향력과 `gstack` 에코시스템과의 연계.
    - **약점**: "Promotion(검토 후 승격)" 프로세스보다는 "자동 추출"에 의존하여 지식 오염 위험이 존재함. Waypath는 명시적 Governance가 핵심.

### ② mem0 (mem0.ai)
- **최신 상태**: v1.5 릴리스와 함께 **"Dream Gate"** 기능 도입.
- **핵심 아키텍처**: 
    - **Hybrid Store**: Vector(검색) + Graph(관계) + Key-Value(명시적 팩트)의 3중 구조.
    - **Dream Gate**: 유휴 시간 동안 중복 메모리 병합 및 모순 해결(Contradiction Resolution)을 수행.
- **가격/라이선스**: Pro($29/mo), Teams($299/mo). OSS 버전은 무료이나 인프라 비용 별도.
- **Waypath 대비**:
    - **강점**: 90% 이상의 토큰 절감 효과와 관리형 서비스의 편리함.
    - **약점**: 데이터가 클라우드에 위치하여 보안 민감 프로젝트에서 채택이 어려움.

### ③ Honcho (Plastic Labs / honcho.dev)
- **핵심 아키텍처**: 
    - **Peer Paradigm**: 모든 에이전트와 사용자를 고유한 'Peer'로 정의하고 각 Peer의 심리적 의도와 페르소나를 모델링.
    - **Context() Endpoint**: 단순 검색이 아닌, 요약/결론/추론이 섞인 큐레이션된 컨텍스트를 제공.
- **차별화 포인트**: **"Dialectic API"**. 에이전트가 자신의 기억 시스템과 대화하며 행동 지침을 스스로 수정함.
- **Waypath 대비**:
    - **강점**: 고도의 심리 모델링과 개인화.
    - **약점**: 아키텍처가 추상적이고 복잡하여 일반적인 코딩/문서 작업용으로는 오버엔지니어링일 수 있음.

### ④ Letta / MemGPT (letta.com)
- **최신 상태**: 2026년 2월 **Letta v1.0** 아키텍처 발표.
- **핵심 아키텍처**: 
    - **Context Repositories**: Git 기반의 메모리 파일시스템. 모든 기억 수정이 커밋 이력으로 남음.
    - **Sleep-time Compute**: 에이전트가 작업 사이 시간에 메모리를 재작성하고 반추(Reflection)함.
- **Waypath 대비**:
    - **강점**: Git 기반의 완벽한 감사 추적(Audit Trail).
    - **약점**: Letta API 플랫폼 중심의 설계로, 완전한 standalone 로컬 툴로서의 경량성은 Waypath가 우위.

### ⑤ Zep (getzep.com)
- **핵심 아키텍처**: **Graphiti (Temporal Knowledge Graph)**.
    - **Validity Window**: 모든 사실에 유효 기간(Valid: From-To)을 부여하여 과거의 사실과 현재의 진실을 구분.
    - **Bi-Temporal Modeling**: 실제 사건 발생 시간(Event Time)과 에이전트가 인지한 시간(Ingestion Time)을 분리 관리.
- **Waypath 대비**:
    - **강점**: 시계열 데이터 관리와 "당시에는 무엇을 알았는가"에 대한 완벽한 추적.
    - **약점**: 구조화된 데이터(Graph)에 집중하여 비구조적 증거(Evidence)의 맥락 보존은 Waypath(MemPalace 연계)가 더 강력함.

### ⑥ Claude Code Auto Memory
- **핵심 아키텍처**: `~/.claude/` 내 `MEMORY.md` 및 토픽 파일들.
- **제한 사항**: 
    - **200라인/25KB 제한**: 초과 시 하단 내용이 무시되는 Silent Truncation 발생.
    - **수동 관리**: `/memory` 명령을 통해 사용자가 직접 내용을 정리해야 함.
- **Waypath 대비**:
    - **강점**: 별도 설정 없는 제로 설정(Zero-config) 경험.
    - **약점**: 심각한 용량 제한과 프로젝트 간 지식 고립(Silo). Waypath는 이를 극복하는 상위 뇌(Brain) 역할을 수행.

### ⑦ Codex / oh-my-codex
- **상태**: Waypath의 Primary Host 환경.
- **핵심 아키텍처**: `.omx/` 기반 Durable State와 `AGENTS.md` 기반 팀 워크플로우.
- **Waypath 연계**: Waypath는 OMX의 $ralph loop가 참고할 수 있는 가장 신뢰할 수 있는 **"Truth Engine"**으로 기능함.

---

## 3. Waypath의 독보적 차별성 (The "Why")

Waypath는 위 경쟁사들의 기능을 파편적으로 수용하면서도 다음 세 가지에서 압도적 우위를 가집니다.

1. **Truth Governance (Review-based Promotion)**:
   - gbrain이나 mem0가 "자동 추출"에 집중할 때, Waypath는 "사람(Operator)의 검토를 거친 승격"을 핵심 가치로 둡니다. 이는 프로덕션 환경에서 AI 오염을 방지하는 유일한 현실적 방법입니다.
2. **Zero-Dependency Local-First**:
   - 10,255줄의 순수 TypeScript와 0개의 npm 의존성. SQLite FTS5만을 사용하여 가장 가볍고 안전하게 로컬 데이터를 처리합니다.
3. **Truth vs Archive Separation**:
   - 현재의 진실(SQLite)과 과거의 증거(MemPalace)를 물리적으로 분리하여, 검색 성능과 증거 보존 능력을 동시에 극대화했습니다.

## 4. 향후 로드맵 제언
- **Temporal Integrity**: Zep의 Graphiti처럼 사실의 유효 기간을 SQLite 스키마에 명시적으로 도입.
- **Reflection Automation**: Letta의 Sleep-time compute 개념을 차용하여, 사용자가 `promote` 명령을 내리기 전 "승격 후보"를 미리 정제해 두는 백그라운드 프로세스 강화.
- **Ecosystem Expansion**: Claude Code의 `MEMORY.md` 용량 제한을 해결하기 위해 Waypath의 팩트를 `MEMORY.md`에 동적으로 주입해 주는 Shimming 기능 고도화.
