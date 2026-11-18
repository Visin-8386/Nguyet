/**
 * Hiệu ứng hình ảnh: confetti tự vẽ bằng canvas, lò xo (spring) tự viết,
 * và các animation CSS 3D/Web Animations API.
 * Tôn trọng prefers-reduced-motion: giảm/tắt confetti, lật thẻ, rung.
 */

import { PERF } from "../config";

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Lò xo đơn giản (semi-implicit Euler): dùng cho hiệu ứng trượt ảnh intro. */
export class Spring {
  value: number;
  velocity = 0;

  constructor(
    private readonly stiffness = 160,
    private readonly damping = 22,
    value = 0,
  ) {
    this.value = value;
  }

  step(target: number, dtSeconds: number): number {
    const force = (target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dtSeconds;
    this.value += this.velocity * dtSeconds;
    return this.value;
  }
}

/** Rung hộp "?" khi chốt con vật (CAUGHT). */
export function playMysteryShake(box: HTMLElement): void {
  if (prefersReducedMotion()) return;
  box.animate(
    [
      { transform: "translateX(0) rotate(0)" },
      { transform: "translateX(-5px) rotate(-2deg)" },
      { transform: "translateX(5px) rotate(2deg)" },
      { transform: "translateX(-4px) rotate(-1deg)" },
      { transform: "translateX(3px) rotate(1deg)" },
      { transform: "translateX(0) rotate(0)" },
    ],
    { duration: 520, easing: "ease-in-out" },
  );
}

/** Lật thẻ CAUGHT → REVEAL với độ nảy nhẹ. */
export function playRevealFlip(card: HTMLElement): void {
  card.classList.remove("is-mystery");
  if (prefersReducedMotion()) return;
  card.animate(
    [
      { transform: "rotateY(180deg) scale(0.9)" },
      { transform: "rotateY(0deg) scale(1.07)", offset: 0.72 },
      { transform: "rotateY(0deg) scale(1)" },
    ],
    { duration: 620, easing: "cubic-bezier(.2,.9,.25,1.15)" },
  );
}

/** Nhấp nháy nhẹ khi ảnh con vật đổi trong lúc quay số (slot). */
export function playSlotBlip(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  el.animate(
    [
      { transform: "translateY(-10px) scale(.97)", opacity: 0.35, filter: "blur(5px)" },
      { transform: "translateY(0) scale(1)", opacity: 1, filter: "blur(0)" },
    ],
    { duration: 110, easing: "ease-out" },
  );
}

/**
 * Đưa ảnh intro trượt vào từ mép trái bằng spring physics + motion blur nhẹ.
 * Trả về Animation để caller có thể huỷ khi đổi trạng thái đột ngột.
 */
export function slideIntroIn(
  el: HTMLElement,
  distancePx: number,
  fromRight = false,
): Animation | null {
  el.hidden = false;
  if (prefersReducedMotion()) {
    el.style.transform = "translate3d(0,0,0)";
    el.style.opacity = "1";
    return null;
  }
  const frames: Keyframe[] = [];
  const spring = new Spring(150, 21, fromRight ? distancePx : -distancePx);
  const steps = 48;
  const dt = 1 / 60;
  for (let i = 0; i <= steps; i += 1) {
    const x = i === steps ? 0 : spring.step(0, dt);
    const progress = i / steps;
    const rot = (1 - progress) * (fromRight ? 8 : -8);
    const scale = 0.85 + progress * 0.15;
    frames.push({
      offset: progress,
      transform: `translate3d(${x}px, 0, 0) rotate(${rot}deg) scale(${scale})`,
      filter: `blur(${Math.min(9, Math.abs(spring.velocity) * 0.012).toFixed(2)}px)`,
      opacity: Math.min(1, 0.15 + progress * 3),
    });
  }
  el.style.transform = "translate3d(0,0,0)";
  el.style.opacity = "1";
  return el.animate(frames, { duration: 820, easing: "linear", fill: "both" });
}

/** Ảnh intro trượt ra ngoài về phía trái. */
export function slideIntroOut(el: HTMLElement, distancePx: number): Animation | null {
  if (prefersReducedMotion()) {
    el.hidden = true;
    return null;
  }
  const animation = el.animate(
    [
      { transform: "translate3d(0,0,0)", opacity: 1, filter: "blur(0)" },
      { transform: `translate3d(${-distancePx}px,0,0)`, opacity: 0.1, filter: "blur(6px)" },
    ],
    { duration: 320, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
  );
  animation.onfinish = () => {
    el.hidden = true;
    el.style.transform = "";
    el.style.opacity = "";
  };
  return animation;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  width: number;
  height: number;
  color: string;
  life: number;
  maxLife: number;
}

const CONFETTI_COLORS = [
  "#fbbf24",
  "#f472b6",
  "#34d399",
  "#60a5fa",
  "#f87171",
  "#a78bfa",
  "#fb923c",
];

/** Confetti vẽ bằng canvas 2D, tự dừng khi hết hạt. */
export class ConfettiSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private raf = 0;
  private lastTs = 0;
  private enabled = true;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, PERF.maxDpr);
    this.cssWidth = window.innerWidth;
    this.cssHeight = window.innerHeight;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Bắn confetti từ một điểm (mặc định giữa màn hình). */
  burst(origin?: { x: number; y: number }, count = 140): void {
    if (!this.enabled || !this.ctx || prefersReducedMotion()) return;
    const ox = origin?.x ?? this.cssWidth / 2;
    const oy = origin?.y ?? this.cssHeight * 0.42;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 220 + Math.random() * 460;
      this.particles.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 140,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 14,
        width: 6 + Math.random() * 7,
        height: 4 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 0,
        maxLife: 1.6 + Math.random() * 1.2,
      });
    }
    this.start();
  }

  private start(): void {
    if (this.raf) return;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number): void => {
    const ctx = this.ctx;
    this.raf = 0;
    if (!ctx) return;
    const dt = Math.min((now - this.lastTs) / 1000, 0.05);
    this.lastTs = now;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy += 1400 * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const alpha = 1 - Math.max(0, (p.life - p.maxLife * 0.6) / (p.maxLife * 0.4));
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
      alive.push(p);
    }
    this.particles = alive;
    if (alive.length > 0) {
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private clear(): void {
    this.particles = [];
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.ctx?.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  dispose(): void {
    this.clear();
  }
}
