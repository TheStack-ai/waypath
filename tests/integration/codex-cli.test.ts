import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { runCli } from '../../src/cli';

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
      stdout: {
        write(chunk: string) {
          stdout.push(chunk);
        },
      },
      stderr: {
        write(chunk: string) {
          stderr.push(chunk);
        },
      },
    },
  };
}

export function runCodexCliIntegrationTest(): void {
  const captured = captureIo();
  const exitCode = runCli(['codex', '--json', '--project', 'cli-project', '--objective', 'bootstrap', '--task', 'smoke'], captured.io);

  assertEqual(exitCode, 0);
  assertEqual(captured.stderr.join(''), '');
  assert(captured.stdout.length > 0, 'expected JSON output');

  const result = JSON.parse(captured.stdout.join('')) as {
    host: string;
    status: string;
    session_id: string;
    session: { context_pack: { current_focus: { project: string; objective: string; activeTask: string } } };
  };

  assertEqual(result.host, 'codex');
  assertEqual(result.status, 'bootstrapped');
  assertEqual(result.session_id, 'cli-project:smoke');
  assertDeepEqual(result.session.context_pack.current_focus, {
    project: 'cli-project',
    objective: 'bootstrap',
    activeTask: 'smoke',
  });
}
