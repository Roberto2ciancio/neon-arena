import { defineConfig } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5174)

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  fullyParallel: false,
  workers: 1,
  timeout: process.env.CI ? 90000 : 30000,
  expect: { timeout: process.env.CI ? 15000 : 5000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: process.env.CI ? { width: 480, height: 360 } : { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
