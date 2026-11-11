// Lyrics display: KaraFun style by default with an active line; Classic style switches the stage class.
import { ensureServer, exists, makeChecker, openApp, sleep, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-karafun");
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  await page.click(tid("btn-play"));
  await sleep(2500);
  const cls = await page.$eval(tid("karaoke-stage"), (e) => e.className);
  ok(cls.includes("karaoke-stage--karafun"), `KaraFun style is the default (${cls})`);
  ok(await exists(page, "lyric-line-active"), "an active line is on stage while the demo plays");
  ok(await exists(page, "btn-pause"), "play button became pause");
  await page.click(tid("btn-more"));
  await page.click(tid("lyrics-style-classic"));
  await sleep(300);
  const cls2 = await page.$eval(tid("karaoke-stage"), (e) => e.className);
  ok(!cls2.includes("karaoke-stage--karafun"), `Classic style removes the KaraFun class (${cls2})`);
  ok(await exists(page, "lyric-line-active"), "active line still shown in Classic");
  await page.click(tid("lyrics-style-karafun"));
  await page.click(tid("more-close"));
  await sleep(200);
  ok(!(await exists(page, "more-sheet")), "More sheet closes");
  await page.context().close();
});
done();
