import { runFacadeUnitTest } from './unit/facade.test';
import { runSessionRuntimeUnitTest } from './unit/session-runtime.test';
import { runTruthKernelUnitTest } from './unit/truth-kernel.test';
import { runCodexCliIntegrationTest } from './integration/codex-cli.test';

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [
  { name: 'facade unit', run: runFacadeUnitTest },
  { name: 'session runtime unit', run: runSessionRuntimeUnitTest },
  { name: 'truth-kernel unit', run: runTruthKernelUnitTest },
  { name: 'codex cli integration', run: runCodexCliIntegrationTest },
];

let failures = 0;
for (const test of tests) {
  try {
    test.run();
    process.stdout.write(`PASS ${test.name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (failures === 0) {
  process.stdout.write(`PASS ${tests.length} tests\n`);
} else {
  process.stderr.write(`FAIL ${failures}/${tests.length} tests\n`);
  process.exitCode = 1;
}
