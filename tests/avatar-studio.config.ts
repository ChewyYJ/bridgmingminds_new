import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Keep this asset-preview gate separate from the developer's running app/data.
const base = 'http://127.0.0.1:3019';
process.env.E2E_WEB_URL = base;
process.env.E2E_API_URL = base;

export default defineConfig({
  testDir: '.',
  testMatch: 'avatar-studio.spec.ts',
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.AVATAR_BROWSER_PATH ? { executablePath: process.env.AVATAR_BROWSER_PATH } : undefined,
  },
  webServer: {
    command: 'npm run build:web && node tests/e2e-server.mjs',
    cwd: resolve(__dirname, '..'),
    url: `${base}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      EXPO_NO_DOTENV: '1',
      PORT: '3019',
      NODE_ENV: 'test',
      OPENAI_API_KEY: '',
      EXPO_PUBLIC_API_URL: '',
      DATABASE_PATH: './data/avatar-studio-e2e.sqlite',
      AUDIO_DIR: './data/avatar-studio-e2e-audio',
      ALLOWED_ORIGINS: base,
    },
  },
});
