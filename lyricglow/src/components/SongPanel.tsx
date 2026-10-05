import { useEffect, useRef, useState } from "react";
import type { Track } from "../lyrics";
import { formatDuration, searchLyrics, type LyricsSearchHit } from "../model/lrclib";
import { parseYouTubeId, youtubeSearchUrl } from "../engine/youtube";
import { classifyUpload, kindLabel, officialQuery, rankHits, searchYouTube, youtubeApiKey, type YouTubeHit } from "../model/youtubeSearch";
import { fitsDuration, sortHitsForBacking, type VideoMeta } from "../model/songMatch";
import { IconUpload } from "./Icons";

/** an alternative official upload the app may hop to when the chosen one can't be embedded */
export interface YouTubeCandidate {
  videoId: string;
  meta: VideoMeta;
}

export type BackingSource =
  | { kind: "none" }
  | { kind: "file"; url: string; mediaKind: "audio" | "video"; name: string }
  | { kind: "youtube"; videoId: string };

interface Props {
  open: boolean;
  onClose: () => void;
  track: Track;
  source: BackingSource;
  onPickSynced: (hit: LyricsSearchHit) => void;
  onPickPlain: (hit: LyricsSearchHit) => void;
  onFile: (file: File) => void;
  onYouTube: (videoId: string, meta?: VideoMeta, alternates?: YouTubeCandidate[]) => void;
  onClearSource: () => void;
  onNudge: (deltaSeconds: number) => void;
  /** length of the loaded backing track in seconds (0 = unknown) */
  backingDuration: number;
  /** title/channel/length of the loaded YouTube video, when known */
  backingMeta?: VideoMeta | null;
  /** focus the lyrics box when opened (e.g. from the mismatch banner) */
  focusLyrics?: boolean;
}

/**
 * "Find a song": search synced lyrics (LRCLIB), choose a backing track
 * (local file or YouTube link) and fine-tune lyric timing.
 */
