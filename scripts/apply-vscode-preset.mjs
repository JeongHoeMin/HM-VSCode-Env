import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const envRootDir = process.cwd();

const presetName = process.argv[2];
const targetProjectDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : process.cwd();

if (!presetName) {
  console.error('Usage: npm run apply -- <preset-name> [target-project]');
  console.error('');
  console.error('Examples:');
  console.error('  npm run apply -- react-ts .');
  console.error('  npm run apply -- nestjs "D:\\workspace\\github\\my-api"');
  process.exit(1);
}

const presetPath = path.join(envRootDir, 'presets', `${presetName}.json`);

if (!existsSync(presetPath)) {
  console.error(`Preset not found: ${presetPath}`);
  process.exit(1);
}

const preset = await readJsonStrict(presetPath);

if (!Array.isArray(preset.layers)) {
  console.error(`Invalid preset. "layers" must be an array: ${presetPath}`);
  process.exit(1);
}

const mergedSettings = {};
const mergedExtensions = new Set();

const mergedTasks = {
  version: '2.0.0',
  tasks: []
};

const mergedLaunch = {
  version: '0.2.0',
  configurations: [],
  compounds: []
};

console.log(`Preset: ${preset.name ?? presetName}`);
console.log(`Target: ${targetProjectDir}`);
console.log('');

for (const layer of preset.layers) {
  const layerDir = path.join(envRootDir, 'templates', layer);

  if (!existsSync(layerDir)) {
    console.warn(`Skip missing layer: ${layerDir}`);
    continue;
  }

  console.log(`Layer: ${layer}`);

  await mergeSettings(layerDir, mergedSettings);
  await mergeExtensions(layerDir, mergedExtensions);
  await mergeTasks(layerDir, mergedTasks);
  await mergeLaunch(layerDir, mergedLaunch);
}

for (const extensionId of preset.extensions ?? []) {
  mergedExtensions.add(extensionId);
}

const vscodeDir = path.join(targetProjectDir, '.vscode');

await mkdir(vscodeDir, { recursive: true });

await writeJson(path.join(vscodeDir, 'settings.json'), mergedSettings);

await writeJson(path.join(vscodeDir, 'extensions.json'), {
  recommendations: [...mergedExtensions].sort()
});

if (mergedTasks.tasks.length > 0) {
  await writeJson(path.join(vscodeDir, 'tasks.json'), mergedTasks);
}

if (
  mergedLaunch.configurations.length > 0 ||
  mergedLaunch.compounds.length > 0
) {
  await writeJson(path.join(vscodeDir, 'launch.json'), mergedLaunch);
}

console.log('');
console.log(`Applied VS Code preset "${presetName}"`);
console.log(`Output: ${vscodeDir}`);

async function mergeSettings(layerDir, mergedSettings) {
  const settingsPath = path.join(layerDir, 'settings.json');

  if (!existsSync(settingsPath)) {
    return;
  }

  const settingsJson = await readJsonStrict(settingsPath);
  deepMerge(mergedSettings, settingsJson);

  console.log('  merged settings.json');
}

async function mergeExtensions(layerDir, mergedExtensions) {
  const extensionsPath = path.join(layerDir, 'extensions.json');

  if (!existsSync(extensionsPath)) {
    return;
  }

  const extensionsJson = await readJsonStrict(extensionsPath);

  for (const extensionId of extensionsJson.recommendations ?? []) {
    mergedExtensions.add(extensionId);
  }

  console.log('  merged extensions.json');
}

async function mergeTasks(layerDir, mergedTasks) {
  const tasksPath = path.join(layerDir, 'tasks.json');

  if (!existsSync(tasksPath)) {
    return;
  }

  const tasksJson = await readJsonStrict(tasksPath);

  if (Array.isArray(tasksJson.tasks)) {
    mergeArrayByKey(mergedTasks.tasks, tasksJson.tasks, 'label');
  }

  console.log('  merged tasks.json');
}

async function mergeLaunch(layerDir, mergedLaunch) {
  const launchPath = path.join(layerDir, 'launch.json');

  if (!existsSync(launchPath)) {
    return;
  }

  const launchJson = await readJsonStrict(launchPath);

  if (Array.isArray(launchJson.configurations)) {
    mergeArrayByKey(
      mergedLaunch.configurations,
      launchJson.configurations,
      'name'
    );
  }

  if (Array.isArray(launchJson.compounds)) {
    mergeArrayByKey(mergedLaunch.compounds, launchJson.compounds, 'name');
  }

  console.log('  merged launch.json');
}

async function readJsonStrict(filePath) {
  const content = await readFile(filePath, 'utf8');

  if (content.trim().length === 0) {
    throw new Error(`JSON file is empty: ${filePath}`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON file: ${filePath}\n${error.message}`);
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];

    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      deepMerge(targetValue, sourceValue);
      continue;
    }

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = [...targetValue, ...sourceValue];
      continue;
    }

    target[key] = sourceValue;
  }

  return target;
}

function mergeArrayByKey(targetArray, sourceArray, key) {
  const targetMap = new Map(
    targetArray
      .filter((item) => item && item[key])
      .map((item) => [item[key], item])
  );

  for (const sourceItem of sourceArray) {
    const sourceKey = sourceItem?.[key];

    if (!sourceKey) {
      targetArray.push(sourceItem);
      continue;
    }

    const targetItem = targetMap.get(sourceKey);

    if (!targetItem) {
      targetArray.push(sourceItem);
      targetMap.set(sourceKey, sourceItem);
      continue;
    }

    deepMerge(targetItem, sourceItem);
  }
}