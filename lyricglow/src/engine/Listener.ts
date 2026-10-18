// ─── Listener: grabs a few seconds from the room mic and asks the server who's playing ──
import type { RecognizeResult } from "../model/acr";
import { downsample, encodeWav16 } from "../model/wav";

export const CAPTURE_S = 6;
export const TARGET_RATE = 8000;

export interface Capture {
  wav: ArrayBuffer;
  sampleSeconds: number;
  /** performance.now() when the last sample was recorded */
  captureEnd: number;
}

export type RecognizeOutcome = (RecognizeResult & { status: number }) | { ok: false; status: 0; code: -9; error: string };

/**
 * Owns its own microphone stream (separate from the scoring mic, so Listen never switches
 * scoring on). Capture = ScriptProcessor → muted gain → destination; nothing is audible.
 */
export class Listener {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  get open(): boolean {
    return !!this.stream;
  }

  async start(ctx: AudioContext): Promise<void> {
    if (this.stream) return;
    this.ctx = ctx;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      this.source?.disconnect();
    } catch {
      /* already gone */
    }
    this.stream = null;
    this.source = null;
  }

  /** record `seconds` of mono audio and return it as an 8 kHz 16-bit WAV */
  capture(seconds = CAPTURE_S): Promise<Capture> {
    const ctx = this.ctx;
    const source = this.source;
    if (!ctx || !source) return Promise.reject(new Error("Listener is not open."));
    return new Promise<Capture>((resolve, reject) => {
      const want = Math.ceil(ctx.sampleRate * seconds);
      const chunks: Float32Array[] = [];
      let got = 0;
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        try {
          source.disconnect(proc);
          proc.disconnect();
          mute.disconnect();
        } catch {
          /* ignore */
        }
        if (err) {
          reject(err);
          return;
        }
        const all = new Float32Array(got);
        let off = 0;
        for (const c of chunks) {
          all.set(c, off);
          off += c.length;
        }
        const mono = downsample(all, ctx.sampleRate, TARGET_RATE);
        resolve({ wav: encodeWav16(mono, TARGET_RATE), sampleSeconds: mono.length / TARGET_RATE, captureEnd: performance.now() });
      };
      proc.onaudioprocess = (e) => {
        if (done) return;
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        got += data.length;
        if (got >= want) finish();
      };
      source.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);
      window.setTimeout(() => finish(got > 0 ? undefined : new Error("The microphone produced no audio.")), seconds * 1000 + 4000);
    });
  }
}

/** POST the snippet to our server function; never throws */
export async function recognize(wav: ArrayBuffer, signal?: AbortSignal): Promise<RecognizeOutcome> {
  try {
    const res = await fetch("/api/recognize", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav, signal });
    const data = (await res.json().catch(() => null)) as RecognizeResult | null;
    if (!data) return { ok: false, status: res.status, code: -8, error: `Recognition server error (${res.status}).` };
    return { ...data, status: res.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { ok: false, status: 0, code: -9, error: "cancelled" };
    return { ok: false, status: 0, code: -9, error: "Couldn't reach the recognition server." };
  }
}
