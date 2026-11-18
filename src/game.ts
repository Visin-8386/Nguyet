/**
 * Game — điều phối toàn bộ trò chơi:
 *   camera → GestureEngine (luồng sự kiện) → state machine → GameView/âm thanh/confetti
 * Kèm vòng lặp rVFC (fallback rAF), tự thích ứng hiệu năng, wake lock, fullscreen.
 */

import { fetchAnimals, preloadAnimals, type AnimalAsset } from "./assets";
import { Camera, computeCover } from "./camera";
import { GAME, MEDIAPIPE, PERF } from "./config";
import { GestureEngine, type GestureEvent } from "./gestureEngine";
import { attachKeyboard, type GestureInputHandlers } from "./input/keyboard";
import { attachTouchControls } from "./input/touch";
import { transition, type GameEvent, type GameState } from "./stateMachine";
import { OneEuroFilter2D } from "./oneEuroFilter";
import { AudioEngine } from "./ui/audio";
import { HandOverlay } from "./ui/overlay";
import type { GameView } from "./ui/render";

/** Lỗi khởi tạo mô hình nhận diện (WASM/WebGL) — main.ts phân biệt để báo đúng. */
export class EngineStartError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("Không khởi động được bộ nhận diện cử chỉ");
    this.name = "EngineStartError";
    this.cause = cause;
  }
}

/** Lỗi mở webcam (quyền, thiết bị bận, HTTPS…) — main.ts phân biệt để báo đúng. */
export class CameraStartError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("Không mở được camera");
    this.name = "CameraStartError";
    this.cause = cause;
  }
}

const now = (): number => performance.now();

/** Fullscreen phần tử chỉ hiện nút khi trình duyệt hỗ trợ (iPhone Safari không hỗ trợ). */
export function fullscreenSupported(): boolean {
  const ua = navigator.userAgent;
  const isIPhone = /iPhone/i.test(ua);
  if (isIPhone) return false;
  const el = document.documentElement;
  return typeof el.requestFullscreen === "function" && document.fullscreenEnabled;
}

export class Game {
  private readonly view: GameView;
  private readonly audio: AudioEngine;
  private readonly overlay: HandOverlay;
  private readonly palmFilter = new OneEuroFilter2D({ freq: 30, minCutoff: 1.0, beta: 0.01 });
  private readonly animals: AnimalAsset[];

  private camera: Camera | null = null;
  private engine: GestureEngine | null = null;
  private mode: "camera" | "keyboard" = "keyboard";

  private state: GameState = "WAITING";
  private alive = false;
  private paused = false;
  private started = false;
  private readonly disposers: Array<() => void> = [];

  private currentAnimal: AnimalAsset | null = null;
  private caughtAnimal: AnimalAsset | null = null;
  private lastSlotAt = 0;

  private rvfcHandle = 0;
  private rafHandle = 0;
  private lastInferAt = 0;
  private lastIndicatorAt = 0;
  private lastDebugAt = 0;

  private fpsFrames = 0;
  private fpsSince = now();
  private fps = 0;

  private lastHandSeenAt = now();
  private introLastActivityAt = now();
  private lastSwipeAt = 0;
  private lastSwipeDir = "—";

  private skeletonEnabled = false;
  private perfLevel = 1;
  private inferSkip = 1;
  private lastPerfAt = 0;
  private slowStreak = 0;
  private fastStreak = 0;
  private lowResTried = false;

  private wakeLock: WakeLockSentinel | null = null;

  private constructor(
    view: GameView,
    audio: AudioEngine,
    overlay: HandOverlay,
    animals: AnimalAsset[],
  ) {
    this.view = view;
    this.audio = audio;
    this.overlay = overlay;
    this.animals = animals;
  }

  static async create(
    view: GameView,
    audio: AudioEngine,
    overlay: HandOverlay,
    onProgress?: (progress: number) => void,
  ): Promise<Game> {
    const animals = await fetchAnimals();
    await preloadAnimals(animals, onProgress);
    return new Game(view, audio, overlay, animals);
  }

  get animalCount(): number {
    return this.animals.length;
  }

