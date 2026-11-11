// Phase 2a go/no-go spike for the key change: pitch accuracy (cents), shifter delay (ms) and
// dropouts of the SoundTouch worklet at 0.5×, 1× and 2×. Prints a markdown table.
// Run: node scripts/spike/key-spike.mjs   (starts the dev server if none answers)
import { readFileSync } from "node:fs";
import { BASE, ensureServer, fixtures, launch, loadPlaywright } from "../flows/lib.mjs";

const fx = fixtures();
await ensureServer();
const pw = await loadPlaywright();
const browser = await launch(pw, {});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && console.log(`[console] ${m.text()}`));
await page.route(/\/spike-fixtures\/(a440|click)\.wav$/, (route) => {
  const name = route.request().url().match(/(a440|click)\.wav$/)[1];
  route.fulfill({ contentType: "audio/wav", body: readFileSync(fx[name]) });
});
await page.goto(`${BASE}/scripts/spike/key-spike.html`);
await page.waitForFunction(() => window.spikeReady, null, { timeout: 20000 });
const urls = { a440: `${BASE}/spike-fixtures/a440.wav`, click: `${BASE}/spike-fixtures/click.wav` };
if (process.argv.includes("--latency")) {
  const rows = await page.evaluate((u) => window.spike.latency(u), urls);
  await browser.close();
  console.log("| rate | semis | delay (ms) | spread over 3 bursts (ms) |\n|---|---|---|---|");
  for (const l of rows) console.log(`| ${l.rate}× | ${l.semis} | ${l.ms} | ${l.spreadMs} |`);
  process.exit(0);
}
const r = await page.evaluate((u) => window.spike.run(u), urls);
await browser.close();

console.log(`processor: ${r.processorUrl}\n`);
console.log("| path | rate | semis | expected Hz | measured Hz | error (cents) |\n|---|---|---|---|---|---|");
for (const p of r.pitchOffline) console.log(`| offline buffer | ${p.rate}× | ${p.semis} | ${p.expect} | ${p.hz} | ${p.cents} |`);
for (const p of r.pitchLive) console.log(`| live <audio> | ${p.rate}× | ${p.semis} | ${p.expect} | ${p.hz} | ${p.cents} |`);
console.log("\n| rate | semis | delay (ms) | spread over 3 clicks (ms) |\n|---|---|---|---|");
for (const l of r.latency) console.log(`| ${l.rate}× | ${l.semis} | ${l.ms} | ${l.spreadMs} |`);
console.log(`\nlive silent frames: ${r.pitchLive.map((p) => `${p.rate}×/${p.semis}: ${p.silentFrames}/${p.frames} at ${p.silentAt.join("/")} ms`).join("; ")}`);
console.log(`soak silent at (first): ${r.soak.silentAt.join(", ")} ms; context base latency ${r.soak.baseLatency}`);
console.log(`start-up: dry play() resolved ${r.startDry.playResolvedMs} ms, first sound ${r.startDry.firstSoundMs} ms; through shifter play() resolved ${r.startWet.playResolvedMs} ms, first sound ${r.startWet.firstSoundMs} ms`);
console.log(`10 s soak at key −2: ${r.soak.silentFrames}/${r.soak.frames} silent frames, played ${r.soak.played} s, pitch error ${r.soak.cents} cents`);

const worstPitch = Math.max(...[...r.pitchOffline, ...r.pitchLive].map((p) => Math.abs(p.cents)));
const delays = r.latency.filter((l) => l.semis === -2).map((l) => l.ms);
const spread = Math.max(...delays) - Math.min(...delays);
// silence inside the first second is start-up (media + pipeline fill), not a dropout
const lateSilent = r.pitchLive.reduce((a, p) => a + p.silentAt.filter((t) => t > 1000).length, 0) + r.soak.silentAt.filter((t) => t > 1000).length;
const pass = worstPitch <= 15 && lateSilent === 0;
console.log(`\nworst pitch error ${worstPitch} cents (limit 15); delay spread across rates ${spread.toFixed(1)} ms (per-rate table if > 10); silent frames after 1 s: ${lateSilent} (limit 0)`);
console.log(pass ? "SPIKE: GO" : "SPIKE: NO-GO");
process.exit(pass ? 0 : 1);
