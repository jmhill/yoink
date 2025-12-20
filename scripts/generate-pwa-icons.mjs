#!/usr/bin/env node
/**
 * Generates PWA icons from the source yoink.png asset.
 *
 * Creates:
 * - icon-192x192.png (standard icon)
 * - icon-512x512.png (large icon for splash)
 * - icon-maskable-512x512.png (maskable with white background and safe zone padding)
 * - apple-touch-icon.png (180x180 for iOS)
 * - favicon.ico (multi-size favicon)
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_IMAGE = path.join(ROOT_DIR, 'assets', 'yoink.png');
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps', 'web', 'public');

/**
 * Generate a standard PNG icon at the given size
 */
async function generateIcon(size, outputName) {
  const outputPath = path.join(OUTPUT_DIR, outputName);
  await sharp(SOURCE_IMAGE)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(outputPath);
  console.log(`Created ${outputName} (${size}x${size})`);
}

/**
 * Generate a maskable icon with white background and safe zone padding.
 * Maskable icons need the main content within the inner 80% (safe zone).
 * We scale the image to 80% and center it on a white background.
 */
async function generateMaskableIcon(size, outputName) {
  const outputPath = path.join(OUTPUT_DIR, outputName);
  const safeZoneSize = Math.floor(size * 0.8); // 80% is the safe zone

  // First resize the source to fit in the safe zone
  const resizedImage = await sharp(SOURCE_IMAGE)
    .resize(safeZoneSize, safeZoneSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();

  // Create white background and composite the resized image centered
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: resizedImage,
        gravity: 'center',
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`Created ${outputName} (${size}x${size}, maskable with safe zone)`);
}

async function main() {
  console.log('Generating PWA icons from', SOURCE_IMAGE);
  console.log('Output directory:', OUTPUT_DIR);
  console.log('');

  try {
    // Standard icons
    await generateIcon(192, 'icon-192x192.png');
    await generateIcon(512, 'icon-512x512.png');

    // Maskable icon (with safe zone padding)
    await generateMaskableIcon(512, 'icon-maskable-512x512.png');

    // Apple touch icon (180x180 is recommended)
    await generateIcon(180, 'apple-touch-icon.png');

    // Favicon
    await generateIcon(32, 'favicon.png');

    console.log('');
    console.log('PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
