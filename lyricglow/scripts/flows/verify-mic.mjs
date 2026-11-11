// Microphone: fake 220 Hz input → switch turns on, pitch lane and score HUD appear, no mic error.
import { ensureServer, exists, fixtures, makeChecker, openApp, sleep, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-mic");
const fx = fixtures();
await ensureServer();
await withBrowser({ mic: fx.mic220 }, async (browser) => {
  const page = await openApp(browser, { mic: true });
  await page.click(tid("btn-play"));
  await page.click(tid("mic-toggle"));
  await page.waitForSelector(`${tid("mic-toggle")}[aria-checked=true]`, { timeout: 10000 });
  ok(true, "mic switch reports on");
  await sleep(3000);
  ok(await exists(page, "pitch-lane"), "pitch lane visible with the mic on");
  ok(await exists(page, "score-hud"), "score HUD visible with the mic on");
  ok(!(await exists(page, "mic-status")), "no mic error");
  const sw = await page.$eval(tid("mic-toggle"), (e) => e.getBoundingClientRect());
  ok(sw.width >= 44 && sw.height >= 44, `mic switch ≥ 44 px (${Math.round(sw.width)}×${Math.round(sw.height)})`);
  await page.click(tid("mic-toggle"));
  await page.waitForSelector(`${tid("mic-toggle")}[aria-checked=false]`);
  ok(!(await exists(page, "pitch-lane")), "pitch lane hidden when the mic is off");
  await page.context().close();
});
done();
