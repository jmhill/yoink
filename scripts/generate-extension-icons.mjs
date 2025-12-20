#!/usr/bin/env node
/**
 * Generates browser extension icons from the source yoink.png asset.
 *
 * Creates:
 * - icon-16.png (toolbar)
 * - icon-48.png (extension management page)
 * - icon-128.png (Chrome Web Store and install dialog)
 *
 * Usage: node scripts/generate-extension-icons.mjs
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_IMAGE = path.join(ROOT_DIR, 'assets', 'yoink.png');
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps', 'extension', 'src', 'icons');

/**
 * Generate a standard PNG icon at the given size
 */
async function generateIcon(size, outputName) {
  const outputPath = path.join(OUTPUT_DIR, outputName);
  await sharp(SOURCE_IMAGE)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
  console.log(`Created ${outputName} (${size}x${size})`);
}

async function main() {
  console.log('Generating extension icons from', SOURCE_IMAGE);
  console.log('Output directory:', OUTPUT_DIR);
  console.log('');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // Extension icons (Chrome requires 16, 48, 128)
    await generateIcon(16, 'icon-16.png');
    await generateIcon(48, 'icon-48.png');
    await generateIcon(128, 'icon-128.png');

    console.log('');
    console.log('Extension icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
