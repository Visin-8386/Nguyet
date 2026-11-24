/**
 * Điểm khởi động: nối DOM với Game.
 *
 * Luồng chính:
 *   1. Hiện màn hình bắt đầu (kèm cảnh báo nếu đang mở trong Zalo/Facebook/Messenger).
 *   2. Người dùng bấm "Bắt đầu" → mở khoá âm thanh → tải & preload ảnh → mở camera
 *      → tải model → vào game.
 *   3. Lỗi ở bất kỳ bước nào đều có thông báo tiếng Việt + cách khắc phục và
 *      lựa chọn thử lại / chơi bằng bàn phím.
 *
 * Ảnh và model đều nằm trong repo, không có request nào ra ngoài sau khi tải trang.
 */

import "./styles.css";
import { CameraStartError, EngineStartError, Game } from "./game";
import { blockExternalRequests } from "./privacy";
import { AudioEngine } from "./ui/audio";
import { prefersReducedMotion } from "./ui/effects";
import {
  describeAssetError,
  describeCameraError,
  describeEngineError,
  detectInAppBrowser,
  hideErrorScreen,
  preflightCheck,
  showErrorScreen,
} from "./ui/errors";
import { HandOverlay } from "./ui/overlay";
import { GameView } from "./ui/render";

// Phải chạy trước khi MediaPipe khởi tạo: chặn telemetry ẩn gửi ra ngoài.
blockExternalRequests();

const view = new GameView();
const audio = new AudioEngine();
const overlay = new HandOverlay(document.getElementById("overlay-canvas") as HTMLCanvasElement);

const startButton = document.getElementById("start-button") as HTMLButtonElement;
const noCameraButton = document.getElementById("btn-start-no-camera") as HTMLButtonElement;

let game: Game | null = null;
let busy = false;

overlay.setEnabled(true);
view.confetti.setEnabled(!prefersReducedMotion());
view.setSoundMuted(audio.muted);
// Vào thẳng camera: trên máy tính tự mở camera ngay. Trên điện thoại camera cần cử chỉ của người dùng,
// nên hiện màn hình bắt đầu để người bấm mở.
const isTouchDevice = navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches;
if (!isTouchDevice) {
  void startGame(true);
} else {
  view.showStart();
}

/* ------------------------------------------------------------------ */
/* Cảnh báo trình duyệt nhúng trong app (Zalo, Facebook, Messenger…)    */
/* ------------------------------------------------------------------ */

function setupInAppWarning(): void {
  const appName = detectInAppBrowser();
  if (!appName) return;
  const box = document.getElementById("inapp-warning");
  const text = document.getElementById("inapp-warning-text");
  const copyButton = document.getElementById("btn-copy-link") as HTMLButtonElement | null;
  if (!box || !text || !copyButton) return;

  text.textContent = `Bạn đang mở trong ${appName}. Trình duyệt bên trong ứng dụng thường chặn webcam. Hãy sao chép liên kết và mở bằng Chrome hoặc Safari để chơi đầy đủ.`;
  box.hidden = false;

  copyButton.addEventListener("click", () => {
    void copyCurrentLink(copyButton);
  });
}

async function copyCurrentLink(button: HTMLButtonElement): Promise<void> {
  const url = window.location.href;
  let copied: boolean;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    // Fallback cho trình duyệt nhúng / trình duyệt cũ không có Clipboard API.
    const area = document.createElement("textarea");
    area.value = url;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
  }
  button.textContent = copied ? "Đã sao chép!" : "Sao chép thủ công";
  if (!copied) button.title = url;
  window.setTimeout(() => {
    button.textContent = "Sao chép link";
  }, 2000);
}

/* ------------------------------------------------------------------ */
/* Khởi động game                                                      */
/* ------------------------------------------------------------------ */

function cameraErrorScreen(error: unknown): void {
  const info = describeCameraError(error);
  view.showStart();
  showErrorScreen(
    info.title,
    info.hint,
    { retry: true, keyboard: true },
    {
      onRetry: () => void startGame(true),
      onKeyboard: () => void startGame(false),
    },
  );
}

function engineErrorScreen(error: unknown): void {
  const info = describeEngineError(error);
  view.showStart();
  showErrorScreen(
    info.title,
    info.hint,
    { retry: true, keyboard: true },
    {
      onRetry: () => void startGame(true),
      onKeyboard: () => void startGame(false),
    },
  );
}

