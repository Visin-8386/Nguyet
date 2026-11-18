import { describe, expect, it } from "vitest";
import { SwipeDetector, type SwipeResult } from "../../src/swipeDetector";

const FRAME_WIDTH = 640;

interface FeedOptions {
  startX: number;
  startY?: number;
  dxPerStep: number;
  dyPerStep?: number;
  steps: number;
  handSize?: number;
  stepMs?: number;
  isOpen?: boolean;
}

function feed(detector: SwipeDetector, options: FeedOptions): SwipeResult[] {
  const results: SwipeResult[] = [];
  const stepMs = options.stepMs ?? 33;
  for (let i = 0; i < options.steps; i += 1) {
    const result = detector.push({
      t: i * stepMs,
      x: options.startX + i * options.dxPerStep,
      y: (options.startY ?? 240) + i * (options.dyPerStep ?? 0),
      handSize: options.handSize ?? 80,
      isOpen: options.isOpen ?? true,
    });
    if (result) results.push(result);
  }
  return results;
}

describe("SwipeDetector", () => {
  it("nhận cú vuốt trái → phải (direction right)", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, { startX: 120, dxPerStep: 14, steps: 24 });
    expect(results).toHaveLength(1);
    expect(results[0].direction).toBe("right");
    expect(results[0].endX).toBeGreaterThan(results[0].startX);
    expect(results[0].durationMs).toBeLessThanOrEqual(500);
  });

  it("nhận cú vuốt phải → trái (direction left)", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, { startX: 520, dxPerStep: -14, steps: 24 });
    expect(results).toHaveLength(1);
    expect(results[0].direction).toBe("left");
    expect(results[0].endX).toBeLessThan(results[0].startX);
  });

  it("bỏ qua chuyển động chéo (|dy| > 0.5|dx|)", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, {
      startX: 120,
      dxPerStep: 14,
      dyPerStep: 12,
      steps: 30,
    });
    expect(results).toHaveLength(0);
  });

  it("bỏ qua tay đứng yên", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, { startX: 320, dxPerStep: 0, steps: 30 });
    expect(results).toHaveLength(0);
  });

  it("bỏ qua tay rung nhẹ quanh một vị trí", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results: SwipeResult[] = [];
    for (let i = 0; i < 40; i += 1) {
      const result = detector.push({
        t: i * 33,
        x: 320 + (i % 2 === 0 ? 2 : -2),
        y: 240,
        handSize: 80,
        isOpen: true,
      });
      if (result) results.push(result);
    }
    expect(results).toHaveLength(0);
  });

  it("tay xa (nhỏ) vẫn nhận cú vuốt ngắn", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, {
      startX: 100,
      dxPerStep: 14,
      steps: 12,
      handSize: 30,
    });
    expect(results).toHaveLength(1);
    expect(results[0].direction).toBe("right");
  });

  it("tay gần (to) cần quãng đường dài hơn — 168px chưa đủ", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, {
      startX: 100,
      dxPerStep: 14,
      steps: 12,
      handSize: 600,
    });
    expect(results).toHaveLength(0);
  });

  it("tay gần (to) nhận cú vuốt đủ dài", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, {
      startX: 60,
      dxPerStep: 20,
      steps: 30,
      handSize: 150,
    });
    expect(results).toHaveLength(1);
    expect(results[0].direction).toBe("right");
  });

  it("bỏ qua khi tay không mở (không phải cử chỉ vuốt)", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, {
      startX: 120,
      dxPerStep: 18,
      steps: 30,
      isOpen: false,
    });
    expect(results).toHaveLength(0);
  });

  it("cooldown: một chuyển động dài chỉ tạo đúng một sự kiện", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    const results = feed(detector, { startX: 40, dxPerStep: 18, steps: 50 });
    expect(results).toHaveLength(1);
  });

  it("reset xoá trạng thái để cú vuốt kế tiếp được nhận", () => {
    const detector = new SwipeDetector(FRAME_WIDTH);
    expect(feed(detector, { startX: 120, dxPerStep: 14, steps: 24 })).toHaveLength(1);
    detector.reset();
    expect(feed(detector, { startX: 120, dxPerStep: 14, steps: 24 })).toHaveLength(1);
  });

  it("frame width nhỏ làm ngưỡng 10% khung hình nhỏ hơn", () => {
    const detector = new SwipeDetector(320);
    const results = feed(detector, {
      startX: 60,
      dxPerStep: 10,
      steps: 16,
      handSize: 30,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].direction).toBe("right");
  });
});
