import { createRequire } from 'node:module';

import type { SqliteDb, SqliteDriver, SqliteOpenOptions, SqliteParams, SqliteStatement } from './sqlite-driver.js';

interface NodeSqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

interface NodeSqliteStatement {
  run(params?: SqliteParams): NodeSqliteRunResult;
  all(params?: SqliteParams): unknown[];
  get(params?: SqliteParams): unknown;
}

interface NodeSqliteDb {
  prepare(sql: string): NodeSqliteStatement;
  exec(sql: string): void;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path?: string, options?: SqliteOpenOptions) => NodeSqliteDb;
}

const require = createRequire(import.meta.url);

function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function callWithParams<T>(operation: (params?: SqliteParams) => T, params?: SqliteParams): T {
  return params === undefined ? operation() : operation(params);
}

function wrapStatement(statement: NodeSqliteStatement): SqliteStatement {
  return {
    run(params?: SqliteParams) {
      const result = params === undefined ? statement.run() : statement.run(params);
      return {
        changes: toNumber(result.changes),
        lastInsertRowid: toNumber(result.lastInsertRowid),
      };
    },
    all(params?: SqliteParams) {
      return params === undefined ? statement.all() : statement.all(params);
    },
    get(params?: SqliteParams) {
      return params === undefined ? statement.get() : statement.get(params);
    },
  };
}

function wrapDb(db: NodeSqliteDb): SqliteDb {
  return {
    prepare(sql: string) {
      return wrapStatement(db.prepare(sql));
    },
    exec(sql: string) {
      db.exec(sql);
    },
    close() {
      db.close();
    },
  };
}

export function createNativeSqliteDriver(): SqliteDriver {
  const sqlite = require('node:sqlite') as NodeSqliteModule;
  return {
    open(path: string, options: SqliteOpenOptions = {}) {
      return wrapDb(new sqlite.DatabaseSync(path, options));
    },
  };
}
