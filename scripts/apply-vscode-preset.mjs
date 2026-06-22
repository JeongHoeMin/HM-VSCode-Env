#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import {
  getPresetNameFromLayers,
  listPresetNames,
  resolveLayers,
  resolvePreset
} from '../src/layers.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envRootDir = path.resolve(scriptDir, '..');
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

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
const defaultProfileName = `hm-${selection.presetName}`;
const profileName =
  options.profileName ??
  (isInteractive
    ? await input({
        message: 'VS Code Profile name',
        default: defaultProfileName
      })
    : defaultProfileName);

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

const setupPlan = await resolveProfileSetupPlan({
  options,
  outputFiles,
  profileName
});

const setupResult = await setupVsCodeProfile({
  targetProjectDir,
  profileName,
  extensionIds: setupPlan.extensionIds,
  shouldSetupProfile: setupPlan.shouldSetupProfile
});

printSummary({
  selection,
  targetProjectDir,
  profileName,
  profilePath,
  setupPlan,
  setupResult
});

function parseArgs(rawArgs) {
  const result = {
    installExtensions: null,
    layers: null,
    mode: null,
    presetName: null,
    profileName: null,
    setupProfile: null,
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

    if (arg === '--profile-name') {
      result.profileName = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--profile-name=')) {
      result.profileName = arg.slice('--profile-name='.length);
      continue;
    }

    if (arg === '--setup-profile') {
      result.setupProfile = true;
      continue;
    }

    if (arg === '--skip-profile') {
      result.setupProfile = false;
      result.installExtensions = false;
      continue;
    }

    if (arg === '--install-extensions') {
      result.installExtensions = true;
      continue;
    }

    if (arg === '--no-install-extensions') {
      result.installExtensions = false;
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
  console.log('HM VS Code Env');
  console.log('Use arrow keys to move, space to toggle checkboxes, and enter to confirm.');
  console.log('');

  const runtime = await select({
    message: 'Runtime',
    loop: false,
    choices: [
      { name: 'Node.js', value: 'node' },
      { name: 'Python', value: 'python' }
    ]
  });

  if (runtime === 'python') {
    const framework = await select({
      message: 'Python framework',
      loop: false,
      choices: [
        { name: 'Plain Python', value: 'python' },
        { name: 'FastAPI', value: 'fastapi' }
      ]
    });
    const layers = resolvePreset(framework);
    return { presetName: getPresetNameFromLayers(layers), layers };
  }

  const projectType = await select({
    message: 'Node project type',
    loop: false,
    choices: [
      { name: 'Node only', value: 'node' },
      { name: 'Frontend', value: 'frontend' },
      { name: 'Backend', value: 'backend' },
      { name: 'Electron', value: 'electron' }
    ]
  });

  if (projectType === 'node') {
    const language = await chooseLanguage();
    const layers = resolvePreset(language === 'typescript' ? 'node-ts' : 'node-js');
    return { presetName: getPresetNameFromLayers(layers), layers };
  }

  if (projectType === 'frontend') {
    const framework = await select({
      message: 'Frontend framework',
      loop: false,
      choices: [
        { name: 'Vue', value: 'vue' },
        { name: 'React', value: 'react' }
      ]
    });
    const language = await chooseLanguage();
    const layers = resolvePreset(`${framework}-${language === 'typescript' ? 'ts' : 'js'}`);
    return { presetName: getPresetNameFromLayers(layers), layers };
  }

  if (projectType === 'backend') {
    const framework = await select({
      message: 'Backend framework',
      loop: false,
      choices: [
        { name: 'NestJS', value: 'nestjs' },
        { name: 'Express', value: 'express' }
      ]
    });

    if (framework === 'nestjs') {
      const layers = resolvePreset('nestjs');
      return { presetName: 'nestjs', layers };
    }

    const language = await chooseLanguage();
    const layers = resolvePreset(`express-${language === 'typescript' ? 'ts' : 'js'}`);
    return { presetName: getPresetNameFromLayers(layers), layers };
  }

  const uiFramework = await select({
    message: 'Electron renderer',
    loop: false,
    choices: [
      { name: 'Vue', value: 'vue' },
      { name: 'React', value: 'react' },
      { name: 'No renderer framework', value: 'none' }
    ]
  });
  const language = await chooseLanguage();
  const suffix = language === 'typescript' ? 'ts' : 'js';
  const presetName =
    uiFramework === 'none' ? `electron-${suffix}` : `electron-${uiFramework}-${suffix}`;
  const layers = resolvePreset(presetName);
  return { presetName, layers };
}

async function chooseLanguage() {
  return select({
    message: 'Language',
    loop: false,
    choices: [
      { name: 'TypeScript', value: 'typescript' },
      { name: 'JavaScript', value: 'javascript' }
    ]
  });
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
    ? mode ?? (isInteractive ? await promptForWriteMode(vscodeDir) : 'backup-and-overwrite')
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

async function promptForWriteMode(vscodeDir) {
  console.log(`Existing VS Code workspace settings found: ${vscodeDir}`);

  return select({
    message: 'How should this CLI handle the existing .vscode folder?',
    default: 'backup-and-overwrite',
    loop: false,
    choices: [
      {
        name: 'Back up existing .vscode, then overwrite it',
        value: 'backup-and-overwrite'
      },
      {
        name: 'Merge preset into existing .vscode',
        value: 'merge'
      },
      {
        name: 'Cancel',
        value: 'cancel'
      }
    ]
  });
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

async function resolveProfileSetupPlan({ options, outputFiles, profileName }) {
  const allExtensionIds = outputFiles.extensions.recommendations;
  const shouldSetupProfile =
    options.setupProfile ??
    (isInteractive
      ? await confirm({
          message: `Create or open VS Code Profile "${profileName}" for this project?`,
          default: true
        })
      : false);

  if (!shouldSetupProfile) {
    return {
      shouldSetupProfile: false,
      extensionIds: []
    };
  }

  if (options.installExtensions === false) {
    return {
      shouldSetupProfile: true,
      extensionIds: []
    };
  }

  if (options.installExtensions === true || !isInteractive) {
    return {
      shouldSetupProfile: true,
      extensionIds: allExtensionIds
    };
  }

  const extensionIds = await checkbox({
    message: 'Select extensions to install into this VS Code Profile',
    instructions: 'Use space to toggle, enter to continue.',
    loop: false,
    required: false,
    choices: allExtensionIds.map((extensionId) => ({
      name: extensionId,
      value: extensionId,
      checked: true
    }))
  });

  return {
    shouldSetupProfile: true,
    extensionIds
  };
}

async function setupVsCodeProfile({
  targetProjectDir,
  profileName,
  extensionIds,
  shouldSetupProfile
}) {
  if (!shouldSetupProfile) {
    return {
      status: 'skipped',
      installedExtensions: []
    };
  }

  const codeCommand = findCodeCommand();

  if (!codeCommand) {
    return {
      status: 'missing-code-cli',
      installedExtensions: []
    };
  }

  await runCodeCommand(codeCommand, ['--profile', profileName, targetProjectDir]);

  const profileReady = await waitForProfileAvailable(codeCommand, profileName);

  if (!profileReady) {
    return {
      status: 'profile-not-ready',
      installedExtensions: [],
      failedExtensions: extensionIds
    };
  }

  const installedExtensions = [];
  const failedExtensions = [];

  for (const extensionId of extensionIds) {
    try {
      await runCodeCommand(codeCommand, [
        '--profile',
        profileName,
        '--install-extension',
        extensionId
      ]);
      installedExtensions.push(extensionId);
    } catch (error) {
      failedExtensions.push(extensionId);
      console.warn(`Could not install ${extensionId}: ${error.message}`);
    }
  }

  return {
    status: 'configured',
    installedExtensions,
    failedExtensions
  };
}

async function waitForProfileAvailable(codeCommand, profileName) {
  const maxAttempts = 20;
  const delayMs = 750;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnCodeSync(codeCommand, ['--profile', profileName, '--list-extensions'], {
      stdio: 'ignore'
    });

    if (result.status === 0) {
      return true;
    }

    await delay(delayMs);
  }

  return false;
}

async function delay(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function findCodeCommand() {
  const candidates =
    process.platform === 'win32'
      ? [
          'code',
          path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd')
        ]
      : ['code'];

  return candidates.find((candidate) => candidate && commandCanStart(candidate));
}

function commandCanStart(command) {
  const result = spawnCodeSync(command, ['--version'], {
    stdio: 'ignore'
  });

  return result.status === 0;
}

async function runCodeCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawnCode(command, args, {
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`VS Code CLI failed: ${command} ${args.join(' ')}`));
    });
  });
}

