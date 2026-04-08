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

  if (parsed.command === 'codex') {
    const shim = createCodexHostShim();
    const result = shim.bootstrap({
      project: parsed.project,
      objective: parsed.objective,
      activeTask: parsed.task,
      sessionId: parsed.sessionId,
    });

    if (parsed.json) {
      writeLine(io, JSON.stringify(result, null, 2));
    } else {
      writeLine(io, `host=${result.host}`);
      writeLine(io, `session=${result.session_id}`);
      writeLine(io, `objective=${result.session.context_pack.current_focus.objective}`);
    }

    return 0;
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
