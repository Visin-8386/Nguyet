/**
 * GestureEngine — bọc @mediapipe/tasks-vision GestureRecognizer và biến kết quả
 * thành một LUỒNG SỰ KIỆN ổn định cho phần game:
 *   open · fist · swipe · hand-found · hand-lost
 *
 * Quy ước quan trọng: MediaPipe trả landmark theo ảnh gốc CHƯA lật. Engine quy đổi
 * sang "toạ độ hiển thị" (displayX = 1 - x nếu đang lật gương) NGAY KHI nhận kết quả.
 * Mọi logic phía sau (vuốt, skeleton, trái/phải) chỉ dùng toạ độ hiển thị.
 */

import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { GESTURE, MEDIAPIPE, MIDDLE_MCP_INDEX, PALM_CENTER_INDICES, WRIST_INDEX } from "./config";
import { SwipeDetector } from "./swipeDetector";

export type GestureName = "open" | "fist" | "none";

export type GestureEvent =
  | { type: "open"; score: number; timestamp: number }
  | { type: "fist"; score: number; timestamp: number }
  | { type: "swipe"; direction: "left" | "right"; timestamp: number }
  | { type: "hand-found"; timestamp: number }
  | { type: "hand-lost"; timestamp: number };

export interface HandFrame {
  /** 21 landmark ở toạ độ hiển thị [0..1]; đã lật gương nếu cần. */
  landmarks: NormalizedLandmark[];
  /** Bàn tay mở (theo landmark). */
  isOpen: boolean;
  /** Bàn tay nắm (theo landmark). */
  isFist: boolean;
  /** Tâm lòng bàn tay ở toạ độ hiển thị [0..1]. */
  palm: { x: number; y: number };
  /** Kích thước bàn tay (px) trong khung hình gốc. */
  handSize: number;
  /** Độ rộng/chiều cao khung hình gốc tại thời điểm nhận. */
  frameWidth: number;
  frameHeight: number;
}

type Point = { x: number; y: number };

/** Giá trị mặc định trước khi biết videoWidth thật (SwipeDetector sẽ được cập nhật sau). */
const CAMERA_WIDTH_FALLBACK = 640;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Kiểm tra landmark để chống nhận nhầm "xòe tay"/"nắm tay" của model.
 * - 4 ngón duỗi: đầu ngón xa cổ tay hơn khớp giữa (pip) theo tỉ lệ.
 * - Ngón cái duỗi: đầu ngón cái xa cổ tay hơn khớp gốc ngón cái.
 */
export function analyzeHand(landmarks: readonly Point[]): { isOpen: boolean; isFist: boolean } {
  if (landmarks.length < 21) return { isOpen: false, isFist: false };
  const wrist = landmarks[WRIST_INDEX];
  // [pip, tip] của 4 ngón: trỏ, giữa, áp út, út
  const fingers: Array<[number, number]> = [
    [6, 8],
    [10, 12],
    [14, 16],
    [18, 20],
  ];
  let extended = 0;
  let curled = 0;
  for (const [pip, tip] of fingers) {
    const ratio = distance(landmarks[tip], wrist) / Math.max(distance(landmarks[pip], wrist), 1e-6);
    if (ratio > 1.05) extended += 1;
    if (ratio < 0.95) curled += 1;
  }
  const thumbRatio = distance(landmarks[4], wrist) / Math.max(distance(landmarks[2], wrist), 1e-6);
  const thumbExtended = thumbRatio > 1.05;
  const thumbCurled = thumbRatio < 1.0;

  return {
    // Xòe: ít nhất 3 ngón duỗi, ngón cái duỗi, không quá 1 ngón co.
    isOpen: extended >= 3 && thumbExtended && curled <= 1,
    // Nắm: ít nhất 3 ngón co, ngón cái co, không có ngón nào duỗi rõ rệt.
    isFist: curled >= 3 && thumbCurled && extended === 0,
  };
}

export class GestureEngine {
  private readonly recognizer: GestureRecognizer;
  private readonly delegateUsed: "GPU" | "CPU";
  private readonly swipeDetector = new SwipeDetector(CAMERA_WIDTH_FALLBACK);
  private readonly listeners = new Set<(event: GestureEvent) => void>();

  private mirror = true;
  private closed = false;
  private readonly video: HTMLVideoElement;

  private lastTs = 0;
  private handPresent = false;
  private lastHandTs = 0;

