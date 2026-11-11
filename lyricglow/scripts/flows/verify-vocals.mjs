// Vocals switch on the thumb bar: one tap mutes the original singer, a second restores the last
// level; disabled on mono files and for non-file sources; Restart lives in the seek row.
import { ensureServer, exists, fixtures, makeChecker, mediaTime, openApp, setRange, sleep, tid, uploadFile, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-vocals");
const fx = fixtures();
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser, { viewport: { width: 320, height: 700 } });
  const state = () => page.$eval(tid("vocals-state"), (el) => el.getAttribute("data-value"));
  const level = async () => {
    await page.click(tid("btn-more"));
    const v = await page.$eval(tid("vocal-level"), (el) => el.value);
    await page.click(tid("more-close"));
    await sleep(100);
    return v;
  };

  ok((await state()) === "unavailable", `demo: switch unavailable (${await state()})`);
  ok((await page.getAttribute(tid("vocals-toggle"), "aria-label")).includes("Local files only"), "demo: reason is 'Local files only'");

  await uploadFile(page, fx.beat);
  await sleep(300);
  ok((await state()) === "on", "stereo file: switch on");
  ok((await page.getAttribute(tid("vocals-toggle"), "aria-checked")) === "true", "aria-checked true");
  await page.click(tid("vocals-toggle"));
  await sleep(100);
  ok((await state()) === "off", "tap → off");
  ok((await level()) === "0", "Voice slider reads 0 after the tap");
  await page.click(tid("vocals-toggle"));
  await sleep(100);
  ok((await state()) === "on", "second tap → on");
  ok((await level()) === "35", "Voice slider back at 35");

  await page.click(tid("btn-more"));
  await setRange(page, tid("vocal-level"), 60);
  await page.click(tid("more-close"));
  await sleep(100);
  await page.click(tid("vocals-toggle"));
  await page.click(tid("vocals-toggle"));
  ok((await level()) === "60", "switch restores the slider's last level (60)");

  const items = await page.$$eval(`${tid("thumb-row")} > *`, (els) => els.map((e) => Math.round((e.querySelector("button") || e).getBoundingClientRect().width)));
  ok(items.length === 5 && items.every((w) => w >= 44), `five thumb targets ≥ 44 px at 320 px (${items.join(", ")})`);
  const inRow = await page.$(`.progress-row ${tid("btn-restart")}`);
  ok(!!inRow, "Restart sits in the seek row");
  ok((await page.$$(tid("btn-restart"))).length === 1, "exactly one Restart control");

  await page.click(tid("btn-play"));
  await sleep(1800);
  await page.click(tid("btn-restart"));
  await sleep(400);
  const t = await mediaTime(page);
  ok(t < 1 && !(await page.$eval(tid("audio-element"), (el) => el.paused)), `Restart seeks to 0 and plays (${t.toFixed(2)} s)`);

  await uploadFile(page, fx.mono);
  await page.click(tid("btn-play"));
  await sleep(2500);
  ok((await state()) === "unavailable", "mono file: switch unavailable");
  ok((await page.getAttribute(tid("vocals-toggle"), "aria-label")).includes("Mono file"), "mono reason shown");
  await page.click(tid("btn-more"));
  ok(await exists(page, "vocal-mono-note"), "slider shows the same mono note");
  await page.click(tid("more-close"));

  await page.click(tid("btn-find-song"));
  await page.fill(tid("youtube-url-input"), "https://www.youtube.com/watch?v=abc123XYZ00");
  await page.click(tid("youtube-load"));
  await page.waitForSelector(tid("youtube-stage"), { state: "attached" });
  await sleep(300);
  ok((await state()) === "unavailable", "YouTube: switch unavailable");
  await page.context().close();
});
done();
