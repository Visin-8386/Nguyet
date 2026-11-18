import { describe, expect, it } from "vitest";
import { computeCover } from "../../src/camera";

describe("computeCover — khớp skeleton với video object-fit: cover", () => {
  it("khung hình cùng tỉ lệ với hộp → scale đúng, không offset", () => {
    const cover = computeCover(640, 480, 1280, 960);
    expect(cover.scale).toBe(2);
    expect(cover.offsetX).toBe(0);
    expect(cover.offsetY).toBe(0);
    expect(cover.shownWidth).toBe(1280);
    expect(cover.shownHeight).toBe(960);
  });

  it("video 4:3 trong hộp vuông → phóng theo chiều cao, cắt hai bên", () => {
    const cover = computeCover(640, 480, 1000, 1000);
    expect(cover.scale).toBeCloseTo(1000 / 480, 6);
    expect(cover.shownHeight).toBeCloseTo(1000, 6);
    expect(cover.shownWidth).toBeCloseTo((640 / 480) * 1000, 6);
    expect(cover.offsetX).toBeLessThan(0);
    expect(cover.offsetY).toBeCloseTo(0, 6);
  });

  it("video 16:9 trong hộp dọc → phóng theo chiều cao, cắt hai bên", () => {
    const cover = computeCover(1920, 1080, 400, 800);
    expect(cover.scale).toBeCloseTo(800 / 1080, 6);
    expect(cover.shownHeight).toBeCloseTo(800, 6);
    expect(cover.offsetX).toBeLessThan(0);
    expect(cover.offsetY).toBeCloseTo(0, 6);
  });

  it("kích thước không hợp lệ trả về mặc định an toàn", () => {
    const cover = computeCover(0, 0, 500, 400);
    expect(cover).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      shownWidth: 500,
      shownHeight: 400,
    });
  });
});
