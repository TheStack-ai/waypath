import { createRequire } from 'node:module';

import type { SqliteDb, SqliteDriver, SqliteOpenOptions, SqliteParams, SqliteStatement } from './sqlite-driver.js';

interface BetterSqliteRunResult {
  readonly changes: number | bigint;
  readonly lastInsertRowid: number | bigint;
}

interface BetterSqliteStatement {
  run(...params: unknown[]): BetterSqliteRunResult;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface BetterSqliteDb {
  prepare(sql: string): BetterSqliteStatement;
  exec(sql: string): void;
  close(): void;
}

interface BetterSqliteOptions {
  readonly readonly?: boolean;
}

type BetterSqliteConstructor = new (path: string, options?: BetterSqliteOptions) => BetterSqliteDb;

const require = createRequire(import.meta.url);

function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function toArgs(params?: SqliteParams): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? [...params] : [params];
}

function wrapStatement(statement: BetterSqliteStatement): SqliteStatement {
  return {
    run(params?: SqliteParams) {
      const result = statement.run(...toArgs(params));
      return {
        changes: toNumber(result.changes),
        lastInsertRowid: toNumber(result.lastInsertRowid),
      };
    },
    all(params?: SqliteParams) {
      return statement.all(...toArgs(params));
    },
    get(params?: SqliteParams) {
      return statement.get(...toArgs(params));
    },
  };
}

function wrapDb(db: BetterSqliteDb): SqliteDb {
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

export function createBetterSqliteDriver(): SqliteDriver {
  const BetterSqlite = require('better-sqlite3') as BetterSqliteConstructor;
  return {
    open(path: string, options: SqliteOpenOptions = {}) {
      return wrapDb(new BetterSqlite(path, { readonly: options.readOnly === true }));
    },
  };
}
