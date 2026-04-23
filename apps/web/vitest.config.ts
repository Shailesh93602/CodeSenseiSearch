import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vitest config for the web workspace.
 *
 * Uses happy-dom rather than jsdom — happy-dom is ~3x faster on
 * component-render tests and covers everything our suite needs.
 *
 * The `@/...` path alias mirrors tsconfig.json so component specs can
 * import from `@/components/...` the same way the app does.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
