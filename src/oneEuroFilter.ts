/**
 * One Euro Filter — bộ lọc làm mượt toạ độ chuột/tay, ít trễ khi di chuyển nhanh.
 * Công thức chuẩn: x̂ = x̂_prev + α·(x − x̂_prev), với α suy ra từ tần số lấy mẫu.
 * Nguyên lý: di chuyển chậm → lọc mạnh (bớt rung); di chuyển nhanh → lọc yếu (bám sát).
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private xPrev = 0;
  private dxPrev = 0;
  private tPrev = 0;
  private started = false;

  constructor(options: { freq: number; minCutoff: number; beta: number; dCutoff?: number }) {
    this.minCutoff = options.minCutoff;
    this.beta = options.beta;
    this.dCutoff = options.dCutoff ?? 1;
  }

  /** Toán tử α chuẩn của One Euro: r = 1 + fc·dt; α = 1 / (1 + r). */
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.started = false;
  }

  /** @param value toạ độ đầu vào; @param tMs thời điểm lấy mẫu (ms). */
  filter(value: number, tMs: number): number {
    const dt = this.started ? Math.max((tMs - this.tPrev) / 1000, 1e-4) : 1 / 30;
    this.tPrev = tMs;

    // Lọc đạo theo để ước lượng vận tốc
    const dx = this.started ? (value - this.xPrev) / dt : 0;
    const ad = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = this.started ? ad * dx + (1 - ad) * this.dxPrev : 0;

    // Tần số cắt theo dữ liệu: đi nhanh thì lọc ít đi
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = this.started ? a * value + (1 - a) * this.xPrev : value;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.started = true;
    return xHat;
  }
}

/** Lọc song song cho toạ độ 2D (x, y dùng chung mốc thời gian). */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(options: { freq: number; minCutoff: number; beta: number; dCutoff?: number }) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x: number, y: number, tMs: number): { x: number; y: number } {
    return { x: this.fx.filter(x, tMs), y: this.fy.filter(y, tMs) };
  }
}
