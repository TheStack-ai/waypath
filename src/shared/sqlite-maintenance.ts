import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface SqliteBackupResult {
  readonly source: string;
  readonly destination_directory: string;
  readonly copied_files: readonly string[];
}

function relatedPaths(databasePath: string): readonly string[] {
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
}

export function backupSqliteDatabase(databasePath: string, destinationDirectory: string): SqliteBackupResult {
  mkdirSync(destinationDirectory, { recursive: true });

  const copiedFiles = relatedPaths(databasePath)
    .filter((path) => existsSync(path))
    .map((path) => {
      const target = join(destinationDirectory, basename(path));
      copyFileSync(path, target);
      return target;
    });

  return {
    source: databasePath,
    destination_directory: destinationDirectory,
    copied_files: copiedFiles,
  };
}
