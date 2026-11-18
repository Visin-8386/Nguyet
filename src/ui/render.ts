/**
 * Lớp "view": gom toàn bộ thao tác DOM (trạng thái, hướng dẫn, thẻ, debug).
 * Không chứa logic game — game.ts gọi các hàm ở đây.
 */

import type { AnimalAsset } from "../assets";
import { STATE_LABELS } from "../config";
import type { GameState } from "../stateMachine";
import {
  ConfettiSystem,
  playMysteryShake,
  playRevealFlip,
  playSlotBlip,
  slideIntroIn,
  slideIntroOut,
} from "./effects";

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Thiếu phần tử #${id} trong index.html`);
  return el as T;
}

const GUIDES: Record<GameState, { icon: string; text: string }> = {
  WAITING: { icon: "🖐", text: "Giơ 5 ngón tay lên để bắt đầu" },
  SPINNING: { icon: "✊", text: "Nắm tay lại để bắt con vật!" },
  CAUGHT: { icon: "🤫", text: "Xòe tay ra để xem bạn bắt được con gì!" },
  REVEAL: { icon: "👉", text: "Vuốt tay từ trái sang phải để xem thông tin" },
  INTRO: { icon: "👈", text: "Vuốt từ phải sang trái để quay lại" },
};

export const STATE_SHORT: Record<GameState, string> = {
  WAITING: "Đang chờ",
  SPINNING: "Đang quay…",
  CAUGHT: "Đã bắt!",
  REVEAL: "Đã lật thẻ",
  INTRO: "Đang giới thiệu",
};

export interface DebugInfo {
  fps: number;
  inferenceMs: number;
  state: GameState;
  gesture: string;
  score: number;
  hand: boolean;
  mode: string;
  perfLevel: number;
  delegate: string;
  swipe: string;
}

export class GameView {
  readonly video = must<HTMLVideoElement>("camera-video");
  readonly game = must<HTMLElement>("game");
  readonly card = must<HTMLElement>("card");
  readonly cardArea = must<HTMLElement>("card-area");
  readonly animalImage = must<HTMLImageElement>("animal-image");
  readonly animalName = must<HTMLElement>("animal-name");
  readonly mysteryBox = must<HTMLElement>("mystery-box");
  readonly introImage = must<HTMLImageElement>("intro-image");
  readonly guideIcon = must<HTMLElement>("guide-icon");
  readonly guideText = must<HTMLElement>("guide-text");
  readonly stateLabel = must<HTMLElement>("state-label");
  readonly handIndicator = must<HTMLElement>("hand-indicator");
  readonly handIndicatorText = must<HTMLElement>("hand-indicator-text");
  readonly startScreen = must<HTMLElement>("start-screen");
  readonly loadingScreen = must<HTMLElement>("loading-screen");
  readonly loadingText = must<HTMLElement>("loading-text");
  readonly loadingPercent = must<HTMLElement>("loading-percent");
  readonly progressBar = must<HTMLElement>("progress-bar");
  readonly errorScreen = must<HTMLElement>("error-screen");
  readonly debugPanel = must<HTMLElement>("debug-panel");
  readonly soundButton = must<HTMLButtonElement>("btn-sound");
  readonly skeletonButton = must<HTMLButtonElement>("btn-skeleton");
  readonly debugButton = must<HTMLButtonElement>("btn-debug");
  readonly cameraButton = must<HTMLButtonElement>("btn-camera");
  readonly fullscreenButton = must<HTMLButtonElement>("btn-fullscreen");
  readonly replayButton = must<HTMLButtonElement>("btn-replay");
  readonly toolbar = must<HTMLElement>("toolbar");
  readonly touchControls = must<HTMLElement>("touch-controls");

  private readonly dbg = {
    fps: must<HTMLElement>("dbg-fps"),
    infer: must<HTMLElement>("dbg-infer"),
    state: must<HTMLElement>("dbg-state"),
    gesture: must<HTMLElement>("dbg-gesture"),
    swipe: must<HTMLElement>("dbg-swipe"),
    score: must<HTMLElement>("dbg-score"),
    hand: must<HTMLElement>("dbg-hand"),
    mode: must<HTMLElement>("dbg-mode"),
    perf: must<HTMLElement>("dbg-perf"),
    delegate: must<HTMLElement>("dbg-delegate"),
  };

  readonly confetti: ConfettiSystem;
  private introAnimation: Animation | null = null;
  private readonly overlayCanvas = must<HTMLCanvasElement>("overlay-canvas");

  constructor() {
    this.confetti = new ConfettiSystem(must<HTMLCanvasElement>("confetti-canvas"));
    this.setState("WAITING");
    this.setHandDetected(false);
  }

  showStart(): void {
    this.startScreen.hidden = false;
    this.game.hidden = true;
    this.loadingScreen.hidden = true;
  }

  showLoading(text = "Đang tải hình con vật…"): void {
    this.startScreen.hidden = true;
    this.errorScreen.hidden = true;
    this.loadingScreen.hidden = false;
    this.loadingText.textContent = text;
    this.setLoadingProgress(0);
  }

  setLoadingProgress(progress: number): void {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    this.progressBar.style.width = `${percent}%`;
    this.loadingPercent.textContent = `${percent}%`;
  }

  showGame(): void {
    this.startScreen.hidden = true;
    this.loadingScreen.hidden = true;
    this.errorScreen.hidden = true;
    this.game.hidden = false;
  }

  setCameraMirror(mirrored: boolean): void {
    this.video.classList.toggle("mirrored", mirrored);
  }

