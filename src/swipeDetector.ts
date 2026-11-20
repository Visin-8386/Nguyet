/**
 * SwipeDetector — phát hiện cú vuốt tay trái⇄phải từ luồng toạ độ tâm lòng bàn tay.
 *
 * Toạ độ đầu vào là toạ độ HIỂN THỊ (đã lật gương nếu đang dùng camera trước),
 * tính bằng pixel của khung hình gốc (videoWidth/videoHeight), nên tỉ lệ
 * quãng đường/dy-dx là tỉ lệ vật lý thật, không phụ thuộc màn hình dọc/ngang.
 */

import { SWIPE } from "./config";
import { OneEuroFilter2D } from "./oneEuroFilter";

export interface SwipeSample {
  /** Thời điểm lấy mẫu (ms). */
  t: number;
  /** Toạ độ tâm lòng bàn tay (px, toạ độ hiển thị). */
  x: number;
  y: number;
  /** Kích thước bàn tay (px): khoảng cách cổ tay – gốc ngón giữa. */
  handSize: number;
  /** Bàn tay đang mở (theo landmark hoặc category — do GestureEngine quyết định). */
  isOpen: boolean;
  /** Bàn tay đang nắm (theo landmark — do GestureEngine quyết định). */
  isFist: boolean;
}

export interface SwipeResult {
  /** "right" = vuốt từ trái sang phải (theo chiều người dùng nhìn thấy). */
  direction: "left" | "right";
  /** Toạ độ bắt đầu/kết thúc (px) của tâm lòng bàn tay. */
  startX: number;
  endX: number;
  /** Thời gian thực hiện (ms). */
  durationMs: number;
}

export interface SwipeDetectorConfig {
  windowMs: number;
  minDurationMs: number;
  minHandSizeRatio: number;
  minFrameRatio: number;
  velocityHandsPerSec: number;
  dyRatioMax: number;
  cooldownMs: number;
  bufferMs: number;
}

const DEFAULT_CONFIG: SwipeDetectorConfig = {
  windowMs: SWIPE.windowMs,
  minDurationMs: SWIPE.minDurationMs,
  minHandSizeRatio: SWIPE.minHandSizeRatio,
  minFrameRatio: SWIPE.minFrameRatio,
  velocityHandsPerSec: SWIPE.velocityHandsPerSec,
  dyRatioMax: SWIPE.dyRatioMax,
  cooldownMs: SWIPE.cooldownMs,
  bufferMs: SWIPE.bufferMs,
};

