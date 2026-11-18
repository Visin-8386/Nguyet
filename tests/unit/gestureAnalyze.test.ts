import { describe, expect, it } from "vitest";
import { analyzeHand } from "../../src/gestureEngine";

/** Tạo 21 landmark tổng hợp: 4 ngón duỗi/co theo tỉ lệ khoảng cách từ cổ tay. */
function makeHand(options: { fingerTipRadius: number; thumbTipRadius: number }): Array<{
  x: number;
  y: number;
}> {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0, y: 0 }; // cổ tay
  points[2] = { x: 10, y: 0 }; // gốc ngón cái
  points[4] = { x: options.thumbTipRadius, y: 0 }; // đầu ngón cái

  const fingers: Array<[number, number]> = [
    [6, 8],
    [10, 12],
    [14, 16],
    [18, 20],
  ];
  for (const [pip, tip] of fingers) {
    points[pip] = { x: 10, y: 0 };
    points[tip] = { x: options.fingerTipRadius, y: 0 };
  }
  return points;
}

describe("analyzeHand — kiểm tra landmark", () => {
  it("nhận diện bàn tay xòe 5 ngón", () => {
    const result = analyzeHand(makeHand({ fingerTipRadius: 15, thumbTipRadius: 20 }));
    expect(result.isOpen).toBe(true);
    expect(result.isFist).toBe(false);
  });

  it("nhận diện bàn tay nắm", () => {
    const result = analyzeHand(makeHand({ fingerTipRadius: 5, thumbTipRadius: 3 }));
    expect(result.isOpen).toBe(false);
    expect(result.isFist).toBe(true);
  });

  it("không xác nhận khi chỉ có 3 ngón duỗi", () => {
    const points = makeHand({ fingerTipRadius: 5, thumbTipRadius: 3 });
    // Ngón trỏ duỗi ra
    points[8] = { x: 15, y: 0 };
    const result = analyzeHand(points);
    expect(result.isOpen).toBe(false);
    expect(result.isFist).toBe(false);
  });

  it("trả về false khi thiếu landmark", () => {
    expect(analyzeHand([])).toEqual({ isOpen: false, isFist: false });
    expect(analyzeHand([{ x: 0, y: 0 }])).toEqual({ isOpen: false, isFist: false });
  });
});
