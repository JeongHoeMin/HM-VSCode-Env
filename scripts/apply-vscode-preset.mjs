#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import {
  getPresetNameFromLayers,
  listPresetNames,
  resolveLayers,
  resolvePreset
} from '../src/layers.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envRootDir = path.resolve(scriptDir, '..');

const args = process.argv.slice(2);
const command = args[0] === 'apply' ? args.shift() : 'apply';

if (command !== 'apply') {
  printUsage();
  process.exit(1);
}

const options = parseArgs(args);
const selection = options.layers
  ? {
      presetName: getPresetNameFromLayers(options.layers),
      layers: resolveLayers(options.layers)
    }
  : options.presetName
    ? {
        presetName: options.presetName,
        layers: resolvePreset(options.presetName)
      }
    : await promptForSelection();

const targetProjectDir = path.resolve(options.targetProjectDir ?? '.');
const outputFiles = await buildWorkspaceFiles(selection.layers);
const profileName = `hm-${selection.presetName}`;

await writeWorkspaceFiles({
  targetProjectDir,
  outputFiles,
  mode: options.mode
});

const profilePath = await writeProfileFile({
  targetProjectDir,
  profileName,
  outputFiles
});

console.log('');
console.log(`Applied VS Code environment: ${selection.presetName}`);
console.log(`Layers: ${selection.layers.join(' -> ')}`);
console.log(`Output: ${path.join(targetProjectDir, '.vscode')}`);
console.log('');
console.log('This only writes project-level VS Code files.');
console.log('The extensions.json file recommends extensions for this workspace; it does not install or uninstall user extensions.');
console.log('');
console.log('A VS Code Profile file was also generated for extensions, keybindings, theme, and UI preferences:');
console.log(`  ${profilePath}`);
console.log('');
console.log('To use it:');
console.log('  1. Open VS Code Command Palette');
console.log('  2. Run "Profiles: Import Profile..."');
console.log('  3. Select the generated .code-profile file');
console.log(`  4. After importing, open this project with: code . --profile "${profileName}"`);

