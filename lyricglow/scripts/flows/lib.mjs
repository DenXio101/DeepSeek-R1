// Shared helpers for the browser flows: Playwright loading, dev server, mocks,
// fixtures and a tiny assertion collector. Every flow is a standalone script.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixtures } from "./fixtures.mjs";

export { fixtures };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BASE = process.env.FLOWS_BASE || "http://localhost:5173";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // the cloud sandbox ships Playwright globally with a matching browser
    return await import("/opt/node22/lib/node_modules/playwright/index.mjs");
  }
}

async function up(url) {
  try {
    const r = await fetch(url);
    return r.ok;
  } catch {
    return false;
  }
}

/** Start `vite` on BASE's port with the test YouTube key; resolves once it answers. */
export async function startDevServer(extraEnv = {}) {
  const port = new URL(BASE).port || "5173";
  const proc = spawn(path.join(ROOT, "node_modules", ".bin", "vite"), ["--port", port, "--strictPort"], {
    cwd: ROOT,
    // the test server has every feature flag on; "flag off = today" is covered by key 0 being a true bypass
    env: { ...process.env, VITE_YT_API_KEY: "testkey-ABC123", VITE_FEATURE_KEY: "1", ...extraEnv },
    stdio: "ignore",
    detached: true,
  });
  proc.unref(); // never keep the caller alive; `stop` kills the group
  const stop = () => {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  for (let i = 0; i < 100; i++) {
    if (await up(BASE)) return { stop };
    await sleep(300);
  }
  stop();
  throw new Error(`dev server did not answer on ${BASE}`);
}

/** Standalone flows start their own server when none is running. */
export async function ensureServer() {
  if (await up(BASE)) return;
  const s = await startDevServer();
  process.on("exit", s.stop);
}

export async function launch(pw, { mic } = {}) {
  const args = ["--autoplay-policy=no-user-gesture-required"];
  if (mic) args.push("--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${mic}`);
  return pw.chromium.launch({ args });
}

export async function withBrowser(opts, fn) {
  const pw = await loadPlaywright();
  const browser = await launch(pw, opts);
  try {
    await fn(browser, pw);
  } finally {
    await browser.close();
  }
}

export function makeChecker(name) {
  let fails = 0;
  const ok = (cond, msg) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  };
  const done = () => {
    console.log(`${name}: ${fails ? `${fails} failed` : "all passed"}`);
    process.exit(fails ? 1 : 0);
  };
  return { ok, done };
}

// ── mocks (no outbound network is needed by any flow) ───────────────────────

const LRC = (title, artist, lines) =>
  [`[ti:${title}]`, `[ar:${artist}]`, `[bpm:100]`, ...lines.map(([t, text]) => `[00:${String(Math.floor(t)).padStart(2, "0")}.${String(Math.round((t % 1) * 100)).padStart(2, "0")}]${text}`)].join("\n");

export const LRCLIB_HITS = [
  { id: 101, trackName: "Lantern Song", artistName: "Test Artist", albumName: "Fixtures", duration: 6, instrumental: false, plainLyrics: "Softly now the light fades\nLanterns drift above the city", syncedLyrics: LRC("Lantern Song", "Test Artist", [[0.6, "Softly now the light fades"], [2.4, "Lanterns drift above the city"], [4.2, "Whispers from below your window"]]) },
  { id: 102, trackName: "Second Song", artistName: "Test Artist", albumName: "Fixtures", duration: 6, instrumental: false, plainLyrics: "Second verse", syncedLyrics: LRC("Second Song", "Test Artist", [[0.6, "Second song first line"], [2.4, "Second song second line"], [4.2, "Second song third line"]]) },
  { id: 103, trackName: "Third Song", artistName: "Other Artist", albumName: "Fixtures", duration: 6, instrumental: false, plainLyrics: "Third", syncedLyrics: LRC("Third Song", "Other Artist", [[0.6, "Third song first line"], [2.4, "Third song second line"], [4.2, "Third song third line"]]) },
  { id: 104, trackName: "Plain Only", artistName: "Test Artist", albumName: null, duration: 200, instrumental: false, plainLyrics: "No timing here\nAt all", syncedLyrics: null },
  // first line after a 2.4 s gap → the timeline gives line 0 a three-beat count-in
  { id: 105, trackName: "Late Start", artistName: "Test Artist", albumName: "Fixtures", duration: 6, instrumental: false, plainLyrics: "Late start", syncedLyrics: LRC("Late Start", "Test Artist", [[2.4, "Late start first line"], [4.2, "Late start second line"]]) },
];

export const YT_SEARCH = {
  items: [
    { id: { videoId: "topicVid0001" }, snippet: { title: "Lantern Song", channelTitle: "Test Artist - Topic", thumbnails: { medium: { url: "https://i.ytimg.com/vi/topicVid0001/mqdefault.jpg" } } } },
    { id: { videoId: "officialV002" }, snippet: { title: "Test Artist - Lantern Song (Official Video)", channelTitle: "TestArtistVEVO", thumbnails: { medium: { url: "https://i.ytimg.com/vi/officialV002/mqdefault.jpg" } } } },
    { id: { videoId: "karaokeVd003" }, snippet: { title: "Lantern Song (Karaoke Version)", channelTitle: "Sing King", thumbnails: { medium: { url: "https://i.ytimg.com/vi/karaokeVd003/mqdefault.jpg" } } } },
  ],
};
/** what a "… karaoke instrumental" search returns; flows can empty it to test "none found" */
export const YT_KARAOKE_SEARCH = {
  items: [
    { id: { videoId: "coverVid0004" }, snippet: { title: "Lantern Song (Piano Karaoke Cover)", channelTitle: "Keys", thumbnails: {} } },
    { id: { videoId: "karaokeVd003" }, snippet: { title: "Lantern Song (Karaoke Version)", channelTitle: "Sing King", thumbnails: {} } },
  ],
};
export const YT_VIDEOS = {
  items: [
    { id: "topicVid0001", contentDetails: { duration: "PT3M20S" }, snippet: { title: "Lantern Song", channelTitle: "Test Artist - Topic" } },
    { id: "officialV002", contentDetails: { duration: "PT3M25S" }, snippet: { title: "Test Artist - Lantern Song (Official Video)", channelTitle: "TestArtistVEVO" } },
    { id: "karaokeVd003", contentDetails: { duration: "PT3M20S" }, snippet: { title: "Lantern Song (Karaoke Version)", channelTitle: "Sing King" } },
    { id: "noKaraoke05", contentDetails: { duration: "PT3M20S" }, snippet: { title: "Second Song", channelTitle: "Test Artist - Topic" } },
    { id: "abc123XYZ00", contentDetails: { duration: "PT3M20S" }, snippet: { title: "Lantern Song", channelTitle: "Test Artist - Topic" } },
  ],
};

/** A stand-in for the IFrame API: a player whose clock runs on a timer. */
export const FAKE_YT = `
window.YT = {
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: class {
    constructor(el, opts) {
      this.opts = opts; this.state = 5; this.t = 0; this.rate = 1; this.timer = 0;
      const host = typeof el === "string" ? document.getElementById(el) : el;
      host.setAttribute("data-fake-yt", opts.videoId);
      setTimeout(() => { opts.events?.onReady?.({ target: this, data: 0 }); opts.events?.onStateChange?.({ target: this, data: 5 }); }, 20);
    }
    emit(s) { this.state = s; this.opts.events?.onStateChange?.({ target: this, data: s }); }
    playVideo() { if (this.timer) return; this.timer = setInterval(() => { this.t += 0.1 * this.rate; if (this.t >= 200) { clearInterval(this.timer); this.timer = 0; this.emit(0); } }, 100); this.emit(1); }
    pauseVideo() { clearInterval(this.timer); this.timer = 0; this.emit(2); }
    seekTo(t) { this.t = t; }
    getCurrentTime() { return this.t; }
    getDuration() { return 200; }
    getPlayerState() { return this.state; }
    getPlaybackRate() { return this.rate; }
    setPlaybackRate(r) { this.rate = r; this.opts.events?.onPlaybackRateChange?.({ target: this, data: r }); }
    getAvailablePlaybackRates() { return [0.5, 0.75, 1, 1.25, 1.5, 2]; }
    destroy() { clearInterval(this.timer); }
  },
};
window.onYouTubeIframeAPIReady?.();
`;

export async function installMocks(page) {
  await page.route(/lrclib\.net\/api\/search/, (route) => route.fulfill({ json: LRCLIB_HITS }));
  await page.route(/googleapis\.com\/youtube\/v3\/search/, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    return route.fulfill({ json: /karaoke instrumental/.test(q) ? (/Second Song/.test(q) ? { items: [] } : YT_KARAOKE_SEARCH) : YT_SEARCH });
  });
  await page.route(/googleapis\.com\/youtube\/v3\/videos/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").split(",");
    return route.fulfill({ json: { items: YT_VIDEOS.items.filter((v) => ids.includes(v.id)) } });
  });
  await page.route(/youtube\.com\/iframe_api/, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_YT }));
  await page.route(/i\.ytimg\.com/, (route) => route.fulfill({ status: 404, body: "" }));
  await page.route(/\/api\/recognize/, (route) => route.fulfill({ status: 503, json: { ok: false, error: "Listen mode is not configured." } }));
}

// ── page helpers ────────────────────────────────────────────────────────────

export async function openApp(browser, { viewport = { width: 390, height: 844 }, mic = false } = {}) {
  const context = await browser.newContext({ viewport, permissions: mic ? ["microphone"] : [] });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
  await installMocks(page);
  await page.goto(BASE);
  await page.waitForSelector("[data-testid=app-root]");
  return page;
}

export const tid = (id) => `[data-testid=${id}]`;

/** Load a local media file through More → Files & tools (closes the sheet itself). */
export async function uploadFile(page, file) {
  await page.click(tid("btn-more"));
  await page.waitForSelector(tid("file-input"), { state: "attached" });
  await page.setInputFiles(tid("file-input"), file);
  await page.waitForSelector(tid("more-sheet"), { state: "detached" });
}

/** Set a React-controlled range input. */
export async function setRange(page, selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
}

export const energy = (page) => page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue("--energy")) || 0);
export const mediaTime = (page, sel = "[data-testid=audio-element]") => page.$eval(sel, (el) => el.currentTime);
export const text = (page, id) => page.$eval(tid(id), (el) => el.textContent?.trim() ?? "");
export const exists = (page, id) => page.$(tid(id)).then((h) => !!h);
