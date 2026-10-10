import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
    dedupe: ['react', 'react-dom', 'i18next', 'react-i18next', 'axios', 'zustand'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.{test,spec}.{js,jsx,ts,tsx}'],
    setupFiles: ['./src/test-setup.js'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 20000,
  },
});
