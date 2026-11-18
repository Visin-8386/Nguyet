/**
 * Toàn bộ ngưỡng & tham số của trò chơi nằm gọn ở file này để dễ chỉnh sửa.
 * Mỗi hằng số đều có chú thích tiếng Việt ở ngay dưới.
 */

import labels from "../shared/animal-labels.json";

/** BASE_URL do Vite cấp (mặc định "/", trên GitHub Pages là "/<ten-repo>/"). */
const BASE: string = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/** MediaPipe: chạy offline hoàn toàn, không gọi CDN. */
export const MEDIAPIPE = {
  /** Thư mục wasm (copy từ node_modules, khớp phiên bản npm). */
  wasmPath: `${BASE}wasm`,
  /** Model gesture_recognizer float16. */
  modelPath: `${BASE}models/gesture_recognizer.task`,
  /** Số bàn tay tối đa nhận diện cùng lúc. */
  numHands: 1,
  /** Delegate ưu tiên GPU; nếu khởi tạo lỗi sẽ tự fallback CPU. */
  delegate: "GPU" as const,
  fallbackDelegate: "CPU" as const,
  /** Giới hạn tối đa số lần suy luận mỗi giây. */
  maxInferPerSecond: 30,
};

export const GESTURE = {
  /** Ngưỡng score để nhận "Open_Palm" (xòe tay). */
  openScore: 0.5,
  /** Ngưỡng score để nhận "Closed_Fist" (nắm tay). */
  fistScore: 0.5,
  /** Ngưỡng hysteresis: khi đang giữ một cử chỉ, score chỉ cần >= giá trị này để không bị nhấp nháy. */
  exitScore: 0.45,
  /** Cử chỉ phải ổn định liên tục >= 80ms mới được xác nhận. */
  stableMs: 80,
  /** Mất tay quá 800ms thì coi là không có tay (chịu được tracking chập chờn). */
  handLostMs: 800,
  /** Bàn tay nhỏ hơn ~28px (quá xa camera) thì không kiểm tra landmark nữa. */
  minHandSizePx: 28,
};

export const SWIPE = {
  /** Cửa sổ thời gian tối đa cho một cú vuốt (ms). */
  windowMs: 600,
  /** Thời gian tối thiểu của một cú vuốt (ms) — tránh nhiễu 1 frame. */
  minDurationMs: 100,
  /** Quãng đường ngang phải >= 1.5 lần kích thước bàn tay. */
  minHandSizeRatio: 1.5,
  /** ...và >= 10% chiều rộng khung hình. */
  minFrameRatio: 0.1,
  /** Ngưỡng vận tốc để bắt đầu theo dõi vuốt: 0.3 "bàn tay/giây". */
  velocityHandsPerSec: 0.3,
  /** Điều kiện vuốt ngang: |dy| <= 0.5 * |dx|. */
  dyRatioMax: 0.5,
  /** Nghỉ giữa 2 cú vuốt (ms). */
  cooldownMs: 600,
  /** Giữ lịch sử mẫu trong 700ms. */
  bufferMs: 700,
  /** Tham số One Euro Filter làm mượt toạ độ. */
  oneEuro: { freq: 30, minCutoff: 1.2, beta: 0.02 },
};

export const CAMERA = {
  /** ideal cho camera trước/sau. */
  width: 640,
  height: 480,
  frameRate: 30,
  /** Fallback khi máy yếu/thiết bị không đủ (tự thích ứng hiệu năng). */
  fallbackWidth: 320,
  fallbackHeight: 240,
  facingMode: "user" as const,
};

export const GAME = {
  /** Slot machine: đổi ảnh con vật mỗi 90ms. */
  slotMs: 90,
  /** Không có tay quá 8 giây (trừ INTRO) → tự về WAITING. */
  noHandTimeoutMs: 8000,
  /** Ở INTRO: không tương tác 60 giây → về WAITING. */
  introIdleTimeoutMs: 60000,
  /** Thời gian tối thiểu hiệu ứng lật thẻ (ms) để không bị cắt khi vuốt/fist đến quá nhanh. */
  revealLockMs: 450,
};

/** Chỉ số landmark dùng để tính tâm lòng bàn tay: cổ tay + gốc 4 ngón. */
export const PALM_CENTER_INDICES = [0, 5, 9, 13, 17] as const;
/** Cổ tay – gốc ngón giữa: dùng để "chuẩn hoá" theo kích thước bàn tay. */
export const WRIST_INDEX = 0;
export const MIDDLE_MCP_INDEX = 9;

/** Tên hiển thị theo id; id lạ thì trả về chính id đó. */
export const ANIMAL_LABELS: Record<string, string> = labels;
export function animalLabel(id: string): string {
  return ANIMAL_LABELS[id] ?? id;
}

export const PERF = {
  /** Giới hạn devicePixelRatio của canvas overlay. */
  maxDpr: 2,
  /** Trung bình suy luận chậm quá ngưỡng này (ms) thì hạ mức chất lượng. */
  slowInferMs: 24,
  verySlowInferMs: 45,
  /** Suy luận nhanh lại liên tục thì nâng mức chất lượng trở lại. */
  fastInferMs: 12,
  /** Số mẫu để tính trung bình suy luận. */
  sampleWindow: 30,
};

/** Đường dẫn manifest ảnh (tuyệt đối theo BASE_URL). */
export const MANIFEST_URL = `${BASE}assets/manifest.json`;

/** Trạng thái hiển thị cho debug panel. */
export const STATE_LABELS: Record<string, string> = {
  WAITING: "Đang chờ bàn tay",
  SPINNING: "Đang quay số",
  CAUGHT: "Đã bắt — chờ mở",
  REVEAL: "Lật thẻ",
  INTRO: "Xem giới thiệu",
};
