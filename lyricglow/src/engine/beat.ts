// Beat helpers + synthetic "bass" used when no analyser is available (demo clock, iOS opt-out).

export function beatPhase(t: number, beat: number, beatOffset: number): number {
  if (beat <= 0) return 0;
  return ((((t - beatOffset) / beat) % 1) + 1) % 1;
}

/** sharp pulse on each beat, 0..1 */
export function syntheticBass(t: number, beat: number, beatOffset: number): number {
  const c = Math.cos(2 * Math.PI * beatPhase(t, beat, beatOffset));
  return Math.pow(Math.max(0, c), 8);
}

export function syntheticEnergy(bass: number): number {
  return 0.35 + 0.15 * bass;
}

/** asymmetric smoother: fast attack, slow release */
export class Envelope {
  value = 0;
  private attack: number;
  private release: number;
  constructor(attack = 0.6, release = 0.08) {
    this.attack = attack;
    this.release = release;
  }
  step(x: number): number {
    const k = x > this.value ? this.attack : this.release;
    this.value += (x - this.value) * k;
    if (this.value < 0.0005) this.value = 0;
    return this.value;
  }
}