  setState(state: GameState): void {
    this.game.dataset.state = state;
    this.stateLabel.textContent = STATE_LABELS[state] ?? state;
    const guide = GUIDES[state];
    this.guideIcon.textContent = guide.icon;
    this.guideText.textContent = guide.text;
  }

  setHandDetected(present: boolean): void {
    this.handIndicator.classList.toggle("is-detected", present);
    this.handIndicator.classList.toggle("is-missing", !present);
    this.handIndicatorText.textContent = present ? "Đã thấy tay" : "Chưa thấy tay";
  }

  /** Hiển thị ảnh con vật trong lúc quay số (slot). */
  showSlot(animal: AnimalAsset): void {
    this.animalImage.src = animal.animal;
    this.animalImage.alt = animal.label;
    this.animalName.textContent = animal.label;
    playSlotBlip(this.animalImage);
  }

  /** WAITING: thẻ trống với gợi ý giơ tay. */
  showIdle(): void {
    this.clearAnimalImage();
    this.card.classList.add("is-idle");
    this.card.classList.remove("is-mystery");
    this.cardArea.classList.remove("intro-open");
    this.introImage.hidden = true;
  }

  /** CAUGHT: ẩn hoàn toàn con vật, chỉ hiện hộp "?" (không lộ trước khi xòe tay). */
  showMystery(): void {
    this.clearAnimalImage();
    this.card.classList.add("is-mystery");
    this.cardArea.classList.remove("intro-open");
    this.introImage.hidden = true;
    playMysteryShake(this.mysteryBox);
  }

  /** REVEAL: gắn ảnh con vật + lật thẻ 3D + confetti. */
  revealAnimal(animal: AnimalAsset): void {
    this.animalImage.src = animal.animal;
    this.animalImage.alt = animal.label;
    this.animalName.textContent = animal.label;
    this.animalImage.hidden = false;
    playRevealFlip(this.card);
    const rect = this.card.getBoundingClientRect();
    this.confetti.burst({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  /** INTRO: ảnh poster trượt vào từ mép trái (spring + motion blur). */
  showIntro(animal: AnimalAsset): void {
    this.introAnimation?.cancel();
    this.introImage.src = animal.intro;
    this.introImage.alt = `Giới thiệu: ${animal.label}`;
    this.cardArea.classList.add("intro-open");
    const distance = Math.min(window.innerWidth * 0.9, 900);
    this.introAnimation = slideIntroIn(this.introImage, distance);
  }

  hideIntro(): void {
    if (this.introImage.hidden) return;
    this.cardArea.classList.remove("intro-open");
    this.introAnimation?.cancel();
    this.introAnimation = null;
    const distance = Math.min(window.innerWidth * 0.9, 900);
    this.introAnimation = slideIntroOut(this.introImage, distance);
  }

  hideIntroImmediate(): void {
    this.introAnimation?.cancel();
    this.introAnimation = null;
    this.introImage.hidden = true;
    this.cardArea.classList.remove("intro-open");
  }

  /** Xoá ảnh con vật khỏi DOM để chắc chắn không lộ ở trạng thái CAUGHT. */
  clearAnimalImage(): void {
    this.animalImage.removeAttribute("src");
    this.animalImage.alt = "";
    this.animalName.textContent = "";
  }

  resetCardToFront(): void {
    this.card.classList.remove("is-mystery", "is-idle");
    this.hideIntroImmediate();
  }

  setSoundMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? "🔇" : "🔊";
    this.soundButton.setAttribute("aria-pressed", String(muted));
    this.soundButton.title = muted ? "Bật tiếng" : "Tắt tiếng";
  }

  setSkeletonEnabled(enabled: boolean): void {
    this.skeletonButton.setAttribute("aria-pressed", String(enabled));
    this.skeletonButton.title = enabled ? "Tắt skeleton bàn tay" : "Bật skeleton bàn tay";
    this.skeletonButton.classList.toggle("off", !enabled);
    this.overlayCanvas.classList.toggle("hidden", !enabled);
  }

  setDebugVisible(visible: boolean): void {
    this.debugPanel.hidden = !visible;
    this.debugButton.setAttribute("aria-pressed", String(visible));
    this.debugButton.classList.toggle("active", visible);
  }

  setCameraSwitchVisible(visible: boolean): void {
    this.cameraButton.hidden = !visible;
  }

  setFullscreenVisible(visible: boolean): void {
    this.fullscreenButton.hidden = !visible;
  }

  updateFullscreenIcon(isFullscreen: boolean): void {
    this.fullscreenButton.textContent = isFullscreen ? "⤢" : "⛶";
    this.fullscreenButton.title = isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình";
  }

  /** Chỉ cập nhật DOM khi panel đang mở để tránh layout thrash mỗi khung hình. */
  updateDebug(info: DebugInfo): void {
    if (this.debugPanel.hidden) return;
    this.dbg.fps.textContent = info.fps.toFixed(0);
    this.dbg.infer.textContent = info.inferenceMs.toFixed(1);
    this.dbg.state.textContent = `${info.state} (${STATE_SHORT[info.state]})`;
    this.dbg.gesture.textContent = info.gesture;
    this.dbg.swipe.textContent = info.swipe;
    this.dbg.score.textContent = info.score.toFixed(2);
    this.dbg.hand.textContent = info.hand ? "có" : "không";
    this.dbg.mode.textContent = info.mode;
    this.dbg.perf.textContent = `${info.perfLevel}/3`;
    this.dbg.delegate.textContent = info.delegate;
  }
}
