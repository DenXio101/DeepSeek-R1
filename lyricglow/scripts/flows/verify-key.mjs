// Key change (build with VITE_FEATURE_KEY=1): the SoundTouch shifter is inserted at key ≠ 0 and
// removed at 0, the status line and pill follow, the demo transposes its synth, YouTube is excluded,
// and a missing processor file degrades to "not available" with audio still playing.
import { energy, ensureServer, exists, fixtures, makeChecker, mediaTime, openApp, sleep, text, tid, uploadFile, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-key");
const fx = fixtures();
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  const status = () => text(page, "key-status");
  const preserves = () => page.$eval(tid("audio-element"), (el) => el.preservesPitch);

  // demo: synth-only transposition
  await page.click(tid("btn-more"));
  ok(await exists(page, "key-row"), "Key row present (flag on)");
  ok((await status()) === "off", `demo: status "off" (${await status()})`);
  await page.click(tid("key-minus"));
  ok((await text(page, "key-value")) === "−1" && (await status()) === "on (demo melody)", `demo: −1 transposes the melody (${await status()})`);
  await page.click(tid("more-close"));
  ok((await text(page, "key-pill")) === "Key −1", "pill shows Key −1 on the demo");

  // local file: shifter in the graph at key ≠ 0
  await uploadFile(page, fx.beat);
  await page.click(tid("btn-play"));
  await sleep(800);
  ok((await text(page, "key-pill")) === "Key −1", "key carries over to the file (−1)");
  await page.waitForFunction(() => document.querySelector("[data-testid=key-pill]"), null, { timeout: 8000 });
  await page.click(tid("btn-more"));
  await page.waitForFunction(() => document.querySelector("[data-testid=key-status]")?.textContent === "on", null, { timeout: 8000 });
  ok(true, "shifter loaded and inserted (status on)");
  await page.click(tid("key-minus"));
  await sleep(200);
  ok((await text(page, "key-value")) === "−2", "second tap → −2");
  await page.click(tid("more-close"));
  await sleep(1200);
  ok((await preserves()) === false, "preservesPitch is off while the shifter is in");
  const e = await energy(page);
  ok(e > 0.02, `stage lights still follow the audio through the shifter (--energy ${e.toFixed(3)})`);
  const t1 = await mediaTime(page);
  await sleep(1000);
  const t2 = await mediaTime(page);
  ok(t2 - t1 > 0.8, `element clock keeps running at key −2 (${(t2 - t1).toFixed(2)} s in 1 s)`);
  ok((await text(page, "key-pill")) === "Key −2", "pill reads Key −2");

  // back to 0: true bypass
  await page.click(tid("btn-more"));
  await page.click(tid("key-zero"));
  await sleep(300);
  ok((await status()) === "off", `key 0 → status off (${await status()})`);
  await page.click(tid("more-close"));
  await sleep(200);
  ok((await preserves()) === true, "preservesPitch restored at key 0");
  ok(!(await exists(page, "key-pill")), "pill gone at key 0");
  const e0 = await energy(page);
  ok(e0 > 0.02, `audio still flows after the shifter is removed (--energy ${e0.toFixed(3)})`);

  // YouTube: excluded
  await page.click(tid("btn-find-song"));
  await page.fill(tid("youtube-url-input"), "https://www.youtube.com/watch?v=abc123XYZ00");
  await page.click(tid("youtube-load"));
  await page.waitForSelector(tid("youtube-stage"), { state: "attached" });
  await sleep(300);
  await page.click(tid("btn-more"));
  ok((await status()) === "Local files and the demo only", `YouTube: ${await status()}`);
  ok(await page.$eval(tid("key-minus"), (el) => el.disabled), "YouTube: stepper disabled");
  await page.context().close();

  // processor file missing → not available, audio plays
  const page2 = await openApp(browser);
  await page2.route(/soundtouch-processor/, (route) => route.abort());
  await uploadFile(page2, fx.beat);
  await page2.click(tid("btn-play"));
  await page2.click(tid("btn-more"));
  await page2.click(tid("key-minus"));
  await page2.waitForFunction(() => /not available/.test(document.querySelector("[data-testid=key-status]")?.textContent ?? ""), null, { timeout: 10000 });
  ok(true, `processor 404 → ${await text(page2, "key-status")}`);
  ok(await page2.$eval(tid("key-minus"), (el) => el.disabled), "stepper disabled when unavailable");
  await page2.click(tid("more-close"));
  await sleep(800);
  ok(!(await exists(page2, "key-pill")), "no pill when the shifter failed");
  ok((await page2.$eval(tid("audio-element"), (el) => el.preservesPitch)) === true, "preservesPitch untouched on failure");
  ok((await mediaTime(page2)) > 0.5, "audio keeps playing");
  await page2.context().close();
});
done();
