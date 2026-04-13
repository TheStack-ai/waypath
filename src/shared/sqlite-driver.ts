export interface SqliteOpenOptions {
  readonly readOnly?: boolean;
}

export type SqliteParams = Readonly<Record<string, unknown>> | readonly unknown[];

export interface SqliteDriver {
  open(path: string, options?: SqliteOpenOptions): SqliteDb;
}

export interface SqliteDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

export interface SqliteStatement {
  run(params?: SqliteParams): { changes: number; lastInsertRowid: number };
  all(params?: SqliteParams): unknown[];
  get(params?: SqliteParams): unknown;
}
