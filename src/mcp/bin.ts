#!/usr/bin/env node

import { runWaypathMcpServer } from './server.js';
import { loadRuntimeConfig } from '../shared/config/index.js';

const runtimeConfig = loadRuntimeConfig().config;

void runWaypathMcpServer({
  input: process.stdin,
  output: process.stdout,
  error: process.stderr,
  facadeOptions: {
    autoSeed: true,
    ...(runtimeConfig.retrieval?.weights ? { recallWeights: runtimeConfig.retrieval.weights } : {}),
    ...(runtimeConfig.reviewQueue?.limit ? { reviewQueueLimit: runtimeConfig.reviewQueue.limit } : {}),
    ...(runtimeConfig.sourceAdapters?.enabled ? { sourceAdaptersEnabled: runtimeConfig.sourceAdapters.enabled } : {}),
  },
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
