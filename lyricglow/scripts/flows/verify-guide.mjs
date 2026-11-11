// Guide cue and Speed controls under More: defaults and edits.
import { ensureServer, makeChecker, openApp, setRange, sleep, text, tid, withBrowser } from "./lib.mjs";

const { ok, done } = makeChecker("verify-guide");
await ensureServer();
await withBrowser({}, async (browser) => {
  const page = await openApp(browser);
  await page.click(tid("btn-more"));
  ok((await page.$eval(tid("guide-level"), (el) => el.value)) === "25", "guide cue defaults to 25 %");
  await setRange(page, tid("guide-level"), 0);
  await sleep(100);
  ok((await page.$eval(tid("guide-level"), (el) => el.value)) === "0", "guide cue can be set to 0");
  ok((await text(page, "tempo-value")).includes("1.00"), `speed shows 1.00× (${await text(page, "tempo-value")})`);
  await setRange(page, tid("tempo-slider"), 1.5);
  await sleep(100);
  ok((await text(page, "tempo-value")).includes("1.50"), `speed slider sets 1.50× (${await text(page, "tempo-value")})`);
  await page.click(tid("tempo-reset"));
  await sleep(100);
  ok((await text(page, "tempo-value")).includes("1.00"), "speed reset returns to 1.00×");
  await page.context().close();
});
done();