type TrackerState = "idle" | "tracking" | "cooldown";

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class SwipeDetector {
  private readonly cfg: SwipeDetectorConfig;
  private readonly filter: OneEuroFilter2D;

  private buffer: Sample[] = [];
  private state: TrackerState = "idle";
  private anchor: Sample | null = null;
  private dir: -1 | 0 | 1 = 0;
  private armed = true;
  private reversedSince: number | null = null;
  private lastEmitT = -Infinity;
  /** Thời điểm gần nhất bàn tay còn mở (để chịu được motion blur ngắn). */
  /** Chiều rộng khung hình (px) — đặt khi biết kích thước video. */
  private frameWidth: number;

  constructor(
    frameWidth = 640,
    config: Partial<SwipeDetectorConfig> = {},
    oneEuro: { freq: number; minCutoff: number; beta: number; dCutoff?: number } = SWIPE.oneEuro,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.frameWidth = Math.max(frameWidth, 1);
    this.filter = new OneEuroFilter2D(oneEuro);
  }

  setFrameWidth(width: number): void {
    if (width > 0) this.frameWidth = width;
  }

  /** Xoá toàn bộ trạng thái (khi mất tay / chơi lại). */
  reset(): void {
    this.buffer = [];
    this.state = "idle";
    this.anchor = null;
    this.armed = true;
    this.reversedSince = null;
    this.filter.reset();
  }

  /** Nhận 1 mẫu toạ độ; trả về kết quả vuốt nếu vừa hoàn thành một cú vuốt hợp lệ. */
  push(sample: SwipeSample): SwipeResult | null {
    const now = sample.t; // Tay nắm rõ ràng → huỷ theo dõi vuốt (giữ nguyên grace cho landmark bị mất tạm thời).
    if (sample.isFist) {
      this.reset();
      return null;
    }
    const f = this.filter.filter(sample.x, sample.y, now);
    this.buffer.push({ t: now, x: f.x, y: f.y });
    while (this.buffer.length > 0 && this.buffer[0].t < now - this.cfg.bufferMs) {
      this.buffer.shift();
    }

    const prev = this.buffer.length >= 2 ? this.buffer[this.buffer.length - 2] : null;
    let vxPerMs = 0;
    if (prev) {
      const dt = now - prev.t;
      if (dt > 0) vxPerMs = (f.x - prev.x) / dt;
    }

    if (this.state === "cooldown") {
      if (now - this.lastEmitT >= this.cfg.cooldownMs) {
        this.state = "idle";
      } else {
        return null; // đang nghỉ giữa 2 cú vuốt
      }
    }

    const handSize = Math.max(sample.handSize, 1);
    const velocityHandsPerSec = Math.abs(vxPerMs * 1000) / handSize;

    if (this.state === "idle") {
      // Cần "giãn tay" lại một chút sau cú vuốt trước mới cho phép cú mới.
      if (!this.armed) {
        if (velocityHandsPerSec < this.cfg.velocityHandsPerSec * 0.4) this.armed = true;
        return null;
      }
      // Bắt đầu theo dõi ngay khi được phép — chờ để thấy quả lớn mới tính.
      this.state = "tracking";
      this.anchor = { t: now, x: f.x, y: f.y };
      this.dir = 0;
      this.reversedSince = null;
      return null;
    }

    // state === "tracking": đang trong cửa sỏ vuốt
    const anchor = this.anchor;
    if (!anchor) {
      this.state = "idle";
      return null;
    }
    const elapsed = now - anchor.t;
    const dx = f.x - anchor.x;
    const dy = f.y - anchor.y;

    // Xác định hướng ban đầu khi đã có chuyển động rõ rệt.
    if (this.dir === 0 && Math.abs(dx) > 0.1 * Math.max(sample.handSize, 1)) {
      this.dir = Math.sign(dx) > 0 ? 1 : -1;
    }

    // Đổi chiều rõ rệt trong lúc vuốt → huỷ (tay run hoặc đổi hướng).
    if (this.dir !== 0 && vxPerMs !== 0 && Math.sign(vxPerMs) !== this.dir) {
      if (this.reversedSince === null) this.reversedSince = now;
      if (now - this.reversedSince > 80) {
        this.state = "idle";
        this.armed = false;
        this.reversedSince = null;
        return null;
      }
    } else {
      this.reversedSince = null;
    }

    // Quá cửa sổ thời gian: nối mốc neo, coi như bắt đầu theo dõi lại.
    if (elapsed > this.cfg.windowMs) {
      this.anchor = { t: now, x: f.x, y: f.y };
      this.reversedSince = null;
      return null;
    }

    if (elapsed < this.cfg.minDurationMs) return null;

    const minDistance = Math.max(
      this.cfg.minHandSizeRatio * handSize,
      this.cfg.minFrameRatio * this.frameWidth,
    );

    // Điều kiện cốt lõi: đủ quãng đường ngang, và đi gần như ngang.
    if (Math.abs(dx) >= minDistance && Math.abs(dy) <= this.cfg.dyRatioMax * Math.abs(dx)) {
      const result: SwipeResult = {
        direction: dx > 0 ? "right" : "left",
        startX: anchor.x,
        endX: f.x,
        durationMs: elapsed,
      };
      this.lastEmitT = now;
      this.state = "cooldown";
      this.armed = false;
      this.reversedSince = null;
      return result;
    }
    return null;
  }
}
