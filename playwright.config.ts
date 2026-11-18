import { defineConfig, devices } from "@playwright/test";

/**
 * E2E chạy trên Chromium với camera giả (--use-fake-device-for-media-stream)
 * và tự động cấp quyền (--use-fake-ui-for-media-stream).
 * Điều khiển trò chơi bằng bàn phím (Space/F/mũi tên) nên không cần tay thật.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    port: 4173,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
