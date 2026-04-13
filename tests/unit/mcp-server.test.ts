import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { runWaypathMcpServer } from '../../src/mcp/server';
import { createTruthKernelStorage, ensureTruthKernelSeedData } from '../../src/jarvis_fusion/truth-kernel';
import { assert, assertEqual } from '../../src/shared/assert';

export async function runMcpServerUnitTest(): Promise<void> {
  const root = mkdtempSync(`${tmpdir()}/waypath-mcp-`);
  const storePath = join(root, 'truth.db');
  const store = createTruthKernelStorage(storePath, { autoMigrate: true });
  try {
    ensureTruthKernelSeedData(store, {
      project: 'mcp-project',
      objective: 'exercise MCP server',
      activeTask: 'mcp-test',
    });
  } finally {
    store.close();
  }

  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  const outputChunks: string[] = [];
  const errorChunks: string[] = [];
  output.setEncoding('utf8');
  error.setEncoding('utf8');
  output.on('data', (chunk: string) => outputChunks.push(chunk));
  error.on('data', (chunk: string) => errorChunks.push(chunk));

  const serverPromise = runWaypathMcpServer({
    input,
    output,
    error,
    facadeOptions: {
      storePath,
      autoSeed: true,
    },
  });

  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      clientInfo: {
        name: 'unit-test',
        version: '1.0.0',
      },
    },
  })}\n`);
  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  })}\n`);
  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  })}\n`);
  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'waypath_health',
      arguments: {},
    },
  })}\n`);
  input.end();

  await serverPromise;

  assertEqual(errorChunks.join(''), '');
  const messages = outputChunks
    .join('')
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  assertEqual(messages.length, 3);
  assertEqual(
    (((messages[0]?.result as Record<string, unknown>)?.serverInfo as Record<string, unknown>)?.name as string),
    'waypath',
  );
  assertEqual(((messages[0]?.result as Record<string, unknown>)?.protocolVersion as string), '2025-11-25');

  const tools = ((messages[1]?.result as Record<string, unknown>)?.tools as { name: string }[]);
  assertEqual(tools.length, 9);
  assert(tools.some((tool) => tool.name === 'waypath_health'), 'expected waypath_health tool');

  const toolCallResult = (messages[2]?.result as Record<string, unknown>)?.structuredContent as Record<string, unknown>;
  assertEqual(toolCallResult?.operation as string, 'health');
  assertEqual(typeof toolCallResult?.ok, 'boolean');
}
