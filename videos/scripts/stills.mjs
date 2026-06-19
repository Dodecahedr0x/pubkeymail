import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
import { mkdirSync } from 'fs';

const root = process.cwd();
const outDir = path.join(root, 'inspect');
mkdirSync(outDir, { recursive: true });

const webpackOverride = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      '@web': path.resolve(root, '../web'),
      '@': path.resolve(root, './src'),
    },
  },
});

// id -> [frames]
const targets = JSON.parse(process.argv[2]);

console.log('Bundling...');
const serveUrl = await bundle({
  entryPoint: path.join(root, 'src/index.tsx'),
  webpackOverride,
  publicDir: path.join(root, 'public'),
});
console.log('Bundled.');

for (const [id, frames] of Object.entries(targets)) {
  const composition = await selectComposition({ serveUrl, id });
  for (const frame of frames) {
    const output = path.join(outDir, `${id}_f${frame}.png`);
    await renderStill({
      serveUrl,
      composition,
      output,
      frame,
      overwrite: true,
    });
    console.log('Wrote', output);
  }
}
console.log('Done.');