export default function SongPanel({ open, onClose, track, source, onPickSynced, onPickPlain, onFile, onYouTube, onClearSource, onNudge, backingDuration, backingMeta, focusLyrics }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LyricsSearchHit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ytInput, setYtInput] = useState("");
  const [ytError, setYtError] = useState<string | null>(null);
  const ytKey = youtubeApiKey();
  const [ytQuery, setYtQuery] = useState("");
  const [ytHits, setYtHits] = useState<YouTubeHit[]>([]);
  const [ytStatus, setYtStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [ytSearchError, setYtSearchError] = useState<string | null>(null);
  const [ytShowAll, setYtShowAll] = useState(false);
  const ytAbort = useRef<AbortController | null>(null);
  const lastAutoRef = useRef("");

  const runYouTubeSearch = (q: string) => {
    if (!ytKey || !q.trim()) return;
    ytAbort.current?.abort();
    const ctl = new AbortController();
    ytAbort.current = ctl;
    setYtStatus("loading");
    setYtSearchError(null);
    setYtShowAll(false);
    const artist = track.artist !== "Unknown artist" ? track.artist : "";
    searchYouTube(q, ytKey, ctl.signal, 12, artist)
      .then((h) => {
        if (ctl.signal.aborted) return;
        setYtHits(rankHits(h, { title: track.title, artist, lyricsDuration: track.duration ?? 0 }));
        setYtStatus("done");
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        setYtStatus("error");
        setYtSearchError(err instanceof Error ? err.message : "YouTube search failed.");
      });
  };
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      return;
    }
    const id = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setStatus("loading");
      setError(null);
      searchLyrics(q, ctl.signal)
        .then((h) => {
          if (ctl.signal.aborted) return;
          setHits(h);
          setStatus("done");
        })
        .catch((err: unknown) => {
          if (ctl.signal.aborted) return;
          setStatus("error");
          setError(err instanceof Error ? err.message : "Search failed.");
        });
    }, 350);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, focusLyrics]);

  // auto-suggest videos for the current song whenever it changes while the panel is open
  const autoQuery = officialQuery(track.title, track.artist);
  useEffect(() => {
    if (!open || !ytKey || track.source === "demo") return;
    if (lastAutoRef.current === autoQuery) return;
    lastAutoRef.current = autoQuery;
    setYtQuery(autoQuery);
    runYouTubeSearch(autoQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runYouTubeSearch is stable enough; re-run only on song/open change
  }, [open, ytKey, autoQuery, track.source]);

  if (!open) return null;

  const ytQueryManual = autoQuery;
  const offset = track.offset ?? 0;
  const officialHits = ytHits.filter((h) => h.kind !== "unofficial");
  const hiddenCount = ytHits.length - officialHits.length;
  const shownHits = ytShowAll ? ytHits : officialHits;
  const pickVideo = (h: YouTubeHit) => {
    const meta = (x: YouTubeHit): VideoMeta => ({ title: x.title, channel: x.channel, duration: x.duration });
    const alternates: YouTubeCandidate[] = officialHits.filter((x) => x.videoId !== h.videoId).map((x) => ({ videoId: x.videoId, meta: meta(x) }));
    onYouTube(h.videoId, meta(h), alternates);
  };
  const sourceKind = source.kind === "youtube" && backingMeta ? classifyUpload(backingMeta.title, backingMeta.channel, track.artist) : null;

  const submitYouTube = () => {
    const id = parseYouTubeId(ytInput);
    if (!id) {
      setYtError("Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…).");
      return;
    }
    setYtError(null);
    onYouTube(id);
    setYtInput("");
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} data-testid="song-panel-backdrop">
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Find a song" onClick={(e) => e.stopPropagation()} data-testid="song-panel">
        <header className="sheet-head">
          <h2 className="sheet-title">Find a song</h2>
          <button type="button" className="dock-btn" onClick={onClose} aria-label="Close" data-testid="song-panel-close">
            Close
          </button>
        </header>

        {/* ── 1. lyrics ── */}
        <div className="sheet-section">
          <div className="sheet-label">1 · Lyrics</div>
          <input
            ref={inputRef}
            className="song-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song title and artist…"
            aria-label="Search lyrics"
            data-testid="song-search-input"
            enterKeyHint="search"
          />
          <div className="song-results" data-testid="song-results" aria-live="polite">
            {status === "loading" && <div className="song-hint">Searching…</div>}
            {status === "error" && (
              <div className="song-hint song-hint--error" data-testid="song-search-error">
                {error}
              </div>
            )}
            {status === "done" && hits.length === 0 && <div className="song-hint">No lyrics found. Try fewer words, or time your own in Sync Studio.</div>}
            {sortHitsForBacking(hits, backingDuration).map((h, i) => (
              <div key={h.id} className={`song-hit ${h.synced ? "" : "song-hit--plain"} ${fitsDuration(h, backingDuration) ? "song-hit--fits" : ""}`} data-testid={`song-result-${i}`}>
                <div className="song-hit-main">
                  <span className="song-hit-title">
                    {h.title}
                    {fitsDuration(h, backingDuration) && (
                      <span className="song-fit-badge" data-testid={`song-fit-${i}`}>
                        ✓ matches length
                      </span>
                    )}
                  </span>
                  <span className="song-hit-meta">
                    {h.artist}
                    {h.album ? ` · ${h.album}` : ""}
                    {h.duration ? ` · ${formatDuration(h.duration)}` : ""}
                  </span>
                </div>
                {h.instrumental ? (
                  <span className="song-badge">instrumental</span>
                ) : h.synced ? (
                  <button type="button" className="transport-btn transport-btn--primary song-hit-btn" onClick={() => onPickSynced(h)} data-testid={`song-use-${i}`}>
                    Use
                  </button>
                ) : (
                  <button type="button" className="dock-btn song-hit-btn" onClick={() => onPickPlain(h)} title="No timing yet — tap it out in Sync Studio" data-testid={`song-studio-${i}`}>
                    Time it
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="song-hint">
            Lyrics from <a href="https://lrclib.net" target="_blank" rel="noopener noreferrer">LRCLIB</a>, a community database. <strong>Use</strong> = word-timed; <strong>Time it</strong> = plain text you tap in Sync Studio.
          </div>
        </div>

        {/* ── 2. backing track ── */}
        <div className="sheet-section">
          <div className="sheet-label">2 · Backing track (YouTube Music / official video)</div>
          <div className={`song-loaded ${track.source === "demo" ? "song-loaded--demo" : ""}`} data-testid="lyrics-loaded">
            Lyrics loaded: <strong>{track.title}</strong>
            {track.artist && track.artist !== "Unknown artist" ? ` — ${track.artist}` : ""}
            {track.source === "demo" ? " (built-in demo — pick your song in step 1)" : ""}
          </div>
          <div className="song-source" data-testid="song-source">
            {source.kind === "none" && <span className="song-hint">None yet — the virtual clock plays the lyrics silently.</span>}
            {source.kind === "file" && (
              <span>
                File: <strong>{source.name}</strong>
              </span>
            )}
            {source.kind === "youtube" && (
              <span>
                YouTube: <strong>{backingMeta?.title || source.videoId}</strong>
                {sourceKind && kindLabel(sourceKind) && (
                  <span className={`yt-kind-badge yt-kind-badge--${sourceKind}`} data-testid="song-source-kind" style={{ marginLeft: 8 }}>
                    {kindLabel(sourceKind)}
                  </span>
                )}
              </span>
            )}
            {source.kind !== "none" && (
              <button type="button" className="mini-btn" onClick={onClearSource} data-testid="song-source-clear">
                remove
              </button>
            )}
          </div>
          <div className="studio-row">
            <label className="dock-btn">
              <input
                type="file"
                accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm"
                className="sr-only"
                aria-label="Upload media file"
                data-testid="song-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <IconUpload /> Audio / video file
            </label>
            {!ytKey && (
              <a className="dock-btn" href={youtubeSearchUrl(ytQueryManual)} target="_blank" rel="noopener noreferrer" data-testid="song-youtube-search">
                Find on YouTube ↗
              </a>
            )}
          </div>
          {ytKey && (
            <>
              <form
                className="studio-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  runYouTubeSearch(ytQuery);
                }}
              >
                <input
                  className="song-search song-yt"
                  type="search"
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  placeholder="Search YouTube Music / official videos…"
                  aria-label="Search YouTube"
                  data-testid="youtube-search-input"
                  enterKeyHint="search"
                />
                <button type="submit" className="dock-btn" data-testid="youtube-search-go">
                  Search
                </button>
              </form>
              <div className="yt-results" data-testid="youtube-results" aria-live="polite">
                {ytStatus === "loading" && <div className="song-hint">Searching YouTube…</div>}
                {ytStatus === "error" && (
                  <div className="song-hint song-hint--error" data-testid="youtube-search-error">
                    {ytSearchError}
                  </div>
                )}
                {ytStatus === "done" && ytHits.length === 0 && <div className="song-hint">No videos found — try other words or paste a link below.</div>}
                {ytStatus === "done" && ytHits.length > 0 && officialHits.length === 0 && !ytShowAll && (
                  <div className="song-hint" data-testid="youtube-no-official">No official upload found for this search.</div>
                )}
                {shownHits.map((h, i) => (
                  <button key={h.videoId} type="button" className={`yt-hit ${h.kind === "unofficial" ? "yt-hit--unofficial" : ""}`} onClick={() => pickVideo(h)} data-testid={`youtube-result-${i}`} data-kind={h.kind}>
                    {h.thumbnail ? <img className="yt-thumb" src={h.thumbnail} alt="" loading="lazy" /> : <span className="yt-thumb" />}
                    <span className="yt-hit-main">
                      <span className="yt-hit-title">{h.title}</span>
                      <span className="yt-hit-meta">
                        {kindLabel(h.kind) && (
                          <span className={`yt-kind-badge yt-kind-badge--${h.kind}`} data-testid={`youtube-kind-${i}`}>
                            {kindLabel(h.kind)}
                          </span>
                        )}
                        {h.channel}
                        {h.duration ? ` · ${formatDuration(h.duration)}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {ytStatus === "done" && hiddenCount > 0 && (
                <button type="button" className="yt-show-all" onClick={() => setYtShowAll((v) => !v)} data-testid="youtube-show-all">
                  {ytShowAll ? "Hide other uploads" : `Show ${hiddenCount} other upload${hiddenCount === 1 ? "" : "s"} (karaoke, covers, live…)`}
                </button>
              )}
            </>
          )}
          <form
            className="studio-row"
            onSubmit={(e) => {
              e.preventDefault();
              submitYouTube();
            }}
          >
            <input
              className="song-search song-yt"
              type="url"
              inputMode="url"
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              placeholder="Paste a YouTube link…"
              aria-label="YouTube link"
              data-testid="youtube-url-input"
            />
            <button type="submit" className="dock-btn" data-testid="youtube-load">
              Load
            </button>
          </form>
          {ytError && (
            <div className="song-hint song-hint--error" data-testid="youtube-error">
              {ytError}
            </div>
          )}
          <div className="song-hint">
            Only <strong>YouTube Music</strong> tracks and <strong>official</strong> videos are listed, so the words line up with the record. The video plays as the stage; the lights follow the song's BPM there (browsers don't expose YouTube audio).
          </div>
        </div>

        {/* ── 3. timing ── */}
        <div className="sheet-section">
          <div className="sheet-label">3 · Lyric timing</div>
          <div className="studio-row">
            <span className="song-hint">Words early or late? Shift them:</span>
            {[-0.5, -0.1, 0.1, 0.5].map((d) => (
              <button key={d} type="button" className="mini-btn" onClick={() => onNudge(d)} aria-label={`Shift lyrics ${d > 0 ? "later" : "earlier"} by ${Math.abs(d)} seconds`} data-testid={`nudge-${d > 0 ? "plus" : "minus"}-${Math.abs(d) * 10}`}>
                {d > 0 ? `+${d}` : d} s
              </button>
            ))}
            <span className="song-offset" data-testid="lyric-offset">
              {offset >= 0 ? "+" : ""}
              {offset.toFixed(2)} s
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
