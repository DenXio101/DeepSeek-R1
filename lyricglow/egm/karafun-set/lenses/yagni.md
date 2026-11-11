# Lens: YAGNI / Contrarian (zoom_out persona, BRAINSTORM)

1. **Major** — Tempo is already done (`el.playbackRate` pitch-preserves; lyrics follow the engine clock). → Scope item 1 to **key only**; the only tempo work is a Key row beside the Speed row.
2. **Blocker (as framed)** — Key change is the one large item; a hand-written worklet vocoder is the most expensive route. → Try the cheap route first: `preservesPitch = false` + `playbackRate = 2^(k/12)` (couples tempo). If independent key/tempo is required, take SoundTouchJS (LGPL, check licence) rather than hand-writing DSP. Decide first; items 2–3 don't depend on it.
3. **Major** — Key + tempo coupling must not leak into the engine clock. → Engine rate = the tempo the user sees; pitch shifting lives in an audio node after the element.
4. **Major** — Vocals on/off is almost free: one boolean, pass `on ? level : 0` into the existing `useVocalLevel`; keep the slider as the "on" level; two states; mono files disable the button and keep the note.
5. **Major** — A sixth thumb target breaks the verified 320 px fit. → Put Vocals in the seek row / above the row, or swap Restart for Vocals (Restart is reachable via keyboard and Song panel).
6. **Major** — The queue is the hidden cost: list of {track, File}, create the object URL only for the current item, revoke on advance, reuse `handleFileUpload`/`loadTrack`; "Next song" on GradeScreen; reset key/tempo per song; no reorder, no persistence.
7. **Major** — Intro card duplicates CountIn + SectionCard. → Reuse SectionCard styling + CSS fade; ~3 s setTimeout counter then `engine.play()`; file sources only; don't double up with a first-line count-in; skippable on tap.
8. **Nit (cut)** — Defer U9 (auto-match queued file names) and U7 (transpose demo/guide): disable key while demo/guide active.

Suggested order: Vocals toggle → Intro card → minimal queue → key change behind a spike (native trick vs SoundTouchJS).
