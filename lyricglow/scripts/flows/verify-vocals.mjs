// Vocals switch on the thumb bar (local files): Light 30 % by default, taps cycle
// Light → Minus one → Full → Light on the same level the Voice slider edits; disabled on
// mono files and on the demo; Restart lives in the seek row.
import { ensureServer, exists, fixtures, makeChecker, mediaTime, openApp, setRange, sleep, text, tid, uploadFile, withBrowser } from "./lib.mjs";

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
  const tap = async () => {
    await page.click(tid("vocals-toggle"));
    await sleep(100);
  };

  ok((await state()) === "unavailable", `demo: switch unavailable (${await state()})`);

  await uploadFile(page, fx.beat);
  await sleep(300);
  ok((await state()) === "light" && (await text(page, "vocals-state")) === "Vocals 30%", `stereo file starts at Light 30% (${await text(page, "vocals-state")})`);
  ok((await level()) === "30", "Voice slider reads 30");
  await tap();
  ok((await state()) === "off" && (await text(page, "vocals-state")) === "Minus one", "tap → Minus one");
  ok((await level()) === "0", "Voice slider reads 0");
  await tap();
  ok((await state()) === "full" && (await text(page, "vocals-state")) === "Vocals", "tap → Full");
  ok((await level()) === "100", "Voice slider reads 100");
  await tap();
  ok((await state()) === "light", "tap → back to Light");
  ok((await page.getAttribute(tid("vocals-toggle"), "aria-label")).includes("Tap for off"), "label announces the next step");

  await page.click(tid("btn-more"));
  await setRange(page, tid("vocal-level"), 60);
  await page.click(tid("more-close"));
  await sleep(100);
  ok((await state()) === "custom" && (await text(page, "vocals-state")) === "Vocals 60%", "slider level shows as custom 60%");
  await tap();
  ok((await state()) === "light", "custom drops to the next lower step (Light)");

  const items = await page.$$eval(`${tid("thumb-row")} > *`, (els) => els.map((e) => Math.round((e.querySelector("button") || e).getBoundingClientRect().width)));
  ok(items.length === 5 && items.every((w) => w >= 44), `five thumb targets ≥ 44 px at 320 px (${items.join(", ")})`);
  ok(!!(await page.$(`.progress-row ${tid("btn-restart")}`)) && (await page.$$(tid("btn-restart"))).length === 1, "one Restart, in the seek row");

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
  await page.context().close();
});
done();