  private current: GestureName = "none";
  private candidate: GestureName = "none";
  private candidateSince = 0;

  private lastFrame: HandFrame | null = null;
  private lastCategory = "None";
  private lastScore = 0;
  private lastInferenceMs = 0;
  private inferSamples: number[] = [];

  private constructor(
    video: HTMLVideoElement,
    recognizer: GestureRecognizer,
    delegate: "GPU" | "CPU",
  ) {
    this.video = video;
    this.recognizer = recognizer;
    this.delegateUsed = delegate;
  }

  /** Khởi tạo model: thử GPU trước, lỗi thì tự fallback CPU. */
  static async create(video: HTMLVideoElement): Promise<GestureEngine> {
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasmPath);
    const delegates: Array<"GPU" | "CPU"> = [MEDIAPIPE.delegate, MEDIAPIPE.fallbackDelegate];
    let lastError: unknown = null;
    for (const delegate of delegates) {
      try {
        const recognizer = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE.modelPath,
            delegate,
          },
          runningMode: "VIDEO",
          numHands: MEDIAPIPE.numHands,
        });
        return new GestureEngine(video, recognizer, delegate);
      } catch (error) {
        lastError = error;
        console.warn(`[GestureEngine] Không khởi tạo được delegate ${delegate}:`, error);
      }
    }
    throw new Error(
      `Không khởi tạo được MediaPipe GestureRecognizer (WebGL/WASM). ${
        lastError instanceof Error ? lastError.message : ""
      }`,
    );
  }

  get delegate(): "GPU" | "CPU" {
    return this.delegateUsed;
  }

  get frame(): HandFrame | null {
    return this.lastFrame;
  }

  get handDetected(): boolean {
    return this.handPresent;
  }

  get category(): string {
    return this.lastCategory;
  }

  get score(): number {
    return this.lastScore;
  }

  get currentGesture(): GestureName {
    return this.current;
  }

  get inferenceMs(): number {
    return this.lastInferenceMs;
  }

  get avgInferenceMs(): number {
    if (this.inferSamples.length === 0) return this.lastInferenceMs;
    return this.inferSamples.reduce((a, b) => a + b, 0) / this.inferSamples.length;
  }

  setMirror(mirror: boolean): void {
    this.mirror = mirror;
  }

  on(listener: (event: GestureEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GestureEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[GestureEngine] listener lỗi:", error);
      }
    }
  }

  /** Chạy suy luận cho 1 khung hình. Gọi tối đa ~30 lần/giây. */
  process(now: number): void {
    if (this.closed) return;
    const video = this.video;

    if (video.readyState < 2 || video.videoWidth === 0) {
      this.handleNoHand(now);
      return;
    }

    // MediaPipe yêu cầu timestamp tăng dần tuyệt đối.
    const ts = Math.max(this.lastTs + 0.5, now);
    this.lastTs = ts;

    let result: GestureRecognizerResult;
    const t0 = performance.now();
    try {
      result = this.recognizer.recognizeForVideo(video, ts);
    } catch (error) {
      console.error("[GestureEngine] recognizeForVideo lỗi:", error);
      this.handleNoHand(now);
      return;
    }
    this.lastInferenceMs = performance.now() - t0;
    this.inferSamples.push(this.lastInferenceMs);
    if (this.inferSamples.length > 60) this.inferSamples.shift();

    const landmarks = result.landmarks?.[0];
    if (!landmarks || landmarks.length < 21) {
      this.handleNoHand(now);
      return;
    }

    const category = result.gestures?.[0]?.[0];
    this.lastCategory = category?.categoryName ?? "None";
    this.lastScore = category?.score ?? 0;

    if (!this.handPresent) {
      this.handPresent = true;
      this.emit({ type: "hand-found", timestamp: now });
    }
    this.lastHandTs = now;

    const frame = this.buildFrame(landmarks, video.videoWidth, video.videoHeight);
    this.lastFrame = frame;
    this.swipeDetector.setFrameWidth(frame.frameWidth);

    // --- Vuốt: dùng độ mở bàn tay theo LANDMARK (chống nhòe "None" khi vuốt nhanh)
    const swipe = this.swipeDetector.push({
      t: now,
      x: frame.palm.x * frame.frameWidth,
      y: frame.palm.y * frame.frameHeight,
      handSize: frame.handSize,
      isOpen: true,
      isFist: frame.isFist,
    });
    if (swipe) {
      this.emit({ type: "swipe", direction: swipe.direction, timestamp: now });
    }

    this.updateGesture(frame, now);
  }

  /** Chuyển landmark gốc → toạ độ hiển thị và tính các đại lượng dẫn xuất. */
  private buildFrame(
    landmarks: NormalizedLandmark[],
    frameWidth: number,
    frameHeight: number,
  ): HandFrame {
    const display: NormalizedLandmark[] = landmarks.map((p) => ({
      x: this.mirror ? 1 - p.x : p.x,
      y: p.y,
      z: p.z,
      visibility: p.visibility,
    }));

    let px = 0;
    let py = 0;
    for (const index of PALM_CENTER_INDICES) {
      px += display[index].x;
      py += display[index].y;
    }
    px /= PALM_CENTER_INDICES.length;
    py /= PALM_CENTER_INDICES.length;

    const wrist = display[WRIST_INDEX];
    const middleMcp = display[MIDDLE_MCP_INDEX];
    const handSize = Math.hypot(
      (middleMcp.x - wrist.x) * frameWidth,
      (middleMcp.y - wrist.y) * frameHeight,
    );

    const { isOpen, isFist } = analyzeHand(display);

    return {
      landmarks: display,
      isOpen,
      isFist,
      palm: { x: px, y: py },
      handSize,
      frameWidth,
      frameHeight,
    };
  }

  /** Hysteresis + yêu cầu ổn định >= stableMs trước khi xác nhận cử chỉ. */
  private updateGesture(frame: HandFrame, now: number): void {
    const category = this.lastCategory;
    const score = this.lastScore;
    const reliableLandmarks = frame.handSize >= GESTURE.minHandSizePx;

    let raw: GestureName = "none";

    // Hysteresis: đang giữ cử chỉ nào thì chỉ cần score > exitScore để giữ,
    // nhờ vậy cử chỉ không bị nhấp nháy khi score dao động quanh ngưỡng.
    if (
      this.current === "open" &&
      ((category === "Open_Palm" && score >= GESTURE.exitScore) || frame.isOpen)
    ) {
      raw = "open";
    } else if (
      category === "Open_Palm" &&
      score >= GESTURE.openScore &&
      (!reliableLandmarks || frame.isOpen)
    ) {
      raw = "open";
    } else if (frame.isOpen && reliableLandmarks && score >= 0.35) {
      // Fallback dựa trên landmark khi MediaPipe phân loại "None" do motion blur.
      raw = "open";
    } else if (
      this.current === "fist" &&
      ((category === "Closed_Fist" && score >= GESTURE.exitScore) || frame.isFist)
    ) {
      raw = "fist";
    } else if (
      category === "Closed_Fist" &&
      score >= GESTURE.fistScore &&
      (!reliableLandmarks || frame.isFist)
    ) {
      raw = "fist";
    } else if (frame.isFist && reliableLandmarks && score >= 0.35) {
      // Fallback dựa trên landmark khi MediaPipe phân loại "None".
      raw = "fist";
    } else if (reliableLandmarks && !frame.isOpen && category !== "Open_Palm" && score >= 0.2) {
      // Fallback mềm: tay không xòe và model không nói "Open_Palm" → coi như nắm.
      raw = "fist";
    }

    if (raw !== this.current) {
      if (raw !== this.candidate) {
        this.candidate = raw;
        this.candidateSince = now;
      } else if (now - this.candidateSince >= GESTURE.stableMs) {
        this.current = raw;
        if (raw === "open") this.emit({ type: "open", score, timestamp: now });
        if (raw === "fist") this.emit({ type: "fist", score, timestamp: now });
      }
    } else {
      this.candidate = raw;
      this.candidateSince = now;
    }
  }

  private handleNoHand(now: number): void {
    this.lastFrame = null;
    this.swipeDetector.reset();
    if (!this.handPresent) return;
    if (now - this.lastHandTs >= GESTURE.handLostMs) {
      this.handPresent = false;
      this.current = "none";
      this.candidate = "none";
      this.lastCategory = "None";
      this.lastScore = 0;
      this.emit({ type: "hand-lost", timestamp: now });
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    try {
      this.recognizer.close();
    } catch (error) {
      console.warn("[GestureEngine] close lỗi:", error);
    }
  }
}
