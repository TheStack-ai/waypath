declare const process: {
  argv: string[];
  exitCode?: number;
  cwd(): string;
  stdout: {
    write(chunk: string): void;
  };
  stderr: {
    write(chunk: string): void;
  };
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
