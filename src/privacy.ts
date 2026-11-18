/**
 * Bảo vệ quyền riêng tư ở tầng mạng.
 *
 * @mediapipe/tasks-vision có sẵn bộ gửi thống kê ẩn tới
 * https://odml.pa.googleapis.com/v1/log và tự POST sau khoảng 60 giây sử dụng.
 * Trò chơi cam kết video/ảnh không rời khỏi thiết bị và không có request bên
 * thứ ba sau khi tải trang, nên ta chặn mọi fetch ra ngoài origin hiện tại.
 *
 * Chỉ ảnh hưởng `fetch`. Mọi tài nguyên của game (model, wasm, ảnh, manifest)
 * đều cùng origin nên vẫn tải bình thường.
 */

/** Trả về true nếu URL trỏ ra ngoài origin của `baseUrl`. */
export function isExternalRequest(rawUrl: string, baseUrl: string): boolean {
  try {
    const url = new URL(rawUrl, baseUrl);
    // data:/blob: được xử lý ngay trong máy, không phải request mạng.
    if (url.protocol === "data:" || url.protocol === "blob:") return false;
    return url.origin !== new URL(baseUrl).origin;
  } catch {
    // URL không hợp lệ → để fetch gốc xử lý và báo lỗi như bình thường.
    return false;
  }
}

/** Thay `fetch` bằng bản chặn request ra ngoài origin. Gọi một lần khi khởi động. */
export function blockExternalRequests(target: Window = window): void {
  const originalFetch = target.fetch.bind(target);

  target.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (isExternalRequest(rawUrl, target.location.href)) {
      // Không gọi fetch gốc → không có request nào rời khỏi máy.
      return Promise.reject(
        new TypeError("Request ra ngoài origin đã bị chặn để bảo vệ quyền riêng tư"),
      );
    }

    return originalFetch(input, init);
  };
}