function spawnCode(command, args, options) {
  if (process.platform !== 'win32') {
    return spawn(command, args, {
      shell: false,
      ...options
    });
  }

  return spawn('cmd.exe', ['/d', '/s', '/c', buildWindowsCommand(command, args)], {
    shell: false,
    ...options
  });
}

function spawnCodeSync(command, args, options) {
  if (process.platform !== 'win32') {
    return spawnSync(command, args, {
      shell: false,
      ...options
    });
  }

  return spawnSync('cmd.exe', ['/d', '/s', '/c', buildWindowsCommand(command, args)], {
    shell: false,
    ...options
  });
}

function buildWindowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(' ');
}

function quoteWindowsArg(value) {
  const stringValue = String(value);

  if (!/[\s"]/u.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '\\"')}"`;
}

function printSummary({
  selection,
  targetProjectDir,
  profileName,
  profilePath,
  setupPlan,
  setupResult
}) {
  console.log('');
  console.log(`Applied VS Code environment: ${selection.presetName}`);
  console.log(`Layers: ${selection.layers.join(' -> ')}`);
  console.log(`Workspace files: ${path.join(targetProjectDir, '.vscode')}`);
  console.log(`Profile export file: ${profilePath}`);
  console.log('');
  console.log('.vscode files are project-level settings and extension recommendations.');
  console.log('.code-profile is a shareable/exportable profile file for VS Code settings, keybindings, and extensions.');

  if (setupResult.status === 'configured') {
    console.log('');
    console.log(`VS Code Profile configured: ${profileName}`);
    console.log(`Installed extensions in profile: ${setupResult.installedExtensions.length}`);

    if (setupResult.failedExtensions?.length > 0) {
      console.log(`Extensions that need manual retry: ${setupResult.failedExtensions.length}`);
      console.log(`Retry with: code --profile "${profileName}" --install-extension <extension-id>`);
    }

    console.log(`Open this project with: code . --profile "${profileName}"`);
    return;
  }

  if (setupResult.status === 'profile-not-ready') {
    console.log('');
    console.log(`VS Code Profile was opened but was not ready for extension installation yet: ${profileName}`);
    console.log('Open the project once, then retry extension installation with:');
    console.log(`  hm-vscode-env apply ${selection.presetName} "${targetProjectDir}" --setup-profile --install-extensions`);
    return;
  }

  if (setupResult.status === 'missing-code-cli') {
    console.log('');
    console.log('VS Code CLI was not found, so the Profile could not be created automatically.');
    console.log('Manual setup:');
    console.log('  1. Open VS Code Command Palette');
    console.log('  2. Run "Profiles: Import Profile..."');
    console.log('  3. Select the generated .code-profile file');
    console.log(`  4. Open this project with: code . --profile "${profileName}"`);
    return;
  }

  if (setupPlan.shouldSetupProfile) {
    console.log('');
    console.log(`VS Code Profile setup was requested for: ${profileName}`);
    console.log('No extensions were selected for installation.');
    return;
  }

  console.log('');
  console.log('VS Code Profile setup was skipped.');
  console.log(`Import manually later from: ${profilePath}`);
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
  console.log('Options:');
  console.log('  --mode <backup-and-overwrite|merge|cancel>');
  console.log('  --profile-name <name>');
  console.log('  --setup-profile');
  console.log('  --skip-profile');
  console.log('  --install-extensions');
  console.log('  --no-install-extensions');
  console.log('');
  console.log('Known presets:');
  console.log(`  ${listPresetNames().join(', ')}`);
}
