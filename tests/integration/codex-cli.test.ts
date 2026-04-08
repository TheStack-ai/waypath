import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { runCli } from '../../src/cli';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';

interface CapturedIo {
  stdout: string[];
  stderr: string[];
  io: {
    stdout: { write(chunk: string): void };
    stderr: { write(chunk: string): void };
  };
}

function captureIo(): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write(chunk: string) { stdout.push(chunk); } },
      stderr: { write(chunk: string) { stderr.push(chunk); } },
    },
  };
}

export function runCodexCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-cli-`);
  const storePath = `${root}/truth.db`;
  const importCapture = captureIo();
  const importExitCode = runCli(
    ['import-seed', '--json', '--project', 'cli-project', '--store-path', storePath],
    importCapture.io,
  );
  assertEqual(importExitCode, 0);
  const captured = captureIo();
  const exitCode = runCli(['codex', '--json', '--project', 'cli-project', '--objective', 'bootstrap', '--task', 'smoke', '--store-path', storePath], captured.io);
  assertEqual(exitCode, 0);
  assertEqual(captured.stderr.join(''), '');
  assert(captured.stdout.length > 0, 'expected JSON output');
  const result = JSON.parse(captured.stdout.join('')) as {
    host: string; status: string; session_id: string; store_path: string;
    session: {
      context_pack: {
        current_focus: { project: string; objective: string; activeTask: string };
        truth_highlights: { decisions: string[]; entities: string[] };
        graph_context: { related_entities: string[]; relationships: string[] };
        evidence_appendix: { enabled: boolean; bundles: string[] };
      };
    };
  };
  assertEqual(result.host, 'codex');
  assertEqual(result.status, 'bootstrapped');
  assertEqual(result.session_id, 'cli-project:smoke');
  assertEqual(result.store_path, storePath);
  assertDeepEqual(result.session.context_pack.current_focus, { project: 'cli-project', objective: 'bootstrap', activeTask: 'smoke' });
  assert(result.session.context_pack.truth_highlights.decisions.length > 0, 'expected persisted decision highlights');
  assert(
    result.session.context_pack.truth_highlights.entities.includes('cli-project imported reference'),
    'expected imported entity in bootstrap truth highlights',
  );
  assert(
    result.session.context_pack.graph_context.related_entities.includes('project:cli-project:imported'),
    'expected imported related entity in bootstrap graph context',
  );
  assert(
    result.session.context_pack.graph_context.relationships.some((relationship) =>
      relationship.includes('Keep source readers read-only'),
    ),
    'expected derived graph relationship summary in bootstrap output',
  );
  assertEqual(result.session.context_pack.evidence_appendix.enabled, true);
  assert(result.session.context_pack.evidence_appendix.bundles.length > 0, 'expected evidence appendix bundle ids');
}

export function runRecallCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-recall-`);
  const storePath = `${root}/truth.db`;
  const importCapture = captureIo();
  const importExitCode = runCli(
    ['import-seed', '--json', '--project', 'recall-project', '--store-path', storePath],
    importCapture.io,
  );
  assertEqual(importExitCode, 0);
  const captured = captureIo();
  const exitCode = runCli(['recall', '--json', '--query', 'source readers read-only', '--store-path', storePath], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as {
    status: string;
    bundle?: { items: { title: string }[] };
  };
  assertEqual(result.status, 'ready');
  assert((result.bundle?.items.length ?? 0) > 0, 'expected recall bundle items');
  assert(
    result.bundle?.items.some((item) => item.title.includes('Decision: Keep source readers read-only')),
    'expected truth-backed recall evidence',
  );
}

export function runPageCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-page-`);
  const storePath = `${root}/truth.db`;
  const captured = captureIo();
  const exitCode = runCli(['page', '--json', '--subject', 'jarvis-fusion-system', '--store-path', storePath], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as { status: string; page?: { page: { page_id: string }; summary_markdown: string } };
  assertEqual(result.status, 'ready');
  assert(result.page?.summary_markdown.includes('# jarvis-fusion-system'), 'expected page markdown');
  assert(result.page?.summary_markdown.includes('## Graph links'), 'expected graph-aware page section');
  const store = createTruthKernelStorage(storePath);
  const persisted = store.getKnowledgePage(result.page!.page.page_id);
  assert(persisted?.summary_markdown.includes('## Decisions'), 'expected persisted decision section');
  assert((persisted?.linked_decision_ids[0] ?? '').startsWith('decision:'), 'expected persisted decision ids');
  assert((persisted?.linked_evidence_bundle_ids.length ?? 0) > 0, 'expected persisted evidence bundle ids');
  store.close();
}

export function runPromoteCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-promote-`);
  const storePath = `${root}/truth.db`;
  const captured = captureIo();
  const exitCode = runCli(['promote', '--json', '--subject', 'remember this decision', '--store-path', storePath], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as { status: string; candidate?: { candidate_id: string; status: string } };
  assertEqual(result.status, 'ready');
  assertEqual(result.candidate?.status, 'pending_review');
  const store = createTruthKernelStorage(storePath);
  const persisted = store.getPromotionCandidate(result.candidate!.candidate_id);
  assertEqual(persisted?.status, 'pending_review');
  store.close();
}

export function runReviewCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-review-`);
  const storePath = `${root}/truth.db`;
  const promoteCapture = captureIo();
  const promoteExitCode = runCli(
    ['promote', '--json', '--subject', 'remember this review', '--store-path', storePath],
    promoteCapture.io,
  );
  assertEqual(promoteExitCode, 0);
  const promoted = JSON.parse(promoteCapture.stdout.join('')) as {
    candidate?: { candidate_id: string };
  };

  const reviewCapture = captureIo();
  const reviewExitCode = runCli(
    [
      'review',
      '--json',
      '--candidate-id',
      promoted.candidate!.candidate_id,
      '--status',
      'accepted',
      '--notes',
      'Reviewed and approved',
      '--store-path',
      storePath,
    ],
    reviewCapture.io,
  );
  assertEqual(reviewExitCode, 0);
  const reviewed = JSON.parse(reviewCapture.stdout.join('')) as {
    status: string;
    candidate?: { status: string; summary: string };
  };
  assertEqual(reviewed.status, 'ready');
  assertEqual(reviewed.candidate?.status, 'accepted');
  assert(reviewed.candidate?.summary.includes('Reviewed and approved'), 'expected review notes in candidate summary');
}
