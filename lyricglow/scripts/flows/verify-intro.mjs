// Intro card: shown only when a set starts; three-beat countdown then the music starts by itself;
// the first line's own count-in is replaced; Skip and Play start at once; single files get no card.
import { ensureServer, exists, fixtures, makeChecker, mediaTime, openApp, sleep, text, tid, uploadFile, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-intro");
const fx = fixtures();
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  const paused = () => page.$eval(tid("audio-element"), (el) => el.paused);

  // build a one-song set whose lyrics start after a gap (line 0 has a count-in)
  await page.click(tid("btn-find-song"));
  await page.setInputFiles(tid("set-file-input"), fx.beat);
  ok(await exists(page, "set-pending"), "file picked for the set waits for its lyrics");
  await page.fill(tid("song-search-input"), "Late Start");
  await page.waitForSelector(tid("song-use-0"));
  const idx = await page.$$eval(`${tid("song-results")} .song-hit`, (els) => els.findIndex((e) => /Late Start/.test(e.textContent || "")));
  await page.click(tid(`song-use-${idx}`));
  await sleep(200);
  ok(!(await exists(page, "set-pending")) && (await exists(page, "set-item-0")), "Use adds the entry to the set");
  ok((await text(page, "set-item-0")).includes("Late Start"), `entry shows its title (${await text(page, "set-item-0")})`);
  await page.click(tid("set-start"));
  await page.waitForSelector(tid("intro-card"));
  ok(!(await exists(page, "song-panel")), "Start set closes the sheet");
  ok((await text(page, "intro-position")) === "Song 1 of 1", `card reads ${await text(page, "intro-position")}`);
  ok(await paused(), "music waits during the countdown");
  const lyricCountIn = () => page.$(`${tid("cue-slot")} > ${tid("count-in")}`).then((h) => !!h);
  ok(!(await lyricCountIn()), "no lyric count-in while the card is up (the card's own dots aside)");
  await page.waitForSelector(tid("intro-card"), { state: "detached", timeout: 6000 });
  await sleep(250);
  ok(!(await paused()), "music starts by itself when the countdown ends");
  const t0 = await mediaTime(page);
  ok(t0 < 1, `starts from the top (${t0.toFixed(2)} s)`);
  await sleep(900); // 0.6–2.4 s is where line 0's count-in would show
  ok(!(await lyricCountIn()), "first line's own count-in is replaced by the intro countdown");

  // Restart plays again without the card and with the normal count-in
  await page.click(tid("btn-restart"));
  await sleep(1200);
  ok(!(await exists(page, "intro-card")), "Restart shows no card");
  ok(await lyricCountIn(), "the normal count-in is back after a restart");

  // Skip
  await page.click(tid("btn-find-song"));
  await page.click(tid("set-start"));
  await page.waitForSelector(tid("intro-card"));
  await page.click(tid("intro-skip"));
  await sleep(300);
  ok(!(await exists(page, "intro-card")) && !(await paused()), "Skip starts the music at once");

  // Play during the card
  await page.click(tid("btn-find-song"));
  await page.click(tid("set-start"));
  await page.waitForSelector(tid("intro-card"));
  await page.click(tid("btn-play"));
  await sleep(300);
  ok(!(await exists(page, "intro-card")) && !(await paused()), "Play dismisses the card and plays");

  // a single file never gets a card
  await uploadFile(page, fx.stereo);
  await page.click(tid("btn-play"));
  await sleep(400);
  ok(!(await exists(page, "intro-card")), "single file: no intro card");
  ok(!(await paused()), "single file plays at once");
  await page.click(tid("btn-find-song"));
  ok(!(await exists(page, "set-position")), "loading a single file leaves the set");
  await page.context().close();
});
done();
