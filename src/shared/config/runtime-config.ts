import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  RecallWeightOverrides,
  SourceAdapterEnabledMap,
} from '../../contracts';

export interface ImportRuntimeConfig {
  readonly allowMissingLocalReaders?: boolean;
}

export interface ReviewQueueRuntimeConfig {
  readonly limit?: number;
}

export interface RuntimeConfig {
  readonly sourceAdapters?: {
    readonly enabled?: SourceAdapterEnabledMap;
  };
  readonly retrieval?: {
    readonly weights?: RecallWeightOverrides;
  };
  readonly import?: ImportRuntimeConfig;
  readonly reviewQueue?: ReviewQueueRuntimeConfig;
}

export interface LoadedRuntimeConfig {
  readonly config: RuntimeConfig;
  readonly configPath: string | null;
}

export interface RuntimeConfigLoadOptions {
  readonly cwd?: string;
  readonly env?: EnvMap;
}

type EnvMap = Record<string, string | undefined>;
type TomlPrimitive = string | number | boolean;
interface TomlObject {
  [key: string]: TomlPrimitive | TomlObject;
}

const CONFIG_PATH_ENV_KEYS = ['WAYPATH_CONFIG_PATH', 'JARVIS_FUSION_CONFIG_PATH'] as const;
const SOURCE_ADAPTER_ENV_PREFIXES = ['WAYPATH_SOURCE_ADAPTER_', 'JARVIS_FUSION_SOURCE_ADAPTER_'] as const;
const SOURCE_SYSTEM_WEIGHT_ENV_PREFIXES = [
  'WAYPATH_RECALL_WEIGHT_SOURCE_SYSTEM_',
  'WAYPATH_RETRIEVAL_SOURCE_SYSTEM_WEIGHT_',
  'JARVIS_FUSION_RECALL_WEIGHT_SOURCE_SYSTEM_',
  'JARVIS_FUSION_RETRIEVAL_SOURCE_SYSTEM_WEIGHT_',
] as const;
const SOURCE_KIND_WEIGHT_ENV_PREFIXES = [
  'WAYPATH_RECALL_WEIGHT_SOURCE_KIND_',
  'WAYPATH_RETRIEVAL_SOURCE_KIND_WEIGHT_',
  'JARVIS_FUSION_RECALL_WEIGHT_SOURCE_KIND_',
  'JARVIS_FUSION_RETRIEVAL_SOURCE_KIND_WEIGHT_',
] as const;
const IMPORT_ALLOW_MISSING_ENV_KEYS = [
  'WAYPATH_IMPORT_ALLOW_MISSING_LOCAL_READERS',
  'JARVIS_FUSION_IMPORT_ALLOW_MISSING_LOCAL_READERS',
] as const;
const REVIEW_QUEUE_LIMIT_ENV_KEYS = ['WAYPATH_REVIEW_QUEUE_LIMIT', 'JARVIS_FUSION_REVIEW_QUEUE_LIMIT'] as const;

export function loadRuntimeConfig(options: RuntimeConfigLoadOptions = {}): LoadedRuntimeConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const configPath = resolveConfigPath(cwd, env);
  const parsedFile = configPath ? parseSimpleToml(readFileSync(configPath, 'utf8')) : {};
  const config = applyEnvOverrides(decodeRuntimeConfig(parsedFile), env);
  return {
    config,
    configPath,
  };
}

function resolveConfigPath(cwd: string, env: EnvMap): string | null {
  for (const key of CONFIG_PATH_ENV_KEYS) {
    const candidate = env[key];
    if (!candidate) continue;
    const resolved = resolve(cwd, candidate);
    if (existsSync(resolved)) return resolved;
  }

  const defaultPath = resolve(cwd, 'config.toml');
  return existsSync(defaultPath) ? defaultPath : null;
}

function parseSimpleToml(source: string): TomlObject {
  const root: TomlObject = {};
  let sectionPath: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = stripComments(rawLine).trim();
    if (line.length === 0) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      sectionPath = line
        .slice(1, -1)
        .split('.')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      ensureObjectPath(root, sectionPath);
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (key.length === 0 || rawValue.length === 0) continue;

    const parent = ensureObjectPath(root, sectionPath);
    parent[key] = parseTomlScalar(rawValue);
  }

  return root;
}

function stripComments(line: string): string {
  let inQuote = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"' && !escaped) {
      inQuote = !inQuote;
    }
    if (char === '#' && !inQuote) {
      return line.slice(0, index);
    }
    escaped = char === '\\' && !escaped;
    if (char !== '\\') escaped = false;
  }
  return line;
}

