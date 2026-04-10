#!/usr/bin/env node

import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const sourceRoots = ['src', 'tests'];
const checkOnly = process.argv.includes('--check');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts'))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeSpecifier(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  if (/\.(?:[cm]?js|json|node)$/u.test(specifier)) return specifier;

  const resolvedBase = path.resolve(path.dirname(sourceFile), specifier);
  if (await exists(`${resolvedBase}.ts`) || await exists(`${resolvedBase}.d.ts`)) {
    return `${specifier}.js`;
  }

  if (
    await exists(path.join(resolvedBase, 'index.ts')) ||
    await exists(path.join(resolvedBase, 'index.d.ts'))
  ) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function rewriteRelativeSpecifiers(sourceFile, code) {
  const replacements = [];
  const pattern = /\b(?:from|import)\s*(['"])(\.[^'"]+)\1/gu;

  for (const match of code.matchAll(pattern)) {
    const [, quote, specifier] = match;
    const rewritten = await resolveRelativeSpecifier(sourceFile, specifier);
    if (rewritten === specifier) continue;
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0].replace(`${quote}${specifier}${quote}`, `${quote}${rewritten}${quote}`),
    });
  }

  if (replacements.length === 0) {
    return code;
  }

  let cursor = 0;
  let result = '';
  for (const replacement of replacements) {
    result += code.slice(cursor, replacement.start);
    result += replacement.text;
    cursor = replacement.end;
  }
  result += code.slice(cursor);
  return result;
}

async function buildFile(sourceFile) {
  if (sourceFile.endsWith('.d.ts')) {
    if (checkOnly) return;

    const outputFile = path.join(distRoot, path.relative(projectRoot, sourceFile));
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, await readFile(sourceFile));
    return;
  }

  const relativePath = path.relative(projectRoot, sourceFile);
  const outputFile = path.join(distRoot, relativePath.replace(/\.ts$/u, '.js'));
  const source = await readFile(sourceFile, 'utf8');
  const transformed = stripTypeScriptTypes(source, { mode: 'transform' });
  const rewritten = await rewriteRelativeSpecifiers(sourceFile, transformed);

  if (checkOnly) {
    return;
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, rewritten, 'utf8');

  if (source.startsWith('#!')) {
    await chmod(outputFile, 0o755);
  }
}

async function main() {
  const sourceFiles = [];
  for (const root of sourceRoots) {
    sourceFiles.push(...await walk(path.join(projectRoot, root)));
  }

  if (!checkOnly) {
    await rm(distRoot, { recursive: true, force: true });
  }

  for (const sourceFile of sourceFiles) {
    await buildFile(sourceFile);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
