# Browser flows

Headless Playwright flows that drive the real app against the Vite dev server.
No outbound network is needed: LRCLIB, the YouTube Data API, the YouTube IFrame
API and `/api/recognize` are mocked in `lib.mjs`; audio fixtures are generated
into `node_modules/.tmp/flows/` by `fixtures.mjs`.

```bash
npm run flows             # starts vite on :5173, runs every verify-*.mjs, stops it
npm run flows -- vocals   # only flows whose name contains "vocals"
node scripts/flows/verify-layout.mjs   # one flow; starts a server if none answers
```

The dev server is started with `VITE_YT_API_KEY=testkey-ABC123` so the YouTube
search UI is enabled (the key never leaves the mocked routes). Chromium runs
with `--autoplay-policy=no-user-gesture-required`; `verify-mic` adds a fake
microphone fed from `mic220.wav`.

`BASELINE.md` records the numbers the flows print at the commit that introduced
them (lights energy, target sizes). A later change that moves a number needs a
sentence in its commit message.
