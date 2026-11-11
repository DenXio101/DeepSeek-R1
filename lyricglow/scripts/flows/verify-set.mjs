// A three-song set: add with lyrics / without, remove, the cap, intro cards between songs,
// Next on the result screen with focus, key carried over and speed reset, End set at the end,
// one media element and one object URL revoked per advance.
import { energy, ensureServer, exists, fixtures, makeChecker, openApp, setRange, sleep, text, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-set");
const fx = fixtures();
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  await page.evaluate(() => {
    const orig = URL.revokeObjectURL.bind(URL);
    window.__revoked = 0;
    URL.revokeObjectURL = (u) => {
      window.__revoked++;
      return orig(u);
    };
  });
  const revoked = () => page.evaluate(() => window.__revoked);
  const paused = () => page.$eval(tid("audio-element"), (el) => el.paused);
  const finish = async () => {
    await page.$eval(tid("audio-element"), (el) => {
      el.currentTime = Math.max(0, el.duration - 0.05);
    });
    await page.waitForSelector(tid("grade-screen"), { timeout: 8000 });
  };
  const addWithLyrics = async (file, title) => {
    await page.setInputFiles(tid("set-file-input"), file);
    await page.fill(tid("song-search-input"), title);
    await page.waitForSelector(tid("song-use-0"));
    const idx = await page.$$eval(`${tid("song-results")} .song-hit`, (els, t) => els.findIndex((e) => (e.textContent || "").includes(t)), title);
    await page.click(tid(`song-use-${idx}`));
    await sleep(150);
  };

  await page.click(tid("btn-find-song"));
  await addWithLyrics(fx.beat, "Lantern Song");
  await addWithLyrics(fx.stereo, "Second Song");
  await addWithLyrics(fx.mono, "Third Song");
  ok((await page.$$(`${tid("set-list")} li`)).length === 3, "three songs in the set");
  ok(!(await exists(page, "set-position")), "no position before the set starts");
  await page.click(tid("set-remove-1"));
  ok((await page.$$(`${tid("set-list")} li`)).length === 2 && (await text(page, "set-item-1")).includes("Third"), "remove drops the middle song");
  await addWithLyrics(fx.stereo, "Second Song");
  for (let i = 0; i < 5; i++) {
    await page.setInputFiles(tid("set-file-input"), fx.beat);
    await page.click(tid("set-add-plain"));
  }
  ok((await page.$$(`${tid("set-list")} li`)).length === 8 && (await exists(page, "set-full")), "eight songs → set full");
  ok(await page.$eval(tid("set-file-input"), (el) => el.disabled), "Add song disabled at the cap");
  ok((await text(page, "set-item-7")).includes("no lyrics yet"), "entries without lyrics say so");
  for (let i = 7; i >= 3; i--) await page.click(tid(`set-remove-${i}`));
  ok((await page.$$(`${tid("set-list")} li`)).length === 3, "back to three");
  const order = await page.$$eval(`${tid("set-list")} .song-hit-title`, (els) => els.map((e) => e.textContent));
  ok(order.join("|") === "Lantern Song|Third Song|Second Song", `order kept (${order.join(", ")})`);

  // song 1
  await page.click(tid("set-start"));
  await page.waitForSelector(tid("intro-card"));
  ok((await text(page, "intro-position")) === "Song 1 of 3", "intro 1");
  ok(!(await exists(page, "intro-key")), "no key badge at key 0");
  await page.waitForSelector(tid("intro-card"), { state: "detached", timeout: 6000 });
  await sleep(300);
  ok(!(await paused()), "song 1 plays");
  ok((await text(page, "track-title")) === "Lantern Song", `header shows the song (${await text(page, "track-title")})`);
  await page.click(tid("btn-more"));
  await page.click(tid("key-minus"));
  await page.click(tid("key-minus"));
  await setRange(page, tid("tempo-slider"), 1.5);
  await page.click(tid("more-close"));
  await sleep(1500);
  ok((await text(page, "key-pill")) === "Key −2", "key −2 during song 1");
  const revokedBefore = await revoked();
  await finish();
  ok((await text(page, "btn-next")) === "Next: Third Song", `result screen offers ${await text(page, "btn-next")}`);
  await sleep(100);
  ok((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "btn-next", "Next has focus");
  ok((await exists(page, "btn-sing-again")) && (await exists(page, "btn-end-set")) && !(await exists(page, "btn-close-grade")), "Sing again and End set follow, no Close");

  // song 2
  await page.click(tid("btn-next"));
  await page.waitForSelector(tid("intro-card"));
  ok((await text(page, "intro-position")) === "Song 2 of 3", "intro 2");
  ok((await text(page, "intro-key")) === "Key −2", "key carries over to the card");
  await page.waitForSelector(tid("intro-card"), { state: "detached", timeout: 6000 });
  await sleep(600);
  ok(!(await paused()), "song 2 plays without a tap");
  ok((await page.$$(tid("audio-element"))).length === 1, "still one audio element");
  ok((await revoked()) - revokedBefore === 1, `one object URL revoked on advance (${(await revoked()) - revokedBefore})`);
  await page.click(tid("btn-more"));
  ok((await text(page, "tempo-value")).includes("1.00"), "speed reset to 1.00× for the next song");
  ok((await text(page, "key-value")) === "−2", "key still −2");
  await page.click(tid("more-close"));
  await sleep(800);
  ok((await text(page, "key-pill")) === "Key −2", "shifter follows the new song");
  ok((await energy(page)) > 0.02, "lights follow song 2");
  await finish();
  ok((await text(page, "btn-next")) === "Next: Second Song", "offers the third song");

  // song 3 (mono file)
  await page.click(tid("btn-next"));
  await page.waitForSelector(tid("intro-card"));
  ok((await text(page, "intro-position")) === "Song 3 of 3", "intro 3");
  await page.waitForSelector(tid("intro-card"), { state: "detached", timeout: 6000 });
  await sleep(300);
  await finish();
  ok(!(await exists(page, "btn-next")), "last song: no Next");
  await sleep(100);
  ok((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "btn-sing-again", "Sing again has focus on the last song");
  await page.click(tid("btn-end-set"));
  await sleep(200);
  ok(!(await exists(page, "grade-screen")), "End set closes the result screen");
  await page.click(tid("btn-find-song"));
  ok((await text(page, "set-position")) === "Song 3 of 3", "the last song stays loaded");
  ok((await text(page, "set-start")) === "Restart set", "the set can be restarted");
  await page.context().close();
});
done();
