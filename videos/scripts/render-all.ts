import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const compositions = [
  'ProductDemo',
  'ProductDemo-TikTok',
  'Explainer',
  'Explainer-Instagram',
  'Tutorial',
];

const outputDir = join(process.cwd(), 'out');

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

console.log('🎬 Rendering all videos...\n');

for (const composition of compositions) {
  const outputPath = join(outputDir, `${composition}.mp4`);
  console.log(`📹 Rendering ${composition}...`);

  try {
    execSync(`npx remotion render ${composition} ${outputPath}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log(`✅ ${composition} complete\n`);
  } catch (error) {
    console.error(`❌ Failed to render ${composition}\n`);
    process.exit(1);
  }
}

console.log('🎉 All videos rendered successfully!');
console.log(`📁 Output: ${outputDir}`);
