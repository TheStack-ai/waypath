import { DatabaseSync } from 'node:sqlite';

import type {
  SqliteQueryResult,
  TruthKernelHealth,
  TruthKernelStore,
} from '../contracts.js';
import { TRUTH_KERNEL_SCHEMA_VERSION, buildTruthKernelMigrationSql } from './schema.js';

export interface SqliteTruthKernelStoreOptions {
  readonly autoMigrate?: boolean;
}

function normalizeLocation(location: string): string {
  return location.trim();
}

export class SqliteTruthKernelStorage implements TruthKernelStore {
  readonly location: string;
  readonly db: DatabaseSync;

  constructor(location: string, options: SqliteTruthKernelStoreOptions = {}) {
    this.location = normalizeLocation(location);
    this.db = new DatabaseSync(this.location);

    if (options.autoMigrate ?? true) {
      this.migrate();
    }
  }

  migrate(): void {
    this.db.exec(buildTruthKernelMigrationSql());
  }

  close(): void {
    this.db.close();
  }

  health(): TruthKernelHealth {
    return {
      ok: true,
      location: this.location,
      schema_version: TRUTH_KERNEL_SCHEMA_VERSION,
      message: 'truth kernel ready',
    };
  }

  run(sql: string, params: Readonly<Record<string, unknown>> = {}): SqliteQueryResult {
    const statement = this.db.prepare(sql);
    return statement.run(params as Record<string, unknown>);
  }

  all<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): readonly T[] {
    const statement = this.db.prepare(sql);
    return statement.all(params as Record<string, unknown>) as readonly T[];
  }

  get<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): T | undefined {
    const statement = this.db.prepare(sql);
    return statement.get(params as Record<string, unknown>) as T | undefined;
  }

  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function createTruthKernelStorage(
  location: string,
  options: SqliteTruthKernelStoreOptions = {},
): SqliteTruthKernelStorage {
  return new SqliteTruthKernelStorage(location, options);
}
