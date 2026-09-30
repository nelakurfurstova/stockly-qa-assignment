import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.BASE_URL ?? 'https://stockly-azure-ten.vercel.app';
const username = process.env.STOCKLY_USER ?? 'admin';
const password = process.env.STOCKLY_PASSWORD ?? '';

if (!password) {
  throw new Error('STOCKLY_PASSWORD is not set. Copy .env.example to .env and fill it in.');
}

export default defineConfig({
  testDir: './tests',
  // Tests share one backend and products cannot be deleted (BUG-01),
  // so keep execution serial to avoid data races between tests.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    httpCredentials: { username, password }, // the app uses HTTP Basic Auth
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /.*\.api\.spec\.ts/ },
    { name: 'chromium', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
