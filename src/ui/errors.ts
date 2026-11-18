/**
 * Thông báo lỗi tiếng Việt kèm cách khắc phục cho từng tình huống thực tế.
 */

export interface ErrorInfo {
  title: string;
  hint: string;
}

const HTTPS_HINT =
  "Webcam chỉ hoạt động trên HTTPS hoặc localhost. Hãy mở bằng địa chỉ https://… (chấp nhận cảnh báo chứng chỉ tự ký khi chạy npm run dev), hoặc dùng link GitHub Pages.";

/** Phát hiện trình duyệt nhúng trong app (Zalo, Facebook, Messenger, …). */
export function detectInAppBrowser(): string | null {
  const ua = navigator.userAgent;
  const tests: Array<[RegExp, string]> = [
    [/Zalo/i, "Zalo"],
    [/FBAN|FBAV|FB_IAB|Messenger/i, "Facebook/Messenger"],
    [/Instagram/i, "Instagram"],
    [/\bLine\//i, "LINE"],
    [/TikTok|musical_ly/i, "TikTok"],
    [/MicroMessenger/i, "WeChat"],
    [/LinkedInApp/i, "LinkedIn"],
  ];
  for (const [re, name] of tests) {
    if (re.test(ua)) return name;
  }
  return null;
}

/** Kiểm tra môi trường trước khi xin quyền camera. */
export function preflightCheck(): ErrorInfo | null {
  if (!window.isSecureContext) {
    return {
      title: "Trang chưa chạy trên HTTPS",
      hint: HTTPS_HINT,
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: "Trình duyệt không hỗ trợ camera",
      hint: "Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới (iOS 16.4+). Bạn vẫn có thể chơi bằng bàn phím/cảm ứng.",
    };
  }
  return null;
}

/** Dịch lỗi getUserMedia thành thông báo dễ hiểu + cách khắc phục. */
export function describeCameraError(error: unknown): ErrorInfo {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        title: "Bạn đã từ chối quyền camera",
        hint: "Bấm biểu tượng ổ khoá/camera trên thanh địa chỉ → chọn “Cho phép” → tải lại trang. Trên iPhone: Cài đặt → Safari → Camera → “Hỏi” hoặc “Cho phép”.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        title: "Không tìm thấy camera",
        hint: "Kiểm tra máy có webcam và chưa bị vô hiệu hoá. Trên điện thoại, hãy chắc chắn không mở trình duyệt trong chế độ tiết kiệm pin chặn camera.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        title: "Camera đang bị ứng dụng khác sử dụng",
        hint: "Đóng các ứng dụng đang dùng camera (Zoom, Google Meet, Teams, OBS, Camera…) rồi bấm “Thử lại”. Trên Windows, kiểm tra Cài đặt → Quyền riêng tư → Camera.",
      };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        title: "Camera không hỗ trợ cấu hình yêu cầu",
        hint: "Thử đổi camera trước/sau hoặc dùng thiết bị khác. Bạn vẫn có thể chơi bằng bàn phím/cảm ứng.",
      };
    case "SecurityError":
      return { title: "Trình duyệt chặn camera vì lý do bảo mật", hint: HTTPS_HINT };
    case "AbortError":
      return {
        title: "Camera bị ngắt khi đang khởi động",
        hint: "Đóng ứng dụng khác đang dùng camera rồi bấm “Thử lại”.",
      };
    default:
      return {
        title: "Không mở được camera",
        hint: `Kiểm tra quyền camera và thiết bị rồi thử lại. ${
          error instanceof Error ? `Chi tiết: ${error.message}` : ""
        }`,
      };
  }
}

/** Lỗi khởi tạo MediaPipe (WASM/WebGL). */
export function describeEngineError(error: unknown): ErrorInfo {
  return {
    title: "Không khởi động được bộ nhận diện cử chỉ",
    hint: `Trình duyệt có thể thiếu WebGL/WASM hoặc đang tắt tăng tốc phần cứng. Hãy thử Chrome/Edge/Safari bản mới, bật tăng tốc phần cứng, hoặc chơi bằng bàn phím/cảm ứng. ${
      error instanceof Error ? `(${error.message})` : ""
    }`,
  };
}

/** Lỗi tải tài nguyên (manifest/ảnh). */
export function describeAssetError(error: unknown): ErrorInfo {
  return {
    title: "Không tải được hình con vật",
    hint: `Hãy chạy lại \`npm run sync-assets\` rồi tải lại trang. ${
      error instanceof Error ? `(${error.message})` : ""
    }`,
  };
}

export function showErrorScreen(
  title: string,
  hint: string,
  options: { retry: boolean; keyboard: boolean },
  handlers: { onRetry?: () => void; onKeyboard?: () => void },
): void {
  const screen = document.getElementById("error-screen");
  const titleEl = document.getElementById("error-title");
  const hintEl = document.getElementById("error-hint");
  const retryBtn = document.getElementById("btn-error-retry");
  const keyboardBtn = document.getElementById("btn-error-no-camera");
  if (!screen || !titleEl || !hintEl || !retryBtn || !keyboardBtn) return;

  titleEl.textContent = title;
  hintEl.textContent = hint;
  retryBtn.hidden = !options.retry;
  keyboardBtn.hidden = !options.keyboard;
  retryBtn.onclick = handlers.onRetry ?? null;
  keyboardBtn.onclick = handlers.onKeyboard ?? null;
  screen.hidden = false;
  screen.classList.add("visible");
}

export function hideErrorScreen(): void {
  const screen = document.getElementById("error-screen");
  if (!screen) return;
  screen.hidden = true;
  screen.classList.remove("visible");
}
