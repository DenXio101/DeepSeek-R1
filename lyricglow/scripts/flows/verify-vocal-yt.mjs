// YouTube backing track (mocked IFrame API): loads and plays; the Vocals switch swaps between the
// official video and a karaoke upload at the same place in the song, searching only once;
// a song with no karaoke upload says so; official-only search results.
import { ensureServer, exists, makeChecker, openApp, sleep, text, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-vocal-yt");
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  let karaokeSearches = 0;
  page.on("request", (r) => {
    if (/youtube\/v3\/search/.test(r.url()) && /karaoke/.test(decodeURIComponent(r.url()))) karaokeSearches++;
  });
  const onStage = (id) => page.waitForFunction((v) => document.querySelector("[data-testid=youtube-stage]")?.getAttribute("data-video-id") === v, id, { timeout: 8000 });
  const videoId = () => page.getAttribute(tid("youtube-stage"), "data-video-id");
  const state = () => page.$eval(tid("vocals-state"), (el) => el.getAttribute("data-value"));
  const useLyrics = async (title) => {
    await page.click(tid("btn-find-song"));
    await page.fill(tid("song-search-input"), title);
    await page.waitForSelector(tid("song-use-0"));
    await sleep(700); // the debounced search re-sorts the list
    const idx = await page.$$eval(`${tid("song-results")} .song-hit`, (els, t) => els.findIndex((e) => (e.textContent || "").includes(t)), title);
    await page.click(tid(`song-use-${idx}`));
  };

  await useLyrics("Lantern Song");
  await page.fill(tid("youtube-url-input"), "https://www.youtube.com/watch?v=abc123XYZ00");
  await page.click(tid("youtube-load"));
  await onStage("abc123XYZ00");
  await sleep(600);
  ok(true, "YouTube stage mounted from a URL");
  ok((await state()) === "full" && (await text(page, "vocals-state")) === "Vocals", "switch shows Vocals for the official video");
  await page.click(tid("btn-play"));
  await sleep(2500);
  ok((await text(page, "time-current")) !== "0:00", "clock follows the (fake) player");
  await page.click(tid("btn-more"));
  ok(!(await exists(page, "vocal-control")), "no Voice slider for YouTube");
  await page.click(tid("more-close"));

  // swap to the karaoke upload
  await page.click(tid("vocals-toggle"));
  await onStage("karaokeVd003");
  ok(true, "tap → the karaoke upload is on stage (piano cover skipped)");
  await sleep(900);
  ok((await state()) === "off" && (await text(page, "vocals-state")) === "Minus one", "switch shows Minus one");
  ok(await exists(page, "btn-pause"), "keeps playing after the swap");
  const label = await text(page, "time-current");
  ok(label !== "0:00" && label !== "0:01", `position carried over (${label})`);
  ok((await text(page, "track-title")) === "Lantern Song", "lyrics stay loaded");
  ok(karaokeSearches === 1, `one karaoke search (${karaokeSearches})`);
  await page.click(tid("btn-find-song"));
  ok((await text(page, "song-source-kind")) === "Karaoke version", "song sheet labels the karaoke version");
  await page.click(tid("song-panel-close"));

  // and back, without searching again
  await page.click(tid("vocals-toggle"));
  await onStage("abc123XYZ00");
  await sleep(400);
  ok((await state()) === "full", "tap → back to the original");
  await page.click(tid("vocals-toggle"));
  await onStage("karaokeVd003");
  ok(karaokeSearches === 1, `no second search when swapping again (${karaokeSearches})`);

  // a song with no karaoke upload
  await useLyrics("Second Song");
  await page.fill(tid("youtube-url-input"), "https://www.youtube.com/watch?v=noKaraoke05");
  await page.click(tid("youtube-load"));
  await onStage("noKaraoke05").catch(async () => console.log(`  [debug] stage ${await videoId()} · error ${(await exists(page, "youtube-error")) ? await text(page, "youtube-error") : "none"} · panel ${await exists(page, "song-panel")}`));
  await sleep(500);
  await page.click(tid("vocals-toggle"));
  await page.waitForSelector(tid("import-error"), { timeout: 8000 }).catch(async () => console.log(`  [debug] state ${await state()} · stage ${await videoId()} · notice ${(await exists(page, "import-notice")) ? await text(page, "import-notice") : "none"} · title ${await text(page, "track-title")} · searches ${karaokeSearches}`));
  ok(/No karaoke version/.test(await text(page, "import-error")), "no karaoke upload → a clear notice");
  ok((await videoId()) === "noKaraoke05" && (await state()) === "full", "the original keeps playing");

  await page.click(tid("btn-find-song"));
  await page.fill(tid("youtube-search-input"), "Lantern Song Test Artist");
  await page.click(tid("youtube-search-go"));
  await page.waitForSelector(tid("youtube-results"));
  await sleep(400);
  const titles = await page.$$eval(`${tid("youtube-results")} button`, (els) => els.map((e) => e.textContent || ""));
  ok(titles.length >= 2 && !titles.some((t) => /karaoke/i.test(t)), `official uploads listed, karaoke hidden (${titles.length})`);
  await page.context().close();
});
done();
