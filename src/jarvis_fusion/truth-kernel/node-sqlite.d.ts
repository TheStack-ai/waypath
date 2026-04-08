declare module 'node:sqlite' {
  export interface DatabaseSyncOptions {
    readonly readOnly?: boolean;
  }

  export interface StatementSyncRunResult {
    readonly changes: number;
    readonly lastInsertRowid: number;
  }

  export interface StatementSync {
    all<T = unknown>(params?: Readonly<Record<string, unknown>> | readonly unknown[]): readonly T[];
    get<T = unknown>(params?: Readonly<Record<string, unknown>> | readonly unknown[]): T | undefined;
    run(params?: Readonly<Record<string, unknown>> | readonly unknown[]): StatementSyncRunResult;
  }

  export class DatabaseSync {
    constructor(location?: string, options?: DatabaseSyncOptions);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
