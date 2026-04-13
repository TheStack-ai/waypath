import type { SqliteDriver } from './sqlite-driver.js';
import { createBetterSqliteDriver } from './sqlite-better.js';
import { createNativeSqliteDriver } from './sqlite-native.js';

let cachedDriver: SqliteDriver | null = null;

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createSqliteDriver(): SqliteDriver {
  if (cachedDriver) {
    return cachedDriver;
  }

  const failures: string[] = [];

  try {
    cachedDriver = createNativeSqliteDriver();
    return cachedDriver;
  } catch (error) {
    failures.push(`node:sqlite: ${formatError(error)}`);
  }

  try {
    cachedDriver = createBetterSqliteDriver();
    return cachedDriver;
  } catch (error) {
    failures.push(`better-sqlite3: ${formatError(error)}`);
  }

  throw new Error(
    `SQLite driver unavailable. Install optional dependency better-sqlite3 for Node 22, or run on Node 25+. Tried ${failures.join('; ')}`,
  );
}
