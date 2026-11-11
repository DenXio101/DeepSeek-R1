# Flow baseline

Recorded at Step 0 of the KaraFun-set build (branch `claude/lyricglow-karaoke-app-ugIUj`,
after commit `030f5cd`), headless Chromium 1243 via Playwright 1.63.0.

| Flow | Quantity | Value |
|---|---|---|
| verify-layout | thumb targets at 320 px | 50×50, 50×50, 66×66, 84×50, 50×50 (five) |
| verify-layout | horizontal overflow at 320 / 390 px | 0 |
| verify-layout | seek bar hit area | 28 px |
| verify-layout | landscape (740×360) play button / thumb bar height | 54 px / 85 px |
| verify-file | `--energy` on `beat.wav` after 2.2 s of playback | 0.337 |
| verify-file | audio time after 2.2 s | 2.22 s |
| verify-file | Voice slider default | 35 % |
| verify-mic | mic switch size | 84×50 |
| verify-guide | guide cue default / speed default | 25 % / 1.00× |
| verify-vocal-yt | official uploads shown of three mocked hits | 2 (karaoke upload hidden) |

Rule: a later phase that moves one of these numbers says so in its commit message.
