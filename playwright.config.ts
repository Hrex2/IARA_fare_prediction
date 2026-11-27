import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  timeout: 90000,
  expect: {timeout:15000},
  use: {baseURL:'http://127.0.0.1:8000'},
  webServer: {
    command:'python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000',
    url:'http://127.0.0.1:8000/api/config',
    timeout:120000,
    reuseExistingServer:!process.env.CI,
  },
});
