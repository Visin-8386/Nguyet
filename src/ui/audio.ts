/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh).
 * AudioContext CHỈ được tạo/resume trong lần bấm "Bắt đầu" (yêu cầu của iOS).
 */

export type SoundName = "tick" | "catch" | "reveal" | "swipe" | "start" | "toggle";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mutedFlag = false;

  get muted(): boolean {
    return this.mutedFlag;
  }

  /** Gọi trong sự kiện click "Bắt đầu" để mở khoá audio trên iOS. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      } catch (error) {
        console.warn("[audio] Không tạo được AudioContext:", error);
        return;
      }
    }
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      // Bỏ qua: một số trình duyệt vẫn chặn cho tới lần tương tác kế tiếp.
    }
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.01);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    if (!this.mutedFlag) this.play("toggle");
    return this.mutedFlag;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.mutedFlag || ctx.state !== "running") return;
    try {
      switch (name) {
        case "tick":
          this.tone(ctx, master, 720, 900, 0.045, "square", 0.05);
          break;
        case "catch":
          this.tone(ctx, master, 190, 70, 0.28, "sine", 0.3);
          break;
        case "reveal":
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            this.tone(ctx, master, freq, freq, 0.22, "triangle", 0.16, i * 0.09);
          });
          break;
        case "swipe":
          this.whoosh(ctx, master);
          break;
        case "start":
          [392, 523.25, 659.25].forEach((freq, i) => {
            this.tone(ctx, master, freq, freq, 0.16, "sine", 0.18, i * 0.1);
          });
          break;
        case "toggle":
          this.tone(ctx, master, 520, 520, 0.06, "sine", 0.1);
          break;
      }
    } catch (error) {
      console.warn("[audio] Lỗi phát âm thanh:", error);
    }
  }

  private tone(
    ctx: AudioContext,
    master: GainNode,
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private whoosh(ctx: AudioContext, master: GainNode): void {
    const buffer = this.noiseBuffer;
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(500, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.22);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      // Giảm dần biên độ để nghe như tiếng "vút"
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    return buffer;
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
    }
  }
}
