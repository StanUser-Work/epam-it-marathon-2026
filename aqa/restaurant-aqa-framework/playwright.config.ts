import { defineConfig, devices, ReporterDescription } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

const reporters: ReporterDescription[] = [
  ['list'],
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ['junit', { outputFile: 'test-results/junit.xml' }],
];

// ⭐ Report Portal: enabled when RP_API_KEY / RP_ENDPOINT / RP_PROJECT are provided (locally in .env, in CI as secrets).
if (process.env.RP_API_KEY && process.env.RP_ENDPOINT && process.env.RP_PROJECT) {
  reporters.push([
    '@reportportal/agent-js-playwright',
    {
      apiKey: process.env.RP_API_KEY,
      endpoint: process.env.RP_ENDPOINT,
      project: process.env.RP_PROJECT,
      launch: process.env.RP_LAUNCH || 'Group pre-order e2e',
      description: `Run against ${process.env.FRONTEND_URL}`,
      attributes: [{ key: 'env', value: process.env.CI ? 'ci' : 'local' }],
      includeTestSteps: true,
    },
  ]);
}

export default defineConfig({
  testDir: './src/tests',
  globalSetup: require.resolve('./src/global-setup'),
  globalTeardown: require.resolve('./src/global-teardown'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // the deployed DynamoDB tables use 1 RCU/WCU — keep parallelism moderate
  workers: Number(process.env.WORKERS || 3),
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: reporters,
  use: {
    baseURL: process.env.FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
