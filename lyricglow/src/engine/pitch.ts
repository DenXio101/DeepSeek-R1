// ─── Pitch detection: McLeod Pitch Method (NSDF + key maxima + parabolic fit) ──

export interface PitchResult {
  hz: number;
  clarity: number;
  rms: number;
}

export const PITCH_FMIN = 65; // C2
export const PITCH_FMAX = 1100;
export const CLARITY_ACCEPT = 0.85;
export const RMS_GATE = 0.01;

let nsdfBuf = new Float32Array(0);

export function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Returns the dominant pitch of `buf` or null when unvoiced / unclear.
 * Cost ≈ N·tauMax multiply-adds (about 1.5 M for N = 2048 at 48 kHz).
 */
export function detectPitchMPM(buf: Float32Array, sampleRate: number, fMin = PITCH_FMIN, fMax = PITCH_FMAX): PitchResult | null {
  const n = buf.length;
  const rms = rmsOf(buf);
  if (rms < RMS_GATE) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(Math.ceil(sampleRate / fMin), n >> 1);
  if (tauMax <= tauMin) return null;
  if (nsdfBuf.length < tauMax + 1) nsdfBuf = new Float32Array(tauMax + 1);
  const nsdf = nsdfBuf;

  for (let tau = tauMin; tau <= tauMax; tau++) {
    let acf = 0;
    let m = 0;
    const lim = n - tau;
    for (let i = 0; i < lim; i++) {
      const a = buf[i];
      const b = buf[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // key maxima: highest point between each positive zero crossing and the next negative one
  const maxima: number[] = [];
  // a lobe may already be positive at tauMin (high pitches): treat that as an open region
  let pos = nsdf[tauMin] > 0 ? tauMin : -1;
  let curMax = pos >= 0 ? nsdf[tauMin] : 0;
  let curMaxTau = pos >= 0 ? tauMin : -1;
  for (let tau = tauMin + 1; tau <= tauMax; tau++) {
    const prev = nsdf[tau - 1];
    const v = nsdf[tau];
    if (prev <= 0 && v > 0) {
      pos = tau;
      curMax = v;
      curMaxTau = tau;
    } else if (pos >= 0) {
      if (v > curMax) {
        curMax = v;
        curMaxTau = tau;
      }
      if (v <= 0 && prev > 0) {
        maxima.push(curMaxTau);
        pos = -1;
      }
    }
  }
  if (pos >= 0 && curMaxTau > 0) maxima.push(curMaxTau);
  if (!maxima.length) return null;

  let best = 0;
  for (const t of maxima) if (nsdf[t] > best) best = nsdf[t];
  const threshold = best * 0.9;
  let chosen = -1;
  for (const t of maxima) {
    if (nsdf[t] >= threshold) {
      chosen = t;
      break;
    }
  }
  if (chosen < 0) return null;
  const clarity = nsdf[chosen];
  if (clarity < 0.3) return null;

  // parabolic interpolation around the chosen lag
  let tauF = chosen;
  if (chosen > tauMin && chosen < tauMax) {
    const y0 = nsdf[chosen - 1];
    const y1 = nsdf[chosen];
    const y2 = nsdf[chosen + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-9) tauF = chosen + (0.5 * (y0 - y2)) / denom;
  }
  const hz = sampleRate / tauF;
  if (hz < fMin || hz > fMax) return null;
  return { hz, clarity, rms };
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** semitone distance on the pitch-class circle (octave-agnostic), 0..6 */
export function pitchClassDistance(a: number, b: number): number {
  const d = (((a - b) % 12) + 12) % 12;
  return Math.min(d, 12 - d);
}

export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export function midiName(midi: number): string {
  const r = Math.round(midi);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

/** median-3 → EMA with short hold and octave guard */
export class PitchSmoother {
  private hist: number[] = [];
  private ema: number | null = null;
  private lastAcceptedAt = -1;
  private stableSince = -1;

  reset(): void {
    this.hist = [];
    this.ema = null;
    this.lastAcceptedAt = -1;
    this.stableSince = -1;
  }

  /** @returns smoothed MIDI (or null) and a 0..1 confidence */
  push(midi: number | null, clarity: number, now: number): { midi: number | null; confidence: number } {
    if (midi === null) {
      if (this.ema !== null && this.lastAcceptedAt >= 0 && now - this.lastAcceptedAt < 0.12) {
        const conf = 1 - (now - this.lastAcceptedAt) / 0.12;
        return { midi: this.ema, confidence: conf * 0.6 };
      }
      this.hist = [];
      this.stableSince = -1;
      return { midi: null, confidence: 0 };
    }
    let m = midi;
    // octave guard: a sudden jump of ~12 semitones from a stable pitch is almost always a detector slip
    if (this.ema !== null && this.stableSince >= 0 && now - this.stableSince > 0.15) {
      const up = Math.abs(m - (this.ema + 12));
      const down = Math.abs(m - (this.ema - 12));
      if (up < 0.3) m -= 12;
      else if (down < 0.3) m += 12;
    }
    this.hist.push(m);
    if (this.hist.length > 3) this.hist.shift();
    const sorted = [...this.hist].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    if (this.ema === null || Math.abs(med - this.ema) > 2.5) {
      this.ema = med;
      this.stableSince = now;
    } else {
      this.ema += (med - this.ema) * 0.35;
      if (this.stableSince < 0) this.stableSince = now;
    }
    this.lastAcceptedAt = now;
    const confidence = Math.min(1, Math.max(0, (clarity - CLARITY_ACCEPT) / (1 - CLARITY_ACCEPT)) * 0.5 + 0.5);
    return { midi: this.ema, confidence };
  }
}
