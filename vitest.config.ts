import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts', 'data/**/*.test.ts'],
    // reference/ holds the read-only carried engine; never run its tests.
    exclude: ['node_modules/**', 'reference/**', '.next/**'],
  },
});