  /** Khởi động game (có hoặc không có camera). Có thể gọi lại sau lỗi camera. */
  async start(withCamera: boolean, onStage?: (text: string) => void): Promise<void> {
    if (this.started) return;
    // Mặc định ở trạng thái chờ; chế độ camera sẽ tự chuyển sang quay số bên dưới.
    this.state = "WAITING";
    this.view.setState("WAITING");
    this.view.resetCardToFront();
    this.view.showIdle();
    this.view.setHandDetected(false);
    this.lastHandSeenAt = now();

    try {
      if (withCamera) {
        onStage?.("Đang bật camera và tải bộ nhận diện…");
        this.camera = new Camera(this.view.video);
        // Model không phụ thuộc camera → bắt đầu tải model ngay, song song với camera.
        const enginePromise = GestureEngine.create(this.view.video);
        try {
          await this.camera.start({ facing: "user" });
        } catch (error) {
          throw new CameraStartError(error);
        }
        this.view.setCameraMirror(this.camera.mirrored);

        const cameraCount = await Camera.countCameras();
        this.view.setCameraSwitchVisible(cameraCount > 1);

        try {
          this.engine = await enginePromise;
        } catch (error) {
          throw new EngineStartError(error);
        }
        this.engine.setMirror(this.camera.mirrored);
        this.engine.on((event) => this.onGestureEvent(event));
        this.mode = "camera";
        // Giữ trạng thái chờ: chỉ quay số khi nhận diện đủ 5 ngón.
        this.state = "WAITING";
        this.view.setState("WAITING");
        this.view.showIdle();
        await this.requestWakeLock();
      } else {
        this.mode = "keyboard";
        document.body.classList.add("no-camera");
        this.view.setCameraSwitchVisible(false);
        document.getElementById("dim")?.classList.add("hidden");
      }
    } catch (error) {
      this.camera?.stop();
      this.camera = null;
      this.engine?.dispose();
      this.engine = null;
      document.body.classList.remove("no-camera");
      throw error;
    }

    this.bindInput();
    this.bindUi();
    this.attachGlobalListeners();
    this.startLoop();
    this.started = true;
    this.alive = true;
    this.audio.play("start");
  }

  private onGestureEvent(event: GestureEvent): void {
    switch (event.type) {
      case "open":
        this.dispatch("OPEN");
        break;
      case "fist":
        this.dispatch("FIST");
        break;
      case "swipe":
        this.lastSwipeAt = now();
        this.lastSwipeDir = event.direction === "right" ? "trái→phải" : "phải→trái";
        console.log("[Game] SWIPE", event.direction, "state=", this.state);
        this.view.game.classList.add("swipe-toast");
        window.setTimeout(() => this.view.game.classList.remove("swipe-toast"), 800);
        // Nếu đang ở CAUGHT (chưa mở hộp), tự mở hộp rồi kéo poster luôn.
        if (this.state === "CAUGHT") {
          this.dispatch("OPEN");
          window.setTimeout(() => {
            if (this.state === "REVEAL") {
              this.dispatch(event.direction === "right" ? "SWIPE_LR" : "SWIPE_RL");
            }
          }, 500);
        } else {
          this.dispatch(event.direction === "right" ? "SWIPE_LR" : "SWIPE_RL");
        }
        break;
      case "hand-found":
        this.lastHandSeenAt = now();
        this.view.setHandDetected(true);
        break;
      case "hand-lost":
        this.view.setHandDetected(false);
        this.dispatch("HAND_LOST");
        break;
    }
  }

