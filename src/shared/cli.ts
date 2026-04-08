export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

export interface CliArgs {
  command?: string;
  json: boolean;
  project?: string;
  objective?: string;
  task?: string;
  sessionId?: string;
  help: boolean;
}

export function createCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    json: false,
    help: false,
  };

  const values = [...argv];
  if (values.length > 0 && !values[0]!.startsWith('-')) {
    args.command = values.shift();
  }

  for (let index = 0; index < values.length; index += 1) {
    const token = values[index]!;
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--project') {
      args.project = readValue(values, ++index, '--project');
      continue;
    }
    if (token === '--objective') {
      args.objective = readValue(values, ++index, '--objective');
      continue;
    }
    if (token === '--task') {
      args.task = readValue(values, ++index, '--task');
      continue;
    }
    if (token === '--session-id') {
      args.sessionId = readValue(values, ++index, '--session-id');
      continue;
    }
    throw new Error(`Unknown CLI flag: ${token}`);
  }

  return args;
}

function readValue(values: string[], index: number, flag: string): string {
  const value = values[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function formatUsage(): string {
  return [
    'Jarvis Fusion System',
    '',
    'Usage:',
    '  jarvis-fusion codex [--json] [--project <name>] [--objective <text>] [--task <text>] [--session-id <id>]',
    '  jarvis-fusion --help',
  ].join('\n');
}

export function writeLine(io: CliIo, text: string): void {
  io.stdout.write(`${text}\n`);
}
