import { expect, test } from "@playwright/test";

/**
 * E2E với camera giả (fake device): vào thẳng game, kiểm tra video, không request ra ngoài origin.
 */
const BENIGN = /TensorFlow Lite XNNPACK delegate for CPU/;

test("vào thẳng camera: video chạy, không request ngoài origin", async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !BENIGN.test(message.text()))
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      !url.startsWith("https://localhost:4173/") &&
      !url.startsWith("data:") &&
      !url.startsWith("blob:")
    ) {
      externalRequests.push(url);
    }
  });

  await page.goto("/");
  // Vào thẳng game: không cần bấm "Bắt đầu".
  await expect(page.locator("#game")).toBeVisible({ timeout: 15000 });
  expect(await page.locator("#game").getAttribute("data-state")).toBe("WAITING");

  const video = page.locator("#camera-video");
  await expect
    .poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const info = await video.evaluate((el) => {
    const e = el as HTMLVideoElement;
    return { width: e.videoWidth, height: e.videoHeight, paused: e.paused };
  });
  expect(info.width).toBeGreaterThan(0);
  expect(info.paused).toBe(false);

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("chặn fetch ra ngoài origin", async ({ page }) => {
  const blocked: string[] = [];
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.startsWith("https://") && !url.startsWith("https://localhost:")) blocked.push(url);
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://") && !url.startsWith("https://localhost:")) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible({ timeout: 15000 });
  expect(blocked).toEqual([]);
});
