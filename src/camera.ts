/**
 * Quản lý webcam: xin quyền, đổi camera trước/sau, dừng stream.
 * Video phải có playsinline + muted + autoplay trong HTML để chạy trên iOS.
 */

import { CAMERA } from "./config";

export type FacingMode = "user" | "environment";

export interface StartOptions {
  facing?: FacingMode;
  lowRes?: boolean;
}

export class Camera {
  private readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private facing: FacingMode = CAMERA.facingMode;
  private lowRes = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Đếm số camera (chỉ hiện nút đổi camera khi có nhiều hơn 1). */
  static async countCameras(): Promise<number> {
    if (!navigator.mediaDevices?.enumerateDevices) return 0;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput").length;
    } catch {
      return 0;
    }
  }

  get mirrored(): boolean {
    // Chỉ camera trước mới lật gương; camera sau giữ nguyên.
    return this.facing === "user";
  }

  get facingMode(): FacingMode {
    return this.facing;
  }

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live");
  }

  get videoWidth(): number {
    return this.video.videoWidth;
  }

  get videoHeight(): number {
    return this.video.videoHeight;
  }

  async start(options: StartOptions = {}): Promise<void> {
    this.stop();
    this.facing = options.facing ?? CAMERA.facingMode;
    this.lowRes = options.lowRes ?? false;
    const width = this.lowRes ? CAMERA.fallbackWidth : CAMERA.width;
    const height = this.lowRes ? CAMERA.fallbackHeight : CAMERA.height;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.facing },
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: CAMERA.frameRate },
        },
        audio: false,
      });
    } catch (error) {
      // Một số thiết bị từ chối ràng buộc width/height/frameRate → thử lại tối giản.
      if (error instanceof DOMException && error.name === "OverconstrainedError") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: this.facing } },
          audio: false,
        });
      } else {
        throw error;
      }
    }

    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch {
      // iOS đôi khi chặn autoplay nếu chưa có tương tác — nút "Bắt đầu" đã là tương tác
      // nên trường hợp này hiếm; bỏ qua để chờ sự kiện loadedmetadata bên dưới.
    }
    await videoReady(this.video);

    // Nếu camera thực tế không phải facingMode mong muốn (máy chỉ có 1 camera),
    // vẫn giữ facing đã chọn để logic gương nhất quán với nút đổi camera.
  }

  /** Đổi camera trước ⇄ sau. Ném lỗi nếu không mở được (caller tự xử lý). */
  async toggleFacing(): Promise<FacingMode> {
    const previous = this.facing;
    this.facing = previous === "user" ? "environment" : "user";
    try {
      await this.start({ facing: this.facing, lowRes: this.lowRes });
      return this.facing;
    } catch (error) {
      this.facing = previous;
      await this.start({ facing: previous, lowRes: this.lowRes });
      throw error;
    }
  }

  /** Khởi động lại với độ phân giải thấp (tự thích ứng khi máy yếu). */
  async restartLowRes(): Promise<void> {
    if (this.lowRes) return;
    await this.start({ facing: this.facing, lowRes: true });
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video.srcObject) this.video.srcObject = null;
  }
}

function videoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera không truyền được hình ảnh (timeout)."));
    }, 10000);
    const onReady = () => {
      if (video.videoWidth === 0) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

/**
 * object-fit: cover — video bị phóng to để phủ kín khung, mép bị cắt.
 * Hàm trả về tỉ lệ + offset để vẽ overlay khớp chính xác bàn tay.
 */
export function computeCover(
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
): { scale: number; offsetX: number; offsetY: number; shownWidth: number; shownHeight: number } {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, shownWidth: boxWidth, shownHeight: boxHeight };
  }
  const scale = Math.max(boxWidth / frameWidth, boxHeight / frameHeight);
  const shownWidth = frameWidth * scale;
  const shownHeight = frameHeight * scale;
  return {
    scale,
    offsetX: (boxWidth - shownWidth) / 2,
    offsetY: (boxHeight - shownHeight) / 2,
    shownWidth,
    shownHeight,
  };
}
