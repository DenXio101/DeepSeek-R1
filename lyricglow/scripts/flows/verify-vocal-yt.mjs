// YouTube backing track (mocked IFrame API): loads, plays, no Voice slider; official-only search results.
import { ensureServer, exists, makeChecker, openApp, sleep, text, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-vocal-yt");
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  await page.click(tid("btn-find-song"));
  await page.fill(tid("youtube-url-input"), "https://www.youtube.com/watch?v=abc123XYZ00");
  await page.click(tid("youtube-load"));
  try {
    await page.waitForSelector(tid("youtube-stage"), { state: "attached", timeout: 8000 });
  } catch {
    console.log(`  [debug] youtube-error: ${(await page.$(tid("youtube-error"))) ? await text(page, "youtube-error") : "none"}; panel open: ${await exists(page, "song-panel")}`);
  }
  await sleep(600);
  ok(await exists(page, "youtube-stage"), "YouTube stage mounted from a URL");
  await page.click(tid("btn-play"));
  await sleep(1500);
  ok((await text(page, "time-current")) !== "0:00", "clock follows the (fake) player");
  await page.click(tid("btn-more"));
  ok(!(await exists(page, "vocal-control")), "no Voice slider for YouTube");
  ok(await exists(page, "tempo-slider"), "Speed slider still available");
  await page.click(tid("more-close"));

  await page.click(tid("btn-find-song"));
  await page.fill(tid("youtube-search-input"), "Lantern Song Test Artist");
  await page.click(tid("youtube-search-go"));
  await page.waitForSelector(tid("youtube-results"));
  await sleep(400);
  const titles = await page.$$eval(`${tid("youtube-results")} button, ${tid("youtube-results")} [role=button]`, (els) => els.map((e) => e.textContent || ""));
  ok(titles.length >= 2, `official uploads listed (${titles.length})`);
  ok(!titles.some((t) => /karaoke/i.test(t)), "karaoke upload hidden from the official list");
  await page.context().close();
});
done();
