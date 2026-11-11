// Thumb bar: five targets ≥ 44 px at 320 px, no horizontal overflow, landscape still ≥ 44 px.
import { ensureServer, makeChecker, openApp, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-layout");
await ensureServer();
await withBrowser({}, async (browser) => {
  for (const width of [320, 390]) {
    const page = await openApp(browser, { viewport: { width, height: 700 } });
    const items = await page.$$eval(`${tid("thumb-row")} > *`, (els) =>
      els.map((e) => {
        const r = (e.querySelector("button") || e).getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    ok(items.length === 5, `${width}px: five thumb targets (${items.length})`);
    ok(items.every((i) => i.w >= 44 && i.h >= 44), `${width}px: every target ≥ 44 px (${items.map((i) => `${i.w}×${i.h}`).join(", ")})`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `${width}px: no horizontal overflow (${overflow})`);
    const seek = await page.$eval(tid("seek-bar"), (e) => e.getBoundingClientRect().height);
    ok(seek >= 22, `${width}px: seek bar hit area ≥ 22 px (${Math.round(seek)})`);
    const restart = await page.$eval(tid("btn-restart"), (e) => e.getBoundingClientRect());
    ok(restart.width >= 44 && restart.height >= 44, `${width}px: restart ≥ 44 px (${Math.round(restart.width)}×${Math.round(restart.height)})`);
    await page.context().close();
  }
  const page = await openApp(browser, { viewport: { width: 740, height: 360 } });
  const play = await page.$eval(tid("btn-play"), (e) => e.getBoundingClientRect());
  ok(play.width >= 44 && play.height >= 44, `landscape: play ≥ 44 px (${Math.round(play.width)})`);
  const bar = await page.$eval(tid("thumb-bar"), (e) => e.getBoundingClientRect().height);
  ok(bar <= 130, `landscape: thumb bar ≤ 130 px tall (${Math.round(bar)})`);
  await page.context().close();
});
done();
