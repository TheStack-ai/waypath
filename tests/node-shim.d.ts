interface ImportMeta {
  url: string;
}

declare const process: {
  cwd(): string;
};

declare module 'node:assert/strict' {
  type Matcher = RegExp | string;
  interface AssertionAPI {
    equal(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, matcher: Matcher, message?: string): void;
  }

  const assert: AssertionAPI;
  export default assert;
}

declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:test' {
  type TestFn = () => void | Promise<void>;
  function test(name: string, fn: TestFn): void;
  export default test;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
