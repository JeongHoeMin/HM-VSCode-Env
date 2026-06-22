import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const targetDirs = ['packs', 'presets', 'templates'];
const jsonFiles = [];

for (const targetDir of targetDirs) {
  await collectJsonFiles(path.join(rootDir, targetDir), jsonFiles);
}

jsonFiles.push(path.join(rootDir, 'package.json'));

for (const filePath of jsonFiles.sort()) {
  const content = await readFile(filePath, 'utf8');

  if (content.trim().length === 0) {
    throw new Error(`JSON file is empty: ${relative(filePath)}`);
  }

  try {
    JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON file: ${relative(filePath)}\n${error.message}`);
  }
}

console.log(`Validated ${jsonFiles.length} JSON files.`);

async function collectJsonFiles(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectJsonFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}
