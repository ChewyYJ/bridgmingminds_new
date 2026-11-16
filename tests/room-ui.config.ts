import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = 'http://127.0.0.1:3028';
export default defineConfig({
  testDir: '.', testMatch: 'room-ui.spec.ts', workers: 1, fullyParallel: false,
  timeout: 90_000, expect: { timeout: 12_000 }, reporter: 'list',
  outputDir: '../artifacts/room/browser-results',
  use: { baseURL, viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.AVATAR_BROWSER_PATH ? { executablePath: process.env.AVATAR_BROWSER_PATH } : {} },
  webServer: { command: `"${process.execPath}" tests/e2e-server.mjs`, cwd: resolve(__dirname, '..'),
    url: `${baseURL}/api/health`, timeout: 60_000, reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    env: { EXPO_NO_DOTENV: '1', PORT: '3028', NODE_ENV: 'test', OPENAI_API_KEY: '', EXPO_PUBLIC_OPENAI_API_KEY: '',
      EXPO_PUBLIC_API_URL: '', DATABASE_PATH: './data/room-ui-e2e.sqlite', AUDIO_DIR: './data/room-ui-e2e-audio', ALLOWED_ORIGINS: baseURL } },
});
