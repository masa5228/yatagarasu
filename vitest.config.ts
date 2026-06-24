import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    env: {
      YATA_DB_PATH: ':memory:',
    },
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts', 'src/client/lib/**/*.ts'],
      exclude: ['src/server/dev.ts'],
    },
  },
});
