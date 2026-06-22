import { resolvePreset } from '../src/layers.mjs';

const presetName = process.argv[2];

if (!presetName) {
  console.error('Usage: node scripts/resolve-preset.mjs <preset-or-layer>');
  process.exit(1);
}

console.log(resolvePreset(presetName).join(' -> '));
