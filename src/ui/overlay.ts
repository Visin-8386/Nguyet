/**
 * Canvas overlay vẽ skeleton bàn tay. Video dùng object-fit: cover nên phải
 * tính đúng tỉ lệ cover để xương khớp khớp với tay thật trên màn hình.
 * Canvas được giới hạn devicePixelRatio tối đa 2 để không tốn GPU vô ích.
 */

import { GestureRecognizer } from "@mediapipe/tasks-vision";
import { computeCover } from "../camera";
import { PERF } from "../config";
import type { HandFrame } from "../gestureEngine";

export class HandOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private cssWidth = 0;
  private cssHeight = 0;
  private enabled = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, PERF.maxDpr);
    this.cssWidth = window.innerWidth;
    this.cssHeight = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * dpr));
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    this.ctx?.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  render(frame: HandFrame | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (!this.enabled || !frame) return;

    const cover = computeCover(frame.frameWidth, frame.frameHeight, this.cssWidth, this.cssHeight);
    const points = frame.landmarks.map((p) => ({
      x: cover.offsetX + p.x * frame.frameWidth * cover.scale,
      y: cover.offsetY + p.y * frame.frameHeight * cover.scale,
    }));

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const draw = (lineWidth: number, alpha: number): void => {
      ctx.strokeStyle = `rgba(52, 211, 153, ${alpha})`;
      ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (const connection of GestureRecognizer.HAND_CONNECTIONS) {
        const a = points[connection.start];
        const b = points[connection.end];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(1.5, lineWidth * 0.85), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Hai lớp: quầng mờ + nét đậm (rẻ hơn shadowBlur trên điện thoại).
    draw(9, 0.18);
    draw(2.6, 0.92);

    // Tâm lòng bàn tay
    const palmX = cover.offsetX + frame.palm.x * frame.frameWidth * cover.scale;
    const palmY = cover.offsetY + frame.palm.y * frame.frameHeight * cover.scale;
    ctx.beginPath();
    ctx.fillStyle = frame.isOpen ? "rgba(74, 222, 128, 0.95)" : "rgba(251, 191, 36, 0.95)";
    ctx.arc(palmX, palmY, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