function parseArgs(rawArgs) {
  const result = {
    layers: null,
    mode: null,
    presetName: null,
    targetProjectDir: null
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--layers') {
      result.layers = splitLayers(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--layers=')) {
      result.layers = splitLayers(arg.slice('--layers='.length));
      continue;
    }

    if (arg === '--mode') {
      result.mode = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--mode=')) {
      result.mode = arg.slice('--mode='.length);
      continue;
    }

    if (result.layers && !result.targetProjectDir) {
      result.targetProjectDir = arg;
      continue;
    }

    if (!result.presetName) {
      result.presetName = arg;
      continue;
    }

    if (!result.targetProjectDir) {
      result.targetProjectDir = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return result;
}

async function promptForSelection() {
  const rl = createInterface({ input, output });

  try {
    console.log('HM VS Code Env');
    console.log('Choose the project shape and this CLI will compose the matching VS Code layers.');
    console.log('');

    const runtime = await choose(rl, 'Runtime', [
      ['node', 'Node.js'],
      ['python', 'Python']
    ]);

    if (runtime === 'python') {
      const framework = await choose(rl, 'Python framework', [
        ['python', 'Plain Python'],
        ['fastapi', 'FastAPI']
      ]);
      const layers = resolvePreset(framework);
      return { presetName: getPresetNameFromLayers(layers), layers };
    }

    const projectType = await choose(rl, 'Node project type', [
      ['node', 'Node only'],
      ['frontend', 'Frontend'],
      ['backend', 'Backend'],
      ['electron', 'Electron']
    ]);

    if (projectType === 'node') {
      const language = await chooseLanguage(rl);
      const layers = resolvePreset(language === 'typescript' ? 'node-ts' : 'node-js');
      return { presetName: getPresetNameFromLayers(layers), layers };
    }

    if (projectType === 'frontend') {
      const framework = await choose(rl, 'Frontend framework', [
        ['vue', 'Vue'],
        ['react', 'React']
      ]);
      const language = await chooseLanguage(rl);
      const layers = resolvePreset(`${framework}-${language === 'typescript' ? 'ts' : 'js'}`);
      return { presetName: getPresetNameFromLayers(layers), layers };
    }

    if (projectType === 'backend') {
      const framework = await choose(rl, 'Backend framework', [
        ['nestjs', 'NestJS'],
        ['express', 'Express']
      ]);

      if (framework === 'nestjs') {
        const layers = resolvePreset('nestjs');
        return { presetName: 'nestjs', layers };
      }

      const language = await chooseLanguage(rl);
      const layers = resolvePreset(`express-${language === 'typescript' ? 'ts' : 'js'}`);
      return { presetName: getPresetNameFromLayers(layers), layers };
    }

    const uiFramework = await choose(rl, 'Electron renderer', [
      ['vue', 'Vue'],
      ['react', 'React'],
      ['none', 'No renderer framework']
    ]);
    const language = await chooseLanguage(rl);
    const suffix = language === 'typescript' ? 'ts' : 'js';
    const presetName =
      uiFramework === 'none' ? `electron-${suffix}` : `electron-${uiFramework}-${suffix}`;
    const layers = resolvePreset(presetName);
    return { presetName, layers };
  } finally {
    rl.close();
  }
}

async function chooseLanguage(rl) {
  return choose(rl, 'Language', [
    ['typescript', 'TypeScript'],
    ['javascript', 'JavaScript']
  ]);
}

async function choose(rl, label, choices) {
  console.log(label);

  for (const [index, [, choiceLabel]] of choices.entries()) {
    console.log(`  ${index + 1}. ${choiceLabel}`);
  }

  while (true) {
    const answer = await rl.question('Select number: ');
    const selectedIndex = Number(answer.trim()) - 1;
    const selected = choices[selectedIndex];

    if (selected) {
      console.log('');
      return selected[0];
    }

    console.log('Please enter one of the listed numbers.');
  }
}

async function buildWorkspaceFiles(layers) {
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

  for (const layer of layers) {
    const layerDir = path.join(envRootDir, 'templates', layer);

    if (!existsSync(layerDir)) {
      continue;
    }

    await mergeSettings(layerDir, mergedSettings);
    await mergeExtensions(layerDir, mergedExtensions);
    await mergeTasks(layerDir, mergedTasks);
    await mergeLaunch(layerDir, mergedLaunch);
  }

  return {
    settings: mergedSettings,
    extensions: {
      recommendations: [...mergedExtensions].sort()
    },
    tasks: mergedTasks.tasks.length > 0 ? mergedTasks : null,
    launch:
      mergedLaunch.configurations.length > 0 || mergedLaunch.compounds.length > 0
        ? mergedLaunch
        : null
  };
}

async function writeWorkspaceFiles({ targetProjectDir, outputFiles, mode }) {
  const vscodeDir = path.join(targetProjectDir, '.vscode');
  const writeMode = existsSync(vscodeDir)
    ? mode ?? (input.isTTY ? await promptForWriteMode(vscodeDir) : 'backup-and-overwrite')
    : 'create';

  if (writeMode === 'cancel') {
    console.log('Canceled. No files were changed.');
    process.exit(0);
  }

  let filesToWrite = outputFiles;

  if (writeMode === 'merge') {
    filesToWrite = await mergeExistingWorkspaceFiles(vscodeDir, outputFiles);
  }

  if (writeMode === 'backup-and-overwrite') {
    const backupDir = `${vscodeDir}.backup-${timestamp()}`;
    await cp(vscodeDir, backupDir, { recursive: true });
    await rm(vscodeDir, { recursive: true, force: true });
    console.log(`Backed up existing .vscode to ${backupDir}`);
  }

  await mkdir(vscodeDir, { recursive: true });
  await writeJson(path.join(vscodeDir, 'settings.json'), filesToWrite.settings);
  await writeJson(path.join(vscodeDir, 'extensions.json'), filesToWrite.extensions);

  if (filesToWrite.tasks) {
    await writeJson(path.join(vscodeDir, 'tasks.json'), filesToWrite.tasks);
  }

  if (filesToWrite.launch) {
    await writeJson(path.join(vscodeDir, 'launch.json'), filesToWrite.launch);
  }
}

async function writeProfileFile({ targetProjectDir, profileName, outputFiles }) {
  const profilesDir = path.join(targetProjectDir, 'profiles');
  const profilePath = path.join(profilesDir, `${profileName}.code-profile`);
  const profile = {
    name: profileName,
    settings: outputFiles.settings,
    extensions: outputFiles.extensions.recommendations,
    keybindings: [
      {
        key: 'ctrl+alt+l',
        command: 'editor.action.formatDocument',
        when: 'editorHasDocumentFormattingProvider && editorTextFocus && !editorReadonly'
      },
      {
        key: 'shift+f6',
        command: 'editor.action.rename',
        when: 'editorHasRenameProvider && editorTextFocus && !editorReadonly'
      },
      {
        key: 'ctrl+alt+o',
        command: 'editor.action.organizeImports',
        when: 'editorTextFocus && !editorReadonly'
      }
    ]
  };

  await mkdir(profilesDir, { recursive: true });
  await writeJson(profilePath, profile);

  return profilePath;
}

async function promptForWriteMode(vscodeDir) {
  const rl = createInterface({ input, output });

  try {
    console.log(`Existing VS Code workspace settings found: ${vscodeDir}`);
    console.log('  1. Back up existing .vscode, then overwrite it');
    console.log('  2. Merge preset into existing .vscode');
    console.log('  3. Cancel');

    while (true) {
      const answer = await rl.question('Select number: ');

      if (answer.trim() === '1') {
        return 'backup-and-overwrite';
      }

      if (answer.trim() === '2') {
        return 'merge';
      }

      if (answer.trim() === '3') {
        return 'cancel';
      }

      console.log('Please enter 1, 2, or 3.');
    }
  } finally {
    rl.close();
  }
}

async function mergeExistingWorkspaceFiles(vscodeDir, outputFiles) {
  const settings = await readJsonIfExists(path.join(vscodeDir, 'settings.json'), {});
  const extensions = await readJsonIfExists(path.join(vscodeDir, 'extensions.json'), {
    recommendations: []
  });
  const tasks = await readJsonIfExists(path.join(vscodeDir, 'tasks.json'), {
    version: '2.0.0',
    tasks: []
  });
  const launch = await readJsonIfExists(path.join(vscodeDir, 'launch.json'), {
    version: '0.2.0',
    configurations: [],
    compounds: []
  });

  deepMerge(settings, outputFiles.settings);

  const recommendationSet = new Set([
    ...(extensions.recommendations ?? []),
    ...(outputFiles.extensions.recommendations ?? [])
  ]);

  if (outputFiles.tasks) {
    mergeArrayByKey(tasks.tasks, outputFiles.tasks.tasks, 'label');
  }

  if (outputFiles.launch) {
    mergeArrayByKey(launch.configurations, outputFiles.launch.configurations, 'name');
    mergeArrayByKey(launch.compounds, outputFiles.launch.compounds, 'name');
  }

  return {
    settings,
    extensions: {
      ...extensions,
      recommendations: [...recommendationSet].sort()
    },
    tasks: tasks.tasks?.length > 0 ? tasks : null,
    launch: launch.configurations?.length > 0 || launch.compounds?.length > 0 ? launch : null
  };
}

async function mergeSettings(layerDir, mergedSettings) {
  const settingsPath = path.join(layerDir, 'settings.json');

  if (!existsSync(settingsPath)) {
    return;
  }

  deepMerge(mergedSettings, await readJsonStrict(settingsPath));
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
}

async function mergeLaunch(layerDir, mergedLaunch) {
  const launchPath = path.join(layerDir, 'launch.json');

  if (!existsSync(launchPath)) {
    return;
  }

  const launchJson = await readJsonStrict(launchPath);

  if (Array.isArray(launchJson.configurations)) {
    mergeArrayByKey(mergedLaunch.configurations, launchJson.configurations, 'name');
  }

  if (Array.isArray(launchJson.compounds)) {
    mergeArrayByKey(mergedLaunch.compounds, launchJson.compounds, 'name');
  }
}

async function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return readJsonStrict(filePath);
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

function splitLayers(value) {
  if (!value) {
    throw new Error('Missing value for --layers');
  }

  return value
    .split(',')
    .map((layer) => layer.trim())
    .filter(Boolean);
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

function timestamp() {
  return new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\..+$/, '')
    .replace('T', '-');
}

function printUsage() {
  console.log('Usage:');
  console.log('  hm-vscode-env');
  console.log('  hm-vscode-env apply <preset-name> [target-project]');
  console.log('  hm-vscode-env apply --layers node,frontend,vue,typescript [target-project]');
  console.log('');
  console.log('Known presets:');
  console.log(`  ${listPresetNames().join(', ')}`);
}
