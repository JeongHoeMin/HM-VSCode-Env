export const layerDefinitions = {
  base: {
    label: 'Base',
    requires: []
  },
  python: {
    label: 'Python',
    requires: ['base']
  },
  fastapi: {
    label: 'FastAPI',
    requires: ['python']
  },
  node: {
    label: 'Node.js',
    requires: ['base']
  },
  javascript: {
    label: 'JavaScript',
    requires: ['node']
  },
  typescript: {
    label: 'TypeScript',
    requires: ['node']
  },
  frontend: {
    label: 'Frontend',
    requires: ['node']
  },
  backend: {
    label: 'Backend',
    requires: ['node']
  },
  vue: {
    label: 'Vue',
    requires: ['frontend']
  },
  react: {
    label: 'React',
    requires: ['frontend']
  },
  electron: {
    label: 'Electron',
    requires: ['node']
  },
  nestjs: {
    label: 'NestJS',
    requires: ['backend', 'typescript']
  },
  express: {
    label: 'Express',
    requires: ['backend']
  }
};

export const presetAliases = {
  base: ['base'],
  python: ['python'],
  fastapi: ['fastapi'],
  'node-js': ['javascript'],
  'node-ts': ['typescript'],
  'vue-js': ['vue', 'javascript'],
  'vue-ts': ['vue', 'typescript'],
  'react-js': ['react', 'javascript'],
  'react-ts': ['react', 'typescript'],
  'electron-js': ['electron', 'javascript'],
  'electron-ts': ['electron', 'typescript'],
  'electron-vue-js': ['electron', 'vue', 'javascript'],
  'electron-vue-ts': ['electron', 'vue', 'typescript'],
  'electron-react-js': ['electron', 'react', 'javascript'],
  'electron-react-ts': ['electron', 'react', 'typescript'],
  'express-js': ['express', 'javascript'],
  'express-ts': ['express', 'typescript'],
  nestjs: ['nestjs']
};

const preferredLayerOrder = [
  'base',
  'python',
  'fastapi',
  'node',
  'frontend',
  'backend',
  'javascript',
  'typescript',
  'vue',
  'react',
  'electron',
  'express',
  'nestjs'
];

export function resolvePreset(input) {
  const requestedLayers = Array.isArray(input)
    ? input
    : presetAliases[input] ?? [input];

  return resolveLayers(requestedLayers);
}

export function resolveLayers(requestedLayers) {
  const resolved = new Set();
  const visiting = new Set();

  for (const layer of requestedLayers) {
    visit(layer, resolved, visiting);
  }

  return [...resolved].sort(compareLayers);
}

export function listPresetNames() {
  return Object.keys(presetAliases).sort();
}

export function getPresetNameFromLayers(layers) {
  const normalized = resolveLayers(layers);

  for (const [presetName, presetLayers] of Object.entries(presetAliases)) {
    if (sameLayers(resolveLayers(presetLayers), normalized)) {
      return presetName;
    }
  }

  return normalized.filter((layer) => layer !== 'base').join('-') || 'base';
}

function visit(layer, resolved, visiting) {
  const definition = layerDefinitions[layer];

  if (!definition) {
    throw new Error(`Unknown layer: ${layer}`);
  }

  if (resolved.has(layer)) {
    return;
  }

  if (visiting.has(layer)) {
    throw new Error(`Circular layer dependency detected: ${layer}`);
  }

  visiting.add(layer);

  for (const requiredLayer of definition.requires) {
    visit(requiredLayer, resolved, visiting);
  }

  visiting.delete(layer);
  resolved.add(layer);
}

function compareLayers(left, right) {
  return preferredLayerOrder.indexOf(left) - preferredLayerOrder.indexOf(right);
}

function sameLayers(left, right) {
  return left.length === right.length && left.every((layer, index) => layer === right[index]);
}
