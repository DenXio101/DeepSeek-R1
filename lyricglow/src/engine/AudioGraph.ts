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

/**
 * Centre-channel vocal control. Studio vocals usually sit dead-centre of a
 * stereo mix, so (L−R) removes them while keeping the sides; the bass (also
 * centred) is restored from a low-passed mono sum.
 *   out = v·original + (1−v)·(side + lowBass)
 */
export interface VocalChain {
  input: GainNode;
  output: GainNode;
  setLevel(v: number): void;
  level: number;
  /** analyser on the side signal, used to detect mono sources */
  sideMeter: AnalyserNode;
  midMeter: AnalyserNode;
  dispose(): void;
}

export function createVocalChain(ctx: AudioContext): VocalChain {
  const input = ctx.createGain();
  // force a proper mono→stereo up-mix (L = R) so the splitter never sees a silent right channel
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  input.channelInterpretation = "speakers";
  const output = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  input.connect(split);

  // original passthrough (scaled by v)
  const dryL = ctx.createGain();
  const dryR = ctx.createGain();
  split.connect(dryL, 0);
  split.connect(dryR, 1);
  dryL.connect(merge, 0, 0);
  dryR.connect(merge, 0, 1);

  // side signal: L−R to left, R−L to right (scaled by 1−v)
  const sLpos = ctx.createGain();
  const sLneg = ctx.createGain();
  const sRpos = ctx.createGain();
  const sRneg = ctx.createGain();
  split.connect(sLpos, 0);
  split.connect(sLneg, 1);
  split.connect(sRpos, 1);
  split.connect(sRneg, 0);
  sLpos.connect(merge, 0, 0);
  sLneg.connect(merge, 0, 0);
  sRpos.connect(merge, 0, 1);
  sRneg.connect(merge, 0, 1);

  // low bass from the mono sum (scaled by 1−v)
  const lowIn = ctx.createGain();
  lowIn.gain.value = 0.5;
  split.connect(lowIn, 0);
  split.connect(lowIn, 1);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 140;
  lp.Q.value = 0.7;
  const lowOut = ctx.createGain();
  lowIn.connect(lp);
  lp.connect(lowOut);
  lowOut.connect(merge, 0, 0);
  lowOut.connect(merge, 0, 1);

  merge.connect(output);

  // meters for mono detection
  const sideMeter = ctx.createAnalyser();
  sideMeter.fftSize = 256;
  const midMeter = ctx.createAnalyser();
  midMeter.fftSize = 256;
  const sideTap = ctx.createGain();
  split.connect(sideTap, 0);
  const sideNeg = ctx.createGain();
  sideNeg.gain.value = -1;
  split.connect(sideNeg, 1);
  sideNeg.connect(sideTap);
  sideTap.connect(sideMeter);
  lowIn.connect(midMeter);

  const chain: VocalChain = {
    input,
    output,
    level: 1,
    sideMeter,
    midMeter,
    setLevel(v: number) {
      const lv = Math.max(0, Math.min(1, v));
      chain.level = lv;
      const t = ctx.currentTime;
      const wet = 1 - lv;
      const sideGain = wet * 0.9;
      dryL.gain.setTargetAtTime(lv, t, 0.03);
      dryR.gain.setTargetAtTime(lv, t, 0.03);
      sLpos.gain.setTargetAtTime(sideGain, t, 0.03);
      sRpos.gain.setTargetAtTime(sideGain, t, 0.03);
      sLneg.gain.setTargetAtTime(-sideGain, t, 0.03);
      sRneg.gain.setTargetAtTime(-sideGain, t, 0.03);
      lowOut.gain.setTargetAtTime(wet, t, 0.03);
    },
    dispose() {
      for (const n of [input, output, split, merge, dryL, dryR, sLpos, sLneg, sRpos, sRneg, lowIn, lp, lowOut, sideMeter, midMeter, sideTap, sideNeg]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
  chain.setLevel(1);
  return chain;
}

const vocalChains = new WeakMap<HTMLMediaElement, VocalChain>();

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
      this.sourceFor(ctx, el);
      // tap after the vocal chain so the stage lights follow what is actually heard
      const tap = vocalChains.get(el)?.output;
      this.useSource(tap ?? this.sourceFor(ctx, el), el);
      return true;
    } catch {
      return false;
    }
  }

  /** element → (vocal chain) → destination; built once per element, always audible */
  private sourceFor(ctx: AudioContext, el: HTMLMediaElement): MediaElementAudioSourceNode {
    let src = mediaSources.get(el);
    if (!src) {
      src = ctx.createMediaElementSource(el);
      mediaSources.set(el, src);
      const chain = createVocalChain(ctx);
      src.connect(chain.input);
      chain.output.connect(ctx.destination);
      vocalChains.set(el, chain);
    }
    return src;
  }

  /** Route the element through Web Audio (if not already) and set how much of the centre/vocal remains, 0..1. */
  setVocalLevel(el: HTMLMediaElement, level: number): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      this.sourceFor(ctx, el);
      vocalChains.get(el)?.setLevel(level);
      return true;
    } catch {
      return false;
    }
  }

  getVocalLevel(el: HTMLMediaElement): number {
    return vocalChains.get(el)?.level ?? 1;
  }

  /** true when the element plays through a vocal chain already */
  hasVocalChain(el: HTMLMediaElement): boolean {
    return vocalChains.has(el);
  }

  /**
   * Is the source effectively mono (no side signal)? null = not enough signal yet.
   * Vocal reduction on a mono file would mute almost everything, so callers bypass it.
   */
  vocalSourceIsMono(el: HTMLMediaElement): boolean | null {
    const chain = vocalChains.get(el);
    if (!chain) return null;
    const buf = new Float32Array(chain.sideMeter.fftSize);
    chain.sideMeter.getFloatTimeDomainData(buf);
    let side = 0;
    for (let i = 0; i < buf.length; i++) side += buf[i] * buf[i];
    side = Math.sqrt(side / buf.length);
    chain.midMeter.getFloatTimeDomainData(buf);
    let mid = 0;
    for (let i = 0; i < buf.length; i++) mid += buf[i] * buf[i];
    mid = Math.sqrt(mid / buf.length);
    if (mid < 0.01) return null;
    return side / mid < 0.02;
  }

  /** Feed any audio node (e.g. the demo synth) into the stage analyser. Caller keeps its own path to the destination. */
  attachSourceNode(node: AudioNode): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      this.useSource(node, null);
      this.sourceNode = node;
      return true;
    } catch {
      return false;
    }
  }

  detachSourceNode(node: AudioNode): void {
    if (this.sourceNode === node) {
      this.detachMedia();
      this.sourceNode = null;
    }
  }

  private sourceNode: AudioNode | null = null;

  private useSource(src: AudioNode, el: HTMLMediaElement | null): void {
    const ctx = this.ctx!;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = MEDIA_FFT;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    this.detachMedia();
    this.mediaAnalyser = analyser;
    this.attachedEl = el;
    this.sourceNode = el ? null : src;
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
    if (!this.mediaAnalyser) return false;
    if (this.attachedEl) return this.attachedEl.isConnected;
    return !!this.sourceNode;
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
