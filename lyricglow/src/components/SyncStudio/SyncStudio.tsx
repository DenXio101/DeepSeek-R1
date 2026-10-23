import { useEffect, useMemo, useRef, type Dispatch } from "react";
import type { PlaybackEngine, PlaybackSnapshot } from "../../engine/PlaybackEngine";
import { useFrame } from "../../engine/useFrame";
import { useHotkeys } from "../../hooks/useHotkeys";
import { VOICES, type Track, type Voice } from "../../lyrics";
import { downloadTextFile, exportLrc, safeFileStem, trackToJson } from "../../model/trackIO";
import { IconDownload, IconPause, IconPlay, IconRestart } from "../Icons";
import ProgressRow from "../ProgressRow";
import { buildTrack } from "./buildTrack";
import { SAMPLE_TEXT, sylCount, type StudioAction, type StudioState } from "./studioReducer";

interface Props {
  engine: PlaybackEngine;
  playback: PlaybackSnapshot;
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  onPreview: (track: Track | null) => void;
  onApply: (track: Track) => void;
  onClose: () => void;
}

function fmtCs(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

const VOICE_LABEL: Record<Voice, string> = { male: "Male", female: "Female", duet: "Duet" };

export default function SyncStudio({ engine, playback, state, dispatch, onPreview, onApply, onClose }: Props) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const tapBtnRef = useRef<HTMLButtonElement>(null);
  const now = () => engine.frame.time;

  // live preview on the stage
  const built = useMemo(() => buildTrack(state), [state]);
  useEffect(() => {
    onPreview(built.track);
  }, [built, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  useFrame(engine, "render", (f) => {
    if (timeRef.current) timeRef.current.textContent = fmtCs(f.time);
  });

  const tapping = state.phase === "tapping";
  const tap = () => dispatch({ type: "tap", t: now() });
  const endLine = () => dispatch({ type: "endLine", t: now() });
  const undo = () => dispatch({ type: "undo" });
  const finish = () => dispatch({ type: "finish", t: now() });

  useHotkeys(
    {
      Space: tap,
      Enter: endLine,
      Backspace: undo,
      Escape: () => engine.toggle(),
      ",": () => dispatch({ type: "setLatency", value: state.tapLatency - 0.01 }),
      ".": () => dispatch({ type: "setLatency", value: state.tapLatency + 0.01 }),
    },
    tapping,
  );

  // keep focus off buttons while tapping so Space doesn't re-click them
  useEffect(() => {
    if (tapping && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [tapping]);

  const cur = state.cursor;
  const curLine = state.lines[cur.line];
  const nextLine = state.lines[cur.line + 1];
  const stem = safeFileStem(state.title);

  return (
    <section className="studio-panel" data-testid="sync-studio" aria-label="Sync Studio">
      <div className="studio-head">
        <h2 className="studio-title">Sync Studio</h2>
        <span className="studio-phase" data-testid="studio-phase">
          {state.phase === "edit" ? "1 · Lyrics" : state.phase === "tapping" ? "2 · Tap along" : "3 · Review"}
        </span>
        <span className="studio-time" ref={timeRef} data-testid="studio-time">
          0:00.00
        </span>
        <div className="studio-transport">
          <button type="button" className="transport-btn" onClick={() => engine.restart()} aria-label="Restart" data-testid="studio-restart">
            <IconRestart />
          </button>
          <button
            type="button"
            className="transport-btn transport-btn--primary"
            onClick={() => engine.toggle()}
            aria-label={playback.playing ? "Pause" : "Play"}
            data-testid="studio-playpause"
          >
            {playback.playing ? <IconPause /> : <IconPlay />}
          </button>
        </div>
        <button type="button" className="dock-btn" onClick={onClose} aria-label="Close Sync Studio" data-testid="studio-close">
          Close
        </button>
      </div>

      <ProgressRow engine={engine} duration={playback.duration} />

      {state.phase === "edit" && (
        <div className="studio-body studio-edit">
          <div className="studio-meta">
            <label>
              Title
              <input value={state.title} onChange={(e) => dispatch({ type: "setMeta", title: e.target.value })} data-testid="studio-title" />
            </label>
            <label>
              Artist
              <input value={state.artist} onChange={(e) => dispatch({ type: "setMeta", artist: e.target.value })} data-testid="studio-artist" />
            </label>
            <label>
              BPM
              <input
                type="number"
                min={30}
                max={300}
                value={state.bpm}
                onChange={(e) => dispatch({ type: "setMeta", bpm: Number(e.target.value) })}
                data-testid="studio-bpm"
              />
            </label>
          </div>
          <textarea
            className="studio-textarea"
            value={state.rawText}
            onChange={(e) => dispatch({ type: "setText", text: e.target.value })}
            placeholder={"Paste lyrics, one line each.\nPrefix lines with M: / F: / D: for voice, add [Chorus] markers, split tricky words with | (e.g. ci|ty)."}
            rows={6}
            aria-label="Lyrics text"
            data-testid="studio-textarea"
          />
          <div className="studio-row">
            <button type="button" className="dock-btn" onClick={() => dispatch({ type: "setText", text: SAMPLE_TEXT })} data-testid="studio-sample">
              Sample
            </button>
            <button type="button" className="dock-btn" onClick={() => dispatch({ type: "parse" })} disabled={!state.rawText.trim()} data-testid="studio-parse">
              Parse lyrics
            </button>
            <button
              type="button"
              className="transport-btn transport-btn--primary"
              onClick={() => {
                dispatch({ type: "start" });
                engine.seek(0);
              }}
              disabled={!state.lines.length || state.parsedFrom !== state.rawText}
              data-testid="studio-start"
            >
              Start tapping
            </button>
          </div>
          {state.lines.length > 0 && (
            <ol className="studio-lines" data-testid="studio-lines">
              {state.lines.map((l, i) => (
                <li key={l.id} className="studio-line-row">
                  <select
                    value={l.voice}
                    onChange={(e) => dispatch({ type: "setLineVoice", line: i, voice: e.target.value as Voice })}
                    aria-label={`Voice for line ${i + 1}`}
                    data-testid={`studio-line-voice-${i}`}
                    className={`voice-select voice-select--${l.voice}`}
                  >
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {VOICE_LABEL[v]}
                      </option>
                    ))}
                  </select>
                  <span className="studio-line-section">{l.section}</span>
                  <span className="studio-line-text">{l.syllables.map((w) => w.join("·")).join(" ")}</span>
                  <span className="studio-line-count">{sylCount(l)} syl</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {state.phase === "tapping" && (
        <div className="studio-body studio-tapping">
          <p className="studio-hint">
            Press <kbd>Space</kbd> on every syllable as you hear it · <kbd>Enter</kbd> ends the line · <kbd>Backspace</kbd> undoes · <kbd>Esc</kbd> play/pause ·{" "}
            <kbd>,</kbd>/<kbd>.</kbd> latency
          </p>
          <div className="studio-current" data-testid="studio-current-line">
            {curLine ? (
              <>
                <span className={`studio-voice-tag voice-${curLine.voice}`}>{VOICE_LABEL[curLine.voice]}</span>
                <div className="studio-current-words">
                  {(() => {
                    let flat = 0;
                    return curLine.syllables.map((w, wi) => (
                      <span key={wi} className="studio-word">
                        {w.map((s, si) => {
                          const idx = flat++;
                          const done = idx < cur.syl;
                          const isCur = idx === cur.syl;
                          return (
                            <span key={si} className={`studio-syl ${done ? "studio-syl--done" : ""} ${isCur ? "studio-syl--cursor" : ""}`}>
                              {s}
                            </span>
                          );
                        })}
                      </span>
                    ));
                  })()}
                </div>
              </>
            ) : (
              <span className="studio-done">All lines tapped — press Finish.</span>
            )}
          </div>
          {nextLine && <div className="studio-next">{nextLine.text}</div>}
          <div className="studio-row studio-tap-row">
            <button type="button" className="dock-btn" onClick={undo} disabled={!state.stamps.length} data-testid="studio-undo">
              Undo
            </button>
            <button ref={tapBtnRef} type="button" className="studio-tap-btn" onPointerDown={(e) => { e.preventDefault(); tap(); }} data-testid="studio-tap">
              TAP
            </button>
            <button type="button" className="dock-btn" onClick={endLine} data-testid="studio-end-line">
              End line
            </button>
          </div>
          <div className="studio-row studio-small">
            <span data-testid="studio-progress">
              Line {Math.min(cur.line + 1, state.lines.length)} / {state.lines.length} · {state.stamps.filter((s) => !s.auto).length} taps
            </span>
            <span>
              latency {Math.round(state.tapLatency * 1000)} ms{" "}
              <button type="button" className="mini-btn" onClick={() => dispatch({ type: "setLatency", value: state.tapLatency - 0.01 })} aria-label="Decrease tap latency">
                −
              </button>
              <button type="button" className="mini-btn" onClick={() => dispatch({ type: "setLatency", value: state.tapLatency + 0.01 })} aria-label="Increase tap latency">
                +
              </button>
            </span>
            <button type="button" className="dock-btn" onClick={() => dispatch({ type: "backToEdit" })} data-testid="studio-back">
              Back
            </button>
            <button type="button" className="transport-btn transport-btn--primary" onClick={finish} disabled={!state.stamps.length} data-testid="studio-finish">
              Finish
            </button>
          </div>
        </div>
      )}

      {state.phase === "review" && (
        <div className="studio-body studio-review">
          <p className="studio-summary" data-testid="studio-summary">
            {built.timedLines} of {state.lines.length} lines timed. Play it back on the stage; nudge if the words run early or late.
          </p>
          <div className="studio-row">
            <span>Nudge {Math.round(state.nudge * 1000)} ms</span>
            {[-50, -10, 10, 50].map((d) => (
              <button
                key={d}
                type="button"
                className="mini-btn"
                onClick={() => dispatch({ type: "nudge", delta: d / 1000 })}
                data-testid={d < 0 ? `studio-nudge-minus${-d}` : `studio-nudge-plus${d}`}
                aria-label={`Nudge ${d} milliseconds`}
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
            <label className="studio-retap">
              Re-tap from
              <select
                onChange={(e) => {
                  const li = Number(e.target.value);
                  if (li >= 0) {
                    dispatch({ type: "retapFrom", line: li });
                    const first = state.stamps.find((s) => s.line === li);
                    engine.seek(Math.max(0, (first?.t ?? 0) - 2));
                  }
                  e.target.value = "-1";
                }}
                defaultValue="-1"
                aria-label="Re-tap from line"
                data-testid="studio-retap"
              >
                <option value="-1">line…</option>
                {state.lines.map((l, i) => (
                  <option key={l.id} value={i}>
                    {i + 1}. {l.text.slice(0, 28)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="studio-row">
            <button type="button" className="dock-btn" onClick={() => dispatch({ type: "backToEdit" })} data-testid="studio-review-back">
              Back to lyrics
            </button>
            <button
              type="button"
              className="dock-btn"
              disabled={!built.track}
              onClick={() => built.track && downloadTextFile(`${stem}.lyricglow.json`, trackToJson(built.track), "application/json")}
              data-testid="studio-download-json"
            >
              <IconDownload /> JSON
            </button>
            <button
              type="button"
              className="dock-btn"
              disabled={!built.track}
              onClick={() => built.track && downloadTextFile(`${stem}.lrc`, exportLrc(built.track), "text/plain")}
              data-testid="studio-download-lrc"
            >
              <IconDownload /> LRC
            </button>
            <button
              type="button"
              className="transport-btn transport-btn--primary"
              disabled={!built.track}
              onClick={() => built.track && onApply(built.track)}
              data-testid="studio-apply"
            >
              Use in player
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