function ensureObjectPath(root: TomlObject, path: readonly string[]): TomlObject {
  let current = root;
  for (const segment of path) {
    const next = current[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as TomlObject;
  }
  return current;
}

function parseTomlScalar(rawValue: string): TomlPrimitive {
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(rawValue)) return Number(rawValue);
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith('\'') && rawValue.endsWith('\''))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function decodeRuntimeConfig(raw: TomlObject): RuntimeConfig {
  const sourceAdapters = readObject(raw, 'source_adapters');
  const retrieval = readObject(raw, 'retrieval');
  const retrievalWeights = readObject(retrieval, 'weights');
  const importConfig = readObject(raw, 'import');
  const reviewQueue = readObject(raw, 'review_queue');

  const enabled = {
    ...readBooleanRecord(sourceAdapters),
    ...readBooleanRecord(readObject(sourceAdapters, 'enabled')),
  };

  const sourceSystems = {
    ...readNumberRecord(readObject(retrieval, 'source_system_weights')),
    ...readNumberRecord(readObject(retrievalWeights, 'source_systems')),
  };
  const sourceKinds = {
    ...readNumberRecord(readObject(retrieval, 'source_kind_weights')),
    ...readNumberRecord(readObject(retrievalWeights, 'source_kinds')),
  };

  const allowMissingLocalReaders = readBoolean(importConfig, 'allow_missing_local_readers');
  const reviewQueueLimit = readPositiveInteger(reviewQueue, 'limit');

  return {
    ...(Object.keys(enabled).length > 0 ? { sourceAdapters: { enabled } } : {}),
    ...(Object.keys(sourceSystems).length > 0 || Object.keys(sourceKinds).length > 0
      ? {
          retrieval: {
            weights: {
              ...(Object.keys(sourceSystems).length > 0 ? { sourceSystems } : {}),
              ...(Object.keys(sourceKinds).length > 0 ? { sourceKinds } : {}),
            },
          },
        }
      : {}),
    ...((allowMissingLocalReaders !== undefined) ? { import: { allowMissingLocalReaders } } : {}),
    ...((reviewQueueLimit !== undefined) ? { reviewQueue: { limit: reviewQueueLimit } } : {}),
  };
}

function applyEnvOverrides(base: RuntimeConfig, env: EnvMap): RuntimeConfig {
  const sourceAdapterOverrides = { ...(base.sourceAdapters?.enabled ?? {}) };
  const sourceSystemWeights = { ...(base.retrieval?.weights?.sourceSystems ?? {}) };
  const sourceKindWeights = { ...(base.retrieval?.weights?.sourceKinds ?? {}) };
  let allowMissingLocalReaders = base.import?.allowMissingLocalReaders;
  let reviewQueueLimit = base.reviewQueue?.limit;

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;

    const sourceAdapterName = matchEnvPrefix(key, SOURCE_ADAPTER_ENV_PREFIXES);
    if (sourceAdapterName) {
      const enabled = parseBoolean(value);
      if (enabled !== undefined) {
        sourceAdapterOverrides[normalizeEnvKey(sourceAdapterName.replace(/_ENABLED$/u, ''))] = enabled;
      }
      continue;
    }

    const sourceSystemName = matchEnvPrefix(key, SOURCE_SYSTEM_WEIGHT_ENV_PREFIXES);
    if (sourceSystemName) {
      const weight = parseFiniteNumber(value);
      if (weight !== undefined) {
        sourceSystemWeights[normalizeEnvKey(sourceSystemName)] = weight;
      }
      continue;
    }

    const sourceKindName = matchEnvPrefix(key, SOURCE_KIND_WEIGHT_ENV_PREFIXES);
    if (sourceKindName) {
      const weight = parseFiniteNumber(value);
      if (weight !== undefined) {
        sourceKindWeights[normalizeEnvKey(sourceKindName)] = weight;
      }
      continue;
    }
  }

  for (const key of IMPORT_ALLOW_MISSING_ENV_KEYS) {
    const parsed = parseBoolean(env[key]);
    if (parsed !== undefined) {
      allowMissingLocalReaders = parsed;
      break;
    }
  }

  for (const key of REVIEW_QUEUE_LIMIT_ENV_KEYS) {
    const parsed = parsePositiveInteger(env[key]);
    if (parsed !== undefined) {
      reviewQueueLimit = parsed;
      break;
    }
  }

  return {
    ...(Object.keys(sourceAdapterOverrides).length > 0
      ? { sourceAdapters: { enabled: sourceAdapterOverrides } }
      : {}),
    ...(Object.keys(sourceSystemWeights).length > 0 || Object.keys(sourceKindWeights).length > 0
      ? {
          retrieval: {
            weights: {
              ...(Object.keys(sourceSystemWeights).length > 0 ? { sourceSystems: sourceSystemWeights } : {}),
              ...(Object.keys(sourceKindWeights).length > 0 ? { sourceKinds: sourceKindWeights } : {}),
            },
          },
        }
      : {}),
    ...((allowMissingLocalReaders !== undefined) ? { import: { allowMissingLocalReaders } } : {}),
    ...((reviewQueueLimit !== undefined) ? { reviewQueue: { limit: reviewQueueLimit } } : {}),
  };
}

function matchEnvPrefix(key: string, prefixes: readonly string[]): string | null {
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }
  }
  return null;
}

function normalizeEnvKey(key: string): string {
  return key.toLowerCase().replace(/__/gu, '-').replace(/_/gu, '-');
}

function readObject(value: TomlObject | undefined, key: string): TomlObject | undefined {
  if (!value) return undefined;
  const nested = value[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as TomlObject : undefined;
}

function readBoolean(value: TomlObject | undefined, key: string): boolean | undefined {
  if (!value) return undefined;
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function readPositiveInteger(value: TomlObject | undefined, key: string): number | undefined {
  if (!value) return undefined;
  return parsePositiveInteger(value[key]);
}

function readBooleanRecord(value: TomlObject | undefined): SourceAdapterEnabledMap {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === 'boolean'),
  ) as SourceAdapterEnabledMap;
}

function readNumberRecord(value: TomlObject | undefined): Record<string, number> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === 'number' && Number.isFinite(entry)),
  ) as Record<string, number>;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'string') {
    return typeof value === 'boolean' ? value : undefined;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return undefined;
  }
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  const parsed = parseFiniteNumber(value);
  if (parsed === undefined) return undefined;
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}
