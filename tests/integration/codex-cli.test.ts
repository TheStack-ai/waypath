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
  const captured = captureIo();
  const exitCode = runCli(['codex', '--json', '--project', 'cli-project', '--objective', 'bootstrap', '--task', 'smoke', '--store-path', storePath], captured.io);
  assertEqual(exitCode, 0);
  assertEqual(captured.stderr.join(''), '');
  assert(captured.stdout.length > 0, 'expected JSON output');
  const result = JSON.parse(captured.stdout.join('')) as {
    host: string; status: string; session_id: string; store_path: string;
    session: { context_pack: { current_focus: { project: string; objective: string; activeTask: string }; truth_highlights: { decisions: string[] } } };
  };
  assertEqual(result.host, 'codex');
  assertEqual(result.status, 'bootstrapped');
  assertEqual(result.session_id, 'cli-project:smoke');
  assertEqual(result.store_path, storePath);
  assertDeepEqual(result.session.context_pack.current_focus, { project: 'cli-project', objective: 'bootstrap', activeTask: 'smoke' });
  assert(result.session.context_pack.truth_highlights.decisions.length > 0, 'expected persisted decision highlights');
}

export function runRecallCliIntegrationTest(): void {
  const captured = captureIo();
  const exitCode = runCli(['recall', '--json', '--query', 'memory governance'], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as { status: string; bundle?: { items: unknown[] } };
  assertEqual(result.status, 'ready');
  assert((result.bundle?.items.length ?? 0) > 0, 'expected recall bundle items');
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
  const store = createTruthKernelStorage(storePath);
  const persisted = store.getKnowledgePage(result.page!.page.page_id);
  assert(persisted?.summary_markdown.includes('# jarvis-fusion-system'), 'expected persisted page');
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
