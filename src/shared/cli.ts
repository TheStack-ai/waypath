export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stdin?: NodeJS.ReadableStream;
}

export interface CliArgs {
  command?: string;
  json: boolean;
  project?: string;
  objective?: string;
  task?: string;
  sessionId?: string;
  storePath?: string;
  query?: string;
  subject?: string;
  candidateId?: string;
  pageId?: string;
  status?: string;
  notes?: string;
  entityId?: string;
  pattern?: string;
  key?: string;
  scopeRef?: string;
  keepPreferenceId?: string;
  resolutionNotes?: string;
  path?: string;
  benchmarkStorePath?: string;
  projectName?: string;
  format?: string;
  help: boolean;
}

export function createCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false, help: false };
  const values = [...argv];

  if (values.length > 0 && !values[0]!.startsWith('-')) {
    const command = values.shift();
    if (command) args.command = command;
  }

  for (let index = 0; index < values.length; index += 1) {
    const token = values[index]!;
    if (token === '--json') { args.json = true; continue; }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    if (token === '--project') { args.project = readValue(values, ++index, '--project'); continue; }
    if (token === '--objective') { args.objective = readValue(values, ++index, '--objective'); continue; }
    if (token === '--task') { args.task = readValue(values, ++index, '--task'); continue; }
    if (token === '--session-id') { args.sessionId = readValue(values, ++index, '--session-id'); continue; }
    if (token === '--store-path') { args.storePath = readValue(values, ++index, '--store-path'); continue; }
    if (token === '--query') { args.query = readValue(values, ++index, '--query'); continue; }
    if (token === '--subject') { args.subject = readValue(values, ++index, '--subject'); continue; }
    if (token === '--candidate-id') { args.candidateId = readValue(values, ++index, '--candidate-id'); continue; }
    if (token === '--page-id') { args.pageId = readValue(values, ++index, '--page-id'); continue; }
    if (token === '--status') { args.status = readValue(values, ++index, '--status'); continue; }
    if (token === '--notes') { args.notes = readValue(values, ++index, '--notes'); continue; }
    if (token === '--entity-id') { args.entityId = readValue(values, ++index, '--entity-id'); continue; }
    if (token === '--pattern') { args.pattern = readValue(values, ++index, '--pattern'); continue; }
    if (token === '--key') { args.key = readValue(values, ++index, '--key'); continue; }
    if (token === '--scope-ref') { args.scopeRef = readValue(values, ++index, '--scope-ref'); continue; }
    if (token === '--keep-preference-id') { args.keepPreferenceId = readValue(values, ++index, '--keep-preference-id'); continue; }
    if (token === '--resolution-notes') { args.resolutionNotes = readValue(values, ++index, '--resolution-notes'); continue; }
    if (token === '--path') { args.path = readValue(values, ++index, '--path'); continue; }
    if (token === '--benchmark-store-path') { args.benchmarkStorePath = readValue(values, ++index, '--benchmark-store-path'); continue; }
    if (token === '--project-name') { args.projectName = readValue(values, ++index, '--project-name'); continue; }
    if (token === '--format') { args.format = readValue(values, ++index, '--format'); continue; }
    throw new Error(`Unknown CLI flag: ${token}`);
  }

  return args;
}

function readValue(values: string[], index: number, flag: string): string {
  const value = values[index];
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
  return value;
}

export function formatUsage(): string {
  return [
    'Waypath',
    '',
    'Usage:',
    '  waypath codex [--json] [--project <name>] [--objective <text>] [--task <text>] [--session-id <id>] [--store-path <path>]',
    '  waypath claude-code [--json] [--project <name>] [--objective <text>] [--task <text>] [--session-id <id>] [--store-path <path>]',
    '  waypath recall --query <text> [--json]',
    '  waypath page --subject <text> [--json]',
    '  waypath promote --subject <text> [--json]',
    '  waypath review --candidate-id <id> --status <pending_review|accepted|rejected|needs_more_evidence|superseded> [--notes <text>] [--json]',
    '  waypath review-queue [--json] [--store-path <path>]',
    '  waypath inspect-page --page-id <id> [--json] [--store-path <path>]',
    '  waypath inspect-candidate --candidate-id <id> [--json] [--store-path <path>]',
    '  waypath graph-query --entity-id <id> [--pattern <project_context|person_context|system_reasoning|contradiction_lookup>] [--json]',
    '  waypath import-seed [--project <name>] [--store-path <path>] [--json]',
    '  waypath import-local [--project <name>] [--store-path <path>] [--json]',
    '  waypath source-status [--json]',
    '  waypath health [--json] [--store-path <path>]',
    '  waypath backup --path <directory> [--json] [--store-path <path>]',
    '  waypath rebuild-fts [--json] [--store-path <path>]',
    '  waypath db-stats [--json] [--store-path <path>]',
    '  waypath mcp-server [--store-path <path>]',
    '  waypath resolve-contradiction --key <key> --keep-preference-id <id> [--scope-ref <ref>] [--resolution-notes <text>] [--json]',
    '  waypath refresh-page --page-id <id> [--json]',
    '  waypath explain --query <text> [--json] [--store-path <path>]',
    '  waypath export --format <claude-md|agents-md|json> [--store-path <path>]',
    '  waypath history --entity-id <id> [--json] [--store-path <path>]',
    '  waypath benchmark [--json] [--store-path <path>]',
    '  waypath scan --project <name> [--json] [--store-path <path>]',
    '  waypath --help',
  ].join('\n');
}

export function writeLine(io: CliIo, text: string): void {
  io.stdout.write(`${text}\n`);
}
