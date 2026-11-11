// Local file playback: upload, play, clock and lights move, Voice slider, mono detection, pause, restart.
import { energy, ensureServer, exists, fixtures, makeChecker, mediaTime, openApp, sleep, text, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-file");
const fx = fixtures();
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  const { uploadFile } = await import("./lib.mjs");
  await uploadFile(page, fx.beat);
  ok(await exists(page, "audio-element"), "audio element mounted for an MP3/WAV");
  await page.click(tid("btn-play"));
  await sleep(2200);
  const t = await mediaTime(page);
  ok(t > 1.2, `audio advanced after 2.2 s (${t.toFixed(2)} s)`);
  ok((await text(page, "time-current")) !== "0:00", "seek row time label moved");
  const e = await energy(page);
  ok(e > 0.02, `stage lights follow the file (--energy ${e.toFixed(3)}) — BASELINE`);
  await page.click(tid("btn-more"));
  ok(await exists(page, "vocal-control"), "Voice slider shown for a local file");
  ok((await page.$eval(tid("vocal-level"), (el) => el.value)) === "30", "Voice slider defaults to 30 %");
  ok(!(await exists(page, "vocal-mono-note")), "no mono note on a stereo file");
  await page.click(tid("more-close"));
  await page.click(tid("btn-pause"));
  await sleep(300);
  ok(await page.$eval(tid("audio-element"), (el) => el.paused), "pause pauses the element");
  await page.click(tid("btn-restart"));
  await sleep(500);
  const t2 = await mediaTime(page);
  ok(t2 < 1 && !(await page.$eval(tid("audio-element"), (el) => el.paused)), `restart seeks to 0 and plays (${t2.toFixed(2)} s)`);

  await uploadFile(page, fx.mono);
  await page.click(tid("btn-play"));
  await sleep(2500);
  await page.click(tid("btn-more"));
  ok(await exists(page, "vocal-mono-note"), "mono file detected → mono note");
  ok(await page.$eval(tid("vocal-level"), (el) => el.disabled), "Voice slider disabled on a mono file");
  await page.context().close();
});
done();