function assetErrorScreen(error: unknown): void {
  const info = describeAssetError(error);
  view.showStart();
  showErrorScreen(
    info.title,
    info.hint,
    { retry: true, keyboard: false },
    { onRetry: () => window.location.reload() },
  );
}

function emptyPoolScreen(): void {
  view.showStart();
  showErrorScreen(
    "Chưa có hình con vật nào",
    "Thư mục public/assets chưa có ảnh. Hãy thêm cặp ảnh vào thư mục nguồn (ví dụ D:/Nguyet/hoang) rồi chạy `npm run sync-assets`, sau đó tải lại trang.",
    { retry: true, keyboard: false },
    { onRetry: () => window.location.reload() },
  );
}

async function startGame(withCamera: boolean): Promise<void> {
  if (busy) return;

  // Kiểm tra HTTPS/quyền trước khi xin camera — nhưng vẫn cho chơi không camera.
  if (withCamera) {
    const problem = preflightCheck();
    if (problem) {
      view.showStart();
      showErrorScreen(
        problem.title,
        problem.hint,
        { retry: true, keyboard: true },
        {
          onRetry: () => void startGame(true),
          onKeyboard: () => void startGame(false),
        },
      );
      return;
    }
  }

  busy = true;
  startButton.disabled = true;
  noCameraButton.disabled = true;
  hideErrorScreen();

  try {
    // Gọi unlock trong sự kiện click (iOS) nhưng KHÔNG await — audio có thể bị chặn
    // vô hạn trên desktop auto-start; không được làm kẹt luồng mở camera.
    void audio.unlock();

    if (!game) {
      view.showLoading("Đang tải hình con vật…");
      try {
        game = await Game.create(view, audio, overlay, (progress) => {
          view.setLoadingProgress(progress);
        });
      } catch (error) {
        console.error("[main] Không tải được ảnh:", error);
        assetErrorScreen(error);
        return;
      }
    }

    if (game.animalCount === 0) {
      emptyPoolScreen();
      return;
    }

    view.showLoading(withCamera ? "Đang bật camera…" : "Đang chuẩn bị bàn phím…");
    view.setLoadingProgress(1);
    try {
      await game.start(withCamera, (stage) => {
        view.loadingText.textContent = stage;
      });
    } catch (error) {
      if (error instanceof CameraStartError) {
        console.warn("[main] Lỗi camera:", error.cause);
        cameraErrorScreen(error.cause);
      } else if (error instanceof EngineStartError) {
        console.warn("[main] Lỗi model:", error.cause);
        engineErrorScreen(error.cause);
      } else {
        console.error("[main] Lỗi không xác định khi khởi động:", error);
        assetErrorScreen(error);
      }
      return;
    }

    view.showGame();
  } finally {
    busy = false;
    startButton.disabled = false;
    noCameraButton.disabled = false;
  }
}

startButton.addEventListener("click", () => void startGame(true));
noCameraButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void startGame(false);
});

// Chạm bất kỳ đâu trên màn hình bắt đầu cũng bắt đầu (đỡ phải bấm đúng nút).
view.startScreen.addEventListener("click", (event) => {
  if (busy) return;
  const target = event.target as HTMLElement | null;
  if (target && target.closest("#btn-start-no-camera, #btn-copy-link")) return;
  void startGame(true);
});

/* ------------------------------------------------------------------ */
/* Kích thước lại canvas + dọn dẹp khi rời trang                       */
/* ------------------------------------------------------------------ */

let resizeRaf = 0;
function onResize(): void {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    overlay.resize();
    view.confetti.resize();
  });
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });

window.addEventListener("pagehide", () => {
  game?.dispose();
  game = null;
  overlay.clear();
});

// Nếu trang được khôi phục từ bfcache, camera/model đã bị đóng → tải lại sạch sẽ.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

setupInAppWarning();

// Service worker cache model/wasm/ảnh để lần sau tải nhanh hơn (nếu trình duyệt hỗ trợ).
// Chỉ đăng ký trên HTTPS thật (không phải localhost/Playwright) để tránh lỗi chứng chỉ tự ký.
if (
  "serviceWorker" in navigator &&
  location.hostname !== "localhost" &&
  location.hostname !== "127.0.0.1"
) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl).catch((error) => {
    console.warn("[main] Service worker không đăng ký được:", error);
  });
}
