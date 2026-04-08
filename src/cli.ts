import { createLocalImportManifest, runBootstrapImport, toImportResult } from './jarvis_fusion/bootstrap-import.js';
import { probeLocalSourceAdapters } from './jarvis_fusion/source-readers-local.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from './jarvis_fusion/truth-kernel/index.js';
import { createFacade } from './facade';
import { createCodexHostShim } from './host-shims';
import { createCliArgs, formatUsage, writeLine, type CliIo } from './shared/cli';

export function runCli(argv: string[], io: CliIo): number {
  let parsed;
  try {
    parsed = createCliArgs(argv);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    io.stderr.write(`${formatUsage()}\n`);
    return 1;
  }

  if (parsed.help || !parsed.command) {
    writeLine(io, formatUsage());
    return 0;
  }

  const facadeOptions = parsed.storePath ? { storePath: parsed.storePath, autoSeed: true } : { autoSeed: true };

  if (parsed.command === 'codex') {
    const facade = createFacade(facadeOptions);
    try {
      const shim = createCodexHostShim({ facade });
      const result = shim.bootstrap({
        project: parsed.project,
        objective: parsed.objective,
        activeTask: parsed.task,
        sessionId: parsed.sessionId,
        storePath: parsed.storePath,
      });

      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `host=${result.host}`);
        writeLine(io, `session=${result.session_id}`);
        writeLine(io, `store=${result.store_path}`);
        writeLine(io, `objective=${result.session.context_pack.current_focus.objective}`);
      }

      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'recall') {
    const query = parsed.query ?? parsed.subject;
    if (!query) {
      io.stderr.write('Missing value for --query\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.recall(query);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'page') {
    const subject = parsed.subject ?? parsed.project;
    if (!subject) {
      io.stderr.write('Missing value for --subject\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.page(subject);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.page?.summary_markdown ?? result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'import-seed') {
    const project = parsed.project ?? 'jarvis-fusion-system';
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      const result = toImportResult(
        runBootstrapImport(
          store,
          {
            manifest_id: `demo-import:${project}`,
            import_mode: 'bootstrap',
            reader_names: ['demo-source'],
          },
          project,
        ),
        storePath,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'import-local') {
    const project = parsed.project ?? 'jarvis-fusion-system';
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      const manifest = createLocalImportManifest(project);
      if (manifest.reader_names.length === 0) {
        io.stderr.write('No local source readers are available for import-local\n');
        return 1;
      }
      const result = toImportResult(runBootstrapImport(store, manifest, project), storePath);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'source-status') {
    const result = {
      operation: 'source-status' as const,
      status: 'ready' as const,
      sources: probeLocalSourceAdapters(),
    };
    if (parsed.json) {
      writeLine(io, JSON.stringify(result, null, 2));
    } else {
      for (const source of result.sources) {
        writeLine(
          io,
          `${source.reader}: ${source.available ? source.adapter_status : 'missing'}${source.path ? ` (${source.path})` : ''}`,
        );
      }
    }
    return 0;
  }

  if (parsed.command === 'promote') {
    const subject = parsed.subject ?? parsed.query;
    if (!subject) {
      io.stderr.write('Missing value for --subject\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.promote(subject);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'review') {
    if (!parsed.candidateId) {
      io.stderr.write('Missing value for --candidate-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    if (!parsed.status) {
      io.stderr.write('Missing value for --status\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const validStatuses = new Set([
      'pending_review',
      'accepted',
      'rejected',
      'needs_more_evidence',
      'superseded',
    ]);
    if (!validStatuses.has(parsed.status)) {
      io.stderr.write(`Invalid review status: ${parsed.status}\n`);
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.review(
        parsed.candidateId,
        parsed.status as 'accepted' | 'pending_review' | 'rejected' | 'needs_more_evidence' | 'superseded',
        parsed.notes,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'review-queue') {
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.reviewQueue();
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `pending-review=${result.pending_review.length}`);
        writeLine(io, `stale-pages=${result.stale_pages.length}`);
        writeLine(io, `contradictions=${result.open_contradictions.length}`);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'inspect-page') {
    if (!parsed.pageId) {
      io.stderr.write('Missing value for --page-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.inspectPage(parsed.pageId);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.page?.summary_markdown ?? result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'inspect-candidate') {
    if (!parsed.candidateId) {
      io.stderr.write('Missing value for --candidate-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.inspectCandidate(parsed.candidateId);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.candidate?.summary ?? result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  io.stderr.write(`Unknown command: ${parsed.command}\n`);
  io.stderr.write(`${formatUsage()}\n`);
  return 1;
}

if (typeof process !== 'undefined') {
  const exitCode = runCli(process.argv.slice(2), process);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
