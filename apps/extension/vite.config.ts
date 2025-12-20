import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
} from 'fs';

// Plugin to copy manifest, icons, and fix HTML paths
const extensionBuildPlugin = () => ({
  name: 'extension-build',
  writeBundle() {
    const distDir = path.resolve(__dirname, 'dist');

    // Copy manifest.json
    copyFileSync(
      path.resolve(__dirname, 'src/manifest.json'),
      path.resolve(distDir, 'manifest.json')
    );

    // Copy icons if they exist
    const iconsDir = path.resolve(distDir, 'icons');
    if (!existsSync(iconsDir)) {
      mkdirSync(iconsDir, { recursive: true });
    }
    const srcIconsDir = path.resolve(__dirname, 'src/icons');
    if (existsSync(srcIconsDir)) {
      for (const icon of ['icon-16.png', 'icon-48.png', 'icon-128.png']) {
        const srcPath = path.resolve(srcIconsDir, icon);
        if (existsSync(srcPath)) {
          copyFileSync(srcPath, path.resolve(iconsDir, icon));
        }
      }
    }

    // Move HTML files from dist/src/* to dist/*
    const distSrcDir = path.resolve(distDir, 'src');
    if (existsSync(distSrcDir)) {
      // Move popup
      const popupSrc = path.resolve(distSrcDir, 'popup');
      const popupDest = path.resolve(distDir, 'popup');
      if (existsSync(popupSrc)) {
        if (existsSync(popupDest)) rmSync(popupDest, { recursive: true });
        renameSync(popupSrc, popupDest);
      }
      // Move options
      const optionsSrc = path.resolve(distSrcDir, 'options');
      const optionsDest = path.resolve(distDir, 'options');
      if (existsSync(optionsSrc)) {
        if (existsSync(optionsDest)) rmSync(optionsDest, { recursive: true });
        renameSync(optionsSrc, optionsDest);
      }
      // Clean up empty src directory
      rmSync(distSrcDir, { recursive: true });
    }
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), extensionBuildPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup/index.html'),
        options: path.resolve(__dirname, 'src/options/index.html'),
        'background/service-worker': path.resolve(
          __dirname,
          'src/background/service-worker.ts'
        ),
        'content/content-script': path.resolve(
          __dirname,
          'src/content/content-script.ts'
        ),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
