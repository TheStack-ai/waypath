import { runFacadeUnitTest } from './unit/facade.test';
import { runPageServiceUnitTest } from './unit/page-service.test';
import { runSessionRuntimeUnitTest } from './unit/session-runtime.test';
import { runTruthKernelUnitTest } from './unit/truth-kernel.test';
import { runSourceReaderBootstrapUnitTest } from './unit/source-reader-bootstrap.test';
import { runArchiveProviderUnitTest } from './unit/archive-provider.test';
import { runRuntimeConfigUnitTest } from './unit/runtime-config.test';
import {
  runCodexCliIntegrationTest,
  runPageCliIntegrationTest,
  runPromoteCliIntegrationTest,
  runRecallCliIntegrationTest,
  runReviewCliIntegrationTest,
  runReviewQueueCliIntegrationTest,
  runInspectCliIntegrationTest,
} from './integration/codex-cli.test';
import { runImportSeedCliIntegrationTest } from './integration/import-seed-cli.test';
import {
  runImportLocalCliIntegrationTest,
  runSourceStatusCliIntegrationTest,
} from './integration/import-local-cli.test';

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [
  { name: 'facade unit', run: runFacadeUnitTest },
  { name: 'page service unit', run: runPageServiceUnitTest },
  { name: 'session runtime unit', run: runSessionRuntimeUnitTest },
  { name: 'truth-kernel unit', run: runTruthKernelUnitTest },
  { name: 'source-reader bootstrap unit', run: runSourceReaderBootstrapUnitTest },
  { name: 'archive provider unit', run: runArchiveProviderUnitTest },
  { name: 'runtime config unit', run: runRuntimeConfigUnitTest },
  { name: 'codex cli integration', run: runCodexCliIntegrationTest },
  { name: 'recall cli integration', run: runRecallCliIntegrationTest },
  { name: 'page cli integration', run: runPageCliIntegrationTest },
  { name: 'promote cli integration', run: runPromoteCliIntegrationTest },
  { name: 'review cli integration', run: runReviewCliIntegrationTest },
  { name: 'review-queue cli integration', run: runReviewQueueCliIntegrationTest },
  { name: 'inspect cli integration', run: runInspectCliIntegrationTest },
  { name: 'import-seed cli integration', run: runImportSeedCliIntegrationTest },
  { name: 'import-local cli integration', run: runImportLocalCliIntegrationTest },
  { name: 'source-status cli integration', run: runSourceStatusCliIntegrationTest },
];

async function main(): Promise<void> {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.run();
      process.stdout.write(`PASS ${test.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (failures === 0) {
    process.stdout.write(`PASS ${tests.length} tests\n`);
    return;
  }

  process.stderr.write(`FAIL ${failures}/${tests.length} tests\n`);
  process.exitCode = 1;
}

void main();
