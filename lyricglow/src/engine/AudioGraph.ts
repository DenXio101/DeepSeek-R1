// ─── AudioGraph ──────────────────────────────────────────────────────────────
// Owns the AudioContext, the media analyser (one MediaElementSource per
// element, ever) and the microphone path. Nothing from the mic reaches the
// speakers. Safe under StrictMode double-mounts.

export type MicStatus = "off" | "requesting" | "on" | "error";
export interface MicState {
  status: MicStatus;
  message: string | null;
}

type Win = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

/** createMediaElementSource may only be called once per element per document */
const mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export const MIC_FFT = 2048;
const MEDIA_FFT = 1024;

export class AudioGraph {
  readonly supported: boolean;
  ctx: AudioContext | null = null;
  private mediaAnalyser: AnalyserNode | null = null;
  private attachedEl: HTMLMediaElement | null = null;
  private spectrum: Uint8Array<ArrayBuffer> = new Uint8Array(MEDIA_FFT / 2);

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micFilter: BiquadFilterNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  readonly micBuffer: Float32Array<ArrayBuffer> = new Float32Array(MIC_FFT);
  private micState: MicState = { status: "off", message: null };
  private micSubs = new Set<() => void>();
  private micRequestId = 0;

  constructor() {
    const w = typeof window !== "undefined" ? (window as unknown as Win) : undefined;
    this.supported = !!w && !!(w.AudioContext || w.webkitAudioContext);
  }

  /** create the context synchronously (call inside a user gesture when possible) */
  ensureContext(): AudioContext | null {
    if (!this.supported) return null;
    if (!this.ctx) {
      const w = window as unknown as Win;
      const Ctor = (w.AudioContext || w.webkitAudioContext)!;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  resume(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  // ── media analyser ───────────────────────────────────────────────────
  /** Route the element through an analyser. Irreversible per element; returns false on failure. */
  attachMedia(el: HTMLMediaElement): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (this.attachedEl === el && this.mediaAnalyser) return true;
    try {
      let src = mediaSources.get(el);
      if (!src) {
        src = ctx.createMediaElementSource(el);
        mediaSources.set(el, src);
        src.connect(ctx.destination); // keep audible, always
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = MEDIA_FFT;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      this.detachMedia();
      this.mediaAnalyser = analyser;
      this.attachedEl = el;
      return true;
    } catch {
      return false;
    }
  }

  /** stop reading the analyser (audio keeps flowing to the destination) */
  detachMedia(): void {
    if (this.mediaAnalyser) {
      try {
        this.mediaAnalyser.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.mediaAnalyser = null;
    this.attachedEl = null;
  }

  get mediaAnalyserActive(): boolean {
    return !!this.mediaAnalyser && !!this.attachedEl && this.attachedEl.isConnected;
  }

  /** fills and returns the byte spectrum, or null when no analyser is active */
  readSpectrum(): Uint8Array | null {
    if (!this.mediaAnalyser) return null;
    this.mediaAnalyser.getByteFrequencyData(this.spectrum);
    return this.spectrum;
  }

  /** Hz per bin of the media analyser */
  get binHz(): number {
    return this.sampleRate / MEDIA_FFT;
  }

  // ── microphone ───────────────────────────────────────────────────────
  getMicState = (): MicState => this.micState;

  subscribeMic = (cb: () => void): (() => void) => {
    this.micSubs.add(cb);
    return () => {
      this.micSubs.delete(cb);
    };
  };

  private setMic(next: MicState): void {
    this.micState = next;
    for (const cb of this.micSubs) cb();
  }

  async enableMic(): Promise<void> {
    if (this.micState.status === "on" || this.micState.status === "requesting") return;
    const ctx = this.ensureContext();
    if (!ctx) {
      this.setMic({ status: "error", message: "Web Audio isn't available in this browser." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setMic({ status: "error", message: "Microphone access needs a secure (https) page and a supported browser." });
      return;
    }
    const id = ++this.micRequestId;
    this.setMic({ status: "requesting", message: null });
    this.resume();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
      if (id !== this.micRequestId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 70;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = MIC_FFT;
      analyser.smoothingTimeConstant = 0;
      source.connect(filter);
      filter.connect(analyser);
      // deliberately NOT connected to ctx.destination → no feedback
      this.micStream = stream;
      this.micSource = source;
      this.micFilter = filter;
      this.micAnalyser = analyser;
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (this.micStream === stream) {
          this.disableMic();
          this.setMic({ status: "error", message: "Microphone was disconnected." });
        }
      });
      this.setMic({ status: "on", message: null });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone blocked — allow it in the browser's site settings."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone found."
            : name === "NotReadableError" || name === "AbortError"
              ? "Microphone is busy in another app."
              : "Couldn't start the microphone.";
      this.setMic({ status: "error", message });
    }
  }

  disableMic(): void {
    this.micRequestId++;
    this.micStream?.getTracks().forEach((t) => t.stop());
    try {
      this.micSource?.disconnect();
      this.micFilter?.disconnect();
      this.micAnalyser?.disconnect();
    } catch {
      /* ignore */
    }
    this.micStream = null;
    this.micSource = null;
    this.micFilter = null;
    this.micAnalyser = null;
    if (this.micState.status !== "off") this.setMic({ status: "off", message: null });
  }

  get micOn(): boolean {
    return this.micState.status === "on" && !!this.micAnalyser;
  }

  /** fills micBuffer with the latest time-domain samples; null when the mic is off */
  readMicTimeDomain(): Float32Array | null {
    if (!this.micAnalyser) return null;
    this.micAnalyser.getFloatTimeDomainData(this.micBuffer);
    return this.micBuffer;
  }

  dispose(): void {
    this.disableMic();
    this.detachMedia();
  }
}
