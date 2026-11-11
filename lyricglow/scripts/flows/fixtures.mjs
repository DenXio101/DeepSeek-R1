// Deterministic audio fixtures for the browser flows, generated on demand into
// node_modules/.tmp/flows so no binary files live in the repo.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FIXTURE_DIR = path.join(ROOT, "node_modules", ".tmp", "flows");
const RATE = 44100;

/** 16-bit PCM WAV from one Float32Array per channel. */
export function encodeWav(channels, sampleRate = RATE) {
  const n = channels[0].length;
  const data = Buffer.alloc(n * channels.length * 2);
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (const ch of channels) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      data.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels.length, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels.length * 2, 28);
  header.writeUInt16LE(channels.length * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sine = (hz, i, amp = 1) => amp * Math.sin((2 * Math.PI * hz * i) / RATE);

function kickTrack(seconds, bpm) {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  const period = Math.round((60 / bpm) * RATE);
  for (let i = 0; i < n; i++) {
    const t = (i % period) / RATE;
    out[i] = sine(60, i, 0.5) * Math.exp(-t * 12);
  }
  return out;
}

function tone(seconds, hz, amp, phaseSign = 1) {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = phaseSign * sine(hz, i, amp);
  return out;
}

function mix(...tracks) {
  const n = tracks[0].length;
  const out = new Float32Array(n);
  for (const t of tracks) for (let i = 0; i < n; i++) out[i] += t[i];
  return out;
}

/** Writes every fixture once and returns their absolute paths. */
export function fixtures() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const files = {
    // stereo backing track: kick on every beat, a centred "vocal" tone, side strings (L−R)
    beat: ["beat.wav", () => {
      const kick = kickTrack(6, 100);
      const vocal = tone(6, 220, 0.3);
      return [mix(kick, vocal, tone(6, 330, 0.15, 1)), mix(kick, vocal, tone(6, 330, 0.15, -1))];
    }],
    // clearly different left and right content
    stereo: ["stereo.wav", () => [mix(kickTrack(6, 100), tone(6, 330, 0.3)), mix(kickTrack(6, 100), tone(6, 440, 0.3))]],
    // identical channels: centre-channel reduction would mute everything
    mono: ["mono.wav", () => {
      const m = mix(kickTrack(6, 100), tone(6, 220, 0.3));
      return [m, m];
    }],
    // fake microphone input for Chromium's --use-file-for-fake-audio-capture
    mic220: ["mic220.wav", () => [tone(12, 220, 0.5)]],
    // key-spike fixtures: a pure A4 (12 s) and 20 ms 1 kHz bursts every 0.5 s (onset detection survives the shifter)
    a440: ["a440.wav", () => [tone(12, 440, 0.5), tone(12, 440, 0.5)]],
    click: ["click.wav", () => {
      const n = Math.round(4 * RATE);
      const out = new Float32Array(n);
      const burst = Math.round(0.02 * RATE);
      for (let s = 0; s < n; s += Math.round(0.5 * RATE)) for (let i = 0; i < burst && s + i < n; i++) out[s + i] = sine(1000, i, 0.9);
      return [out, out];
    }],
  };
  const paths = {};
  for (const [key, [name, make]] of Object.entries(files)) {
    const p = path.join(FIXTURE_DIR, name);
    if (!existsSync(p)) writeFileSync(p, encodeWav(make()));
    paths[key] = p;
  }
  return paths;
}
