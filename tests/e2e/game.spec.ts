import { expect, test } from "@playwright/test";

/**
 * E2E chạy hoàn toàn bằng bàn phím / cảm ứng (không cần camera thật),
 * kiểm tra đúng chuỗi trạng thái và yêu cầu không lộ con vật ở CAUGHT.
 */
test("luồng chơi đầy đủ: chờ → quay → bắt → lật → giới thiệu → chơi lại", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#start-screen")).toBeVisible();
  await expect(page.locator("#start-button")).toBeVisible();

  // Chế độ không camera: 3 nút cảm ứng phải hiện, video phải ẩn.
  await page.locator("#btn-start-no-camera").click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "WAITING");
  await expect(page.locator("#touch-controls")).toBeVisible();
  await expect(page.locator("#camera-video")).toBeHidden();

  // WAITING --OPEN--> SPINNING
  await page.keyboard.press("Space");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "SPINNING");
  await expect.poll(() => page.locator("#animal-image").getAttribute("src")).toBeTruthy();

  // SPINNING --FIST--> CAUGHT: tuyệt đối không lộ ảnh/tên con vật
  await page.keyboard.press("KeyF");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "CAUGHT");
  await expect(page.locator("#card")).toHaveClass(/is-mystery/);
  expect(await page.locator("#animal-image").getAttribute("src")).toBeNull();
  expect(await page.locator("#animal-name").textContent()).toBe("");

  // CAUGHT --OPEN--> REVEAL
  await page.keyboard.press("Space");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "REVEAL");
  await expect(page.locator("#card")).not.toHaveClass(/is-mystery/);
  await expect(page.locator("#animal-image")).toHaveAttribute("src", /\.webp/);
  await expect(page.locator("#animal-name")).not.toBeEmpty();

  // REVEAL --SWIPE_LR--> INTRO: ảnh poster "_2" trượt vào
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "INTRO");
  await expect(page.locator("#intro-image")).toBeVisible();
  await expect(page.locator("#intro-image")).toHaveAttribute("src", /_2\.webp/);

  // INTRO --SWIPE_RL--> REVEAL
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "REVEAL");
  await expect(page.locator("#intro-image")).toBeHidden();

  // REVEAL --FIST--> SPINNING → bắt lại → lật thẻ
  await page.keyboard.press("KeyF");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "SPINNING");
  await expect.poll(() => page.locator("#animal-image").getAttribute("src")).toBeTruthy();
  await page.keyboard.press("KeyF");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "CAUGHT");
  await page.keyboard.press("Space");
  await expect(page.locator("#game")).toHaveAttribute("data-state", "REVEAL");

  // "Chơi lại" luôn khả dụng
  await page.locator("#btn-replay").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "SPINNING");

  expect(consoleErrors).toEqual([]);
});

test("3 nút cảm ứng điều khiển đúng hướng ở mọi trạng thái", async ({ page }) => {
  await page.goto("/");
  await page.locator("#btn-start-no-camera").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "WAITING");

  await page.locator("#btn-open").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "SPINNING");

  await page.locator("#btn-fist").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "CAUGHT");

  await page.locator("#btn-open").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "REVEAL");

  // Ở REVEAL, nút "Vuốt" mặc định là trái → phải
  await page.locator("#btn-swipe").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "INTRO");

  // Ở INTRO, nút "Vuốt" mặc định là phải → trái
  await page.locator("#btn-swipe").click();
  await expect(page.locator("#game")).toHaveAttribute("data-state", "REVEAL");
});

test("mở camera giả và hiển thị video trong game", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  // MediaPipe in "INFO: ..." qua console.error — thông tin, không phải lỗi ứng dụng.
  const benign = [/TensorFlow Lite XNNPACK delegate for CPU/];
  page.on("console", (message) => {
    if (message.type() === "error" && !benign.some((re) => re.test(message.text()))) {
      consoleErrors.push(message.text());
    }
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
  await page.locator("#start-button").click();
  await expect(page.locator("#game")).toBeVisible({ timeout: 150_000 });
  await expect(page.locator("#game")).toHaveAttribute("data-state", "WAITING");

  const video = page.locator("#camera-video");
  // Máy yếu có thể tự hạ độ phân giải → videoWidth tạm bằng 0 trong lúc đổi nguồn.
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  const info = await video.evaluate((element) => {
    const el = element as HTMLVideoElement;
    return {
      width: el.videoWidth,
      height: el.videoHeight,
      paused: el.paused,
      hasStream: !!el.srcObject,
    };
  });
  expect(info.width).toBeGreaterThan(0);
  expect(info.height).toBeGreaterThan(0);
  expect(info.paused).toBe(false);
  expect(info.hasStream).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains("no-camera"))).toBe(false);

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("chặn fetch ra ngoài origin (telemetry ẩn của MediaPipe)", async ({ page }) => {
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

  // fetch cùng origin vẫn hoạt động bình thường.
  const localOk = await page.evaluate(async () => {
    const response = await fetch("/assets/manifest.json");
    return response.ok;
  });
  expect(localOk).toBe(true);

  // Endpoint telemetry mà MediaPipe tự gọi sau ~60 giây phải bị chặn ngay.
  const result = await page.evaluate(async () => {
    try {
      await fetch("https://odml.pa.googleapis.com/v1/log", {
        method: "POST",
        body: "test",
      });
      return "resolved";
    } catch (error) {
      return error instanceof TypeError ? "blocked" : "other-error";
    }
  });
  expect(result).toBe("blocked");

  // Chờ thêm để chắc chắn không có request nào lọt ra mạng.
  await page.waitForTimeout(500);
  expect(externalRequests).toEqual([]);
});
