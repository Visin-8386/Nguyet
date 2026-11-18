import { describe, expect, it } from "vitest";
import { OneEuroFilter, OneEuroFilter2D } from "../../src/oneEuroFilter";

describe("OneEuroFilter", () => {
  it("giá trị đầu tiên giữ nguyên (không trễ khởi động)", () => {
    const filter = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 0.007 });
    expect(filter.filter(10, 0)).toBe(10);
  });

  it("làm mượt bước nhảy: đầu ra nằm giữa giá trị cũ và mới", () => {
    const filter = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 0.007 });
    filter.filter(0, 0);
    const out = filter.filter(100, 33);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(100);
  });

  it("hội tụ dần về giá trị mới khi giữ nguyên", () => {
    const filter = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 0.007 });
    filter.filter(0, 0);
    let out = 0;
    for (let t = 33; t <= 1200; t += 33) out = filter.filter(100, t);
    expect(out).toBeGreaterThan(99);
    expect(out).toBeLessThanOrEqual(100);
  });

  it("beta lớn bám theo chuyển động nhanh hơn beta nhỏ", () => {
    const slow = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 0.001 });
    const fast = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 1 });
    slow.filter(0, 0);
    fast.filter(0, 0);
    slow.filter(50, 33);
    fast.filter(50, 33);
    const slowOut = slow.filter(100, 66);
    const fastOut = fast.filter(100, 66);
    expect(fastOut).toBeGreaterThan(slowOut);
  });

  it("reset đưa bộ lọc về trạng thái ban đầu", () => {
    const filter = new OneEuroFilter({ freq: 30, minCutoff: 1, beta: 0.007 });
    filter.filter(10, 0);
    filter.filter(90, 33);
    filter.reset();
    expect(filter.filter(42, 250)).toBe(42);
  });

  it("OneEuroFilter2D lọc độc lập cả x và y", () => {
    const filter = new OneEuroFilter2D({ freq: 30, minCutoff: 1, beta: 0.007 });
    const first = filter.filter(3, 7, 0);
    expect(first).toEqual({ x: 3, y: 7 });
    const second = filter.filter(30, 70, 33);
    expect(second.x).toBeGreaterThan(3);
    expect(second.x).toBeLessThan(30);
    expect(second.y).toBeGreaterThan(7);
    expect(second.y).toBeLessThan(70);
  });
});