  /** Cửa ngõ duy nhất cho mọi sự kiện cử chỉ/bàn phím/cảm ứng. */
  private dispatch(event: GameEvent): void {
    const t = now();
    if (this.state === "INTRO") this.introLastActivityAt = t;
    if (event === "OPEN" || event === "FIST" || event === "SWIPE_LR" || event === "SWIPE_RL") {
      this.lastHandSeenAt = t;
    }
    const next = transition(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.enterState(next);
  }

  private enterState(next: GameState): void {
    this.view.setState(next);
    switch (next) {
      case "WAITING":
        this.currentAnimal = null;
        this.caughtAnimal = null;
        this.view.resetCardToFront();
        this.view.showIdle();
        this.lastHandSeenAt = now();
        break;
      case "SPINNING":
        this.caughtAnimal = null;
        this.view.resetCardToFront();
        this.lastSlotAt = now() - GAME.slotMs; // quay ngay khung hình kế tiếp
        break;
      case "CAUGHT":
        this.caughtAnimal = this.currentAnimal ?? this.animals[0] ?? null;
        this.view.showMystery();
        this.audio.play("catch");
        break;
      case "REVEAL":
        this.view.hideIntro();
        if (this.caughtAnimal) this.view.revealAnimal(this.caughtAnimal);
        this.audio.play("reveal");
        this.lastHandSeenAt = now();
        break;
      case "INTRO":
        if (this.caughtAnimal) this.view.showIntro(this.caughtAnimal);
        this.audio.play("swipe");
        this.introLastActivityAt = now();
        break;
    }
  }

  private bindInput(): void {
    const handlers: GestureInputHandlers = {
      onOpen: () => this.dispatch("OPEN"),
      onFist: () => this.dispatch("FIST"),
      onSwipe: (direction) => this.dispatch(direction === "right" ? "SWIPE_LR" : "SWIPE_RL"),
    };
    this.disposers.push(attachKeyboard(handlers));

    const openButton = document.getElementById("btn-open") as HTMLButtonElement | null;
    const fistButton = document.getElementById("btn-fist") as HTMLButtonElement | null;
    const swipeButton = document.getElementById("btn-swipe") as HTMLButtonElement | null;
    if (openButton && fistButton && swipeButton) {
      this.disposers.push(
        attachTouchControls(
          {
            openButton,
            fistButton,
            swipeButton,
            swipeSurface: document.getElementById("game") ?? document.body,
            defaultSwipeDirection: () => (this.state === "INTRO" ? "left" : "right"),
          },
          handlers,
        ),
      );
    }
  }

  private bindUi(): void {
    const replay = document.getElementById("btn-replay");
    const cameraButton = document.getElementById("btn-camera");
    const soundButton = document.getElementById("btn-sound");
    const skeletonButton = document.getElementById("btn-skeleton");
    const debugButton = document.getElementById("btn-debug");
    const fullscreenButton = document.getElementById("btn-fullscreen");

    const add = (el: Element | null, type: string, listener: EventListener): void => {
      if (!el) return;
      el.addEventListener(type, listener);
      this.disposers.push(() => el.removeEventListener(type, listener));
    };

    add(replay, "click", () => this.dispatch("RESTART"));
    add(cameraButton, "click", () => void this.switchCamera());
    add(soundButton, "click", () => {
      const muted = this.audio.toggleMuted();
      this.view.setSoundMuted(muted);
    });
    add(skeletonButton, "click", () => {
      this.skeletonEnabled = !this.skeletonEnabled;
      this.view.setSkeletonEnabled(this.skeletonEnabled);
      this.applyOverlayEnabled();
    });
    add(debugButton, "click", () => {
      const panel = document.getElementById("debug-panel");
      this.view.setDebugVisible(!!panel?.hidden);
    });
    add(fullscreenButton, "click", () => void this.toggleFullscreen());

    this.view.setFullscreenVisible(fullscreenSupported());
    this.view.setSkeletonEnabled(this.skeletonEnabled);
    this.view.setSoundMuted(this.audio.muted);
    this.view.setDebugVisible(false);
  }

  private attachGlobalListeners(): void {
    const onVisibility = (): void => {
      const visible = document.visibilityState === "visible";
      this.paused = !visible;
      if (visible) {
        this.lastInferAt = now();
        this.lastHandSeenAt = now();
        this.introLastActivityAt = now();
        this.fpsSince = now();
        this.fpsFrames = 0;
        void this.audio.unlock();
        void this.requestWakeLock();
      } else {
        void this.releaseWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.disposers.push(() => document.removeEventListener("visibilitychange", onVisibility));

    const onFullscreenChange = (): void => {
      this.view.updateFullscreenIcon(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    this.disposers.push(() => document.removeEventListener("fullscreenchange", onFullscreenChange));
  }

  private startLoop(): void {
    const video = this.view.video;
    // Chế độ bàn phím không có khung hình video → phải dùng requestAnimationFrame,
    // nếu dùng requestVideoFrameCallback thì vòng lặp sẽ không bao giờ chạy.
    if (this.mode === "camera" && typeof video.requestVideoFrameCallback === "function") {
      this.rvfcHandle = video.requestVideoFrameCallback(this.onVideoFrame);
    } else {
      this.rafHandle = requestAnimationFrame(this.onAnimationFrame);
    }
  }

  private readonly onVideoFrame: VideoFrameRequestCallback = (timestamp) => {
    this.rvfcHandle = 0;
    if (!this.alive) return;
    this.renderFrame(timestamp);
    if (this.alive) {
      this.rvfcHandle = this.view.video.requestVideoFrameCallback(this.onVideoFrame);
    }
  };

  private readonly onAnimationFrame = (timestamp: number): void => {
    this.rafHandle = 0;
    if (!this.alive) return;
    this.renderFrame(timestamp);
    if (this.alive) this.rafHandle = requestAnimationFrame(this.onAnimationFrame);
  };

  private renderFrame(timestamp: number): void {
    if (this.paused) return;

    // FPS
    this.fpsFrames += 1;
    const fpsElapsed = timestamp - this.fpsSince;
    if (fpsElapsed >= 500) {
      this.fps = (this.fpsFrames * 1000) / fpsElapsed;
      this.fpsFrames = 0;
      this.fpsSince = timestamp;
    }

    // Suy luận có giới hạn tần suất + tự giảm khi máy yếu
    if (this.mode === "camera" && this.engine) {
      const interval = 1000 / (MEDIAPIPE.maxInferPerSecond / this.inferSkip);
      if (timestamp - this.lastInferAt >= interval) {
        this.lastInferAt = timestamp;
        this.engine.process(timestamp);
        if (this.engine.handDetected) this.lastHandSeenAt = timestamp;

        if (timestamp - this.lastIndicatorAt >= 200) {
          this.lastIndicatorAt = timestamp;
          this.view.setHandDetected(this.engine.handDetected);
        }
      }
    }

    // Slot machine: chỉ quay khi có tay (chế độ camera) hoặc chế độ bàn phím.
    const hasHand = this.mode === "keyboard" || !!this.engine?.handDetected;
    if (this.state === "SPINNING" && hasHand && timestamp - this.lastSlotAt >= GAME.slotMs) {
      this.lastSlotAt = timestamp;
      this.spinOnce();
    }

    // Timeout mất tay 8s (mọi trạng thái trừ INTRO)
    if (
      this.mode === "camera" &&
      this.state !== "INTRO" &&
      !this.engine?.handDetected &&
      timestamp - this.lastHandSeenAt >= GAME.noHandTimeoutMs
    ) {
      this.lastHandSeenAt = timestamp;
      this.dispatch("TIMEOUT");
    }

    // INTRO giữ nguyên cho tới khi người xem đọc xong (60s không tương tác)
    if (this.state === "INTRO" && timestamp - this.introLastActivityAt >= GAME.introIdleTimeoutMs) {
      this.introLastActivityAt = timestamp;
      this.dispatch("LONG_IDLE");
    }

    // Tự thích ứng hiệu năng (mỗi 2 giây)
    if (timestamp - this.lastPerfAt >= 2000) {
      this.lastPerfAt = timestamp;
      this.evaluatePerformance();
    }

    // Debug panel (chỉ cập nhật DOM khi mở)
    if (timestamp - this.lastDebugAt >= 300) {
      this.lastDebugAt = timestamp;
      this.view.updateDebug({
        fps: this.fps,
        inferenceMs: this.engine?.avgInferenceMs ?? 0,
        state: this.state,
        gesture: this.engine ? `${this.engine.category} → ${this.engine.currentGesture}` : "—",
        score: this.engine?.score ?? 0,
        hand: this.engine?.handDetected ?? false,
        mode: this.mode === "camera" ? "camera" : "bàn phím / cảm ứng",
        perfLevel: this.perfLevel,
        delegate: this.engine?.delegate ?? "—",
        swipe: this.lastSwipeAt ? `${this.lastSwipeDir} @${Math.round(this.lastSwipeAt)}` : "—",
      });
    }

    // Thẻ con vật bám theo lòng bàn tay (trừ màn hình giới thiệu).
    this.updateCardFollowPalm(timestamp);
  }

  /** Đưa thẻ con vật tới vị trí lòng bàn tay trên màn hình. */
  private updateCardFollowPalm(timestamp: number): void {
    const scene = this.view.card.parentElement as HTMLElement | null;
    if (!scene) return;

    if (this.mode !== "camera" || !this.engine || this.state === "INTRO") {
      this.palmFilter.reset();
      scene.style.transition = "";
      scene.style.transform = "";
      return;
    }

    const frame = this.engine.frame;
    if (!frame) {
      this.palmFilter.reset();
      scene.style.transition = "";
      scene.style.transform = "";
      return;
    }

    const cover = computeCover(
      frame.frameWidth,
      frame.frameHeight,
      window.innerWidth,
      window.innerHeight,
    );
    const px = cover.offsetX + frame.palm.x * frame.frameWidth * cover.scale;
    const py = cover.offsetY + frame.palm.y * frame.frameHeight * cover.scale;
    const filtered = this.palmFilter.filter(px, py, timestamp);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const scale = Math.max(0.4, Math.min(0.8, frame.handSize / 200));
    scene.style.transition = "transform 0.12s linear";
    scene.style.transform = `translate3d(${filtered.x - centerX}px, ${filtered.y - centerY}px, 0) scale(${scale})`;
  }

  /** Đổi ảnh slot bằng crypto.getRandomValues, không lặp cùng con hai lần liền. */
  private spinOnce(): void {
    if (this.animals.length === 0) return;
    let next: AnimalAsset;
    if (this.animals.length === 1) {
      next = this.animals[0];
    } else {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      let index = buffer[0] % this.animals.length;
      let guard = 0;
      while (this.currentAnimal && this.animals[index].id === this.currentAnimal.id && guard < 8) {
        index = (index + 1) % this.animals.length;
        guard += 1;
      }
      next = this.animals[index];
    }
    this.currentAnimal = next;
    this.view.showSlot(next);
    this.audio.play("tick");
  }

  private evaluatePerformance(): void {
    if (!this.engine) return;
    const avg = this.engine.avgInferenceMs;
    let pressure = 1;
    if (avg > PERF.verySlowInferMs) pressure = 3;
    else if (avg > PERF.slowInferMs) pressure = 2;
    else if (avg < PERF.fastInferMs) pressure = 0;

    if (pressure > this.perfLevel) {
      this.slowStreak += 1;
      this.fastStreak = 0;
    } else if (pressure < this.perfLevel) {
      this.fastStreak += 1;
      this.slowStreak = 0;
    } else {
      this.slowStreak = 0;
      this.fastStreak = 0;
    }

    if (this.slowStreak >= 2 && this.perfLevel < 3) {
      this.setPerfLevel(Math.min(3, pressure));
      this.slowStreak = 0;
    } else if (this.fastStreak >= 3 && this.perfLevel > 1) {
      this.setPerfLevel(this.perfLevel - 1);
      this.fastStreak = 0;
    }

    // Máy rất yếu: thử hạ độ phân giải camera một lần.
    if (
      this.perfLevel === 3 &&
      avg > PERF.verySlowInferMs * 1.3 &&
      !this.lowResTried &&
      this.camera?.active
    ) {
      this.lowResTried = true;
      this.camera
        .restartLowRes()
        .then(() => {
          this.setPerfLevel(2);
          // Nguồn video vừa đổi → đảm bảo vòng lặp rVFC vẫn chạy.
          this.restartLoop();
        })
        .catch((error) => console.warn("[game] Không hạ được độ phân giải camera:", error));
    }
  }

  private setPerfLevel(level: number): void {
    this.perfLevel = level;
    this.inferSkip = level >= 3 ? 3 : level === 2 ? 2 : 1;
    this.view.confetti.setEnabled(level < 3);
    this.applyOverlayEnabled();
  }

  private applyOverlayEnabled(): void {
    this.overlay.setEnabled(this.skeletonEnabled && this.perfLevel < 3);
    if (this.perfLevel >= 3) this.overlay.clear();
  }

  private async switchCamera(): Promise<void> {
    if (!this.camera) return;
    try {
      await this.camera.toggleFacing();
      this.engine?.setMirror(this.camera.mirrored);
      this.view.setCameraMirror(this.camera.mirrored);
      this.view.setHandDetected(false);
      this.lastHandSeenAt = now();
      // Đổi nguồn video có thể làm mất callback rVFC đang chờ → khởi động lại vòng lặp.
      this.restartLoop();
    } catch (error) {
      console.warn("[game] Đổi camera thất bại:", error);
    }
  }

  /** Huỷ callback cũ và yêu cầu khung hình kế tiếp (dùng sau khi đổi nguồn video). */
  private restartLoop(): void {
    if (!this.alive) return;
    if (this.rvfcHandle) {
      this.view.video.cancelVideoFrameCallback?.(this.rvfcHandle);
      this.rvfcHandle = 0;
    }
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.lastInferAt = now();
    this.startLoop();
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      this.view.updateFullscreenIcon(!!document.fullscreenElement);
    } catch (error) {
      console.warn("[game] Fullscreen thất bại:", error);
    }
  }

  private async requestWakeLock(): Promise<void> {
    if (!navigator.wakeLock || document.visibilityState !== "visible") return;
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      // Không được cấp wake lock (pin yếu / trình duyệt không hỗ trợ) — bỏ qua.
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // ignore
    }
    this.wakeLock = null;
  }

  /** Dọn dẹp khi thoát: dừng vòng lặp, camera, model, wake lock, listener. */
  dispose(): void {
    // Không return sớm: có thể đang tải dở camera/model khi người dùng rời trang.
    this.alive = false;
    this.paused = true;
    if (this.rvfcHandle) {
      this.view.video.cancelVideoFrameCallback?.(this.rvfcHandle);
      this.rvfcHandle = 0;
    }
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.camera?.stop();
    this.camera = null;
    this.engine?.dispose();
    this.engine = null;
    this.overlay.clear();
    this.view.confetti.dispose();
    this.audio.dispose();
    void this.releaseWakeLock();
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    document.body.classList.remove("no-camera");
    this.started = false;
  }
}
