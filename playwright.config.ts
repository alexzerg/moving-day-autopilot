import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  webServer: [
    {
      command: 'npm run dev:agent',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev --workspace @moving-day/web -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      env: { VITE_AGENT_API_URL: 'http://127.0.0.1:8787' },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
