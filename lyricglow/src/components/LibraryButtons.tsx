import { useRef } from "react";
import type { Track } from "../lyrics";
import { downloadTextFile, exportLrc, safeFileStem, trackToJson } from "../model/trackIO";
import { IconDownload, IconImport } from "./Icons";

interface Props {
  track: Track;
  onImportFile: (file: File) => void;
}

/** Import lyrics (.lrc / .json) and export the current track. */
export default function LibraryButtons({ track, onImportFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stem = safeFileStem(track.title);
  return (
    <>
      <label className="dock-btn" data-testid="import-label" title="Import .lrc or LyricGlow .json lyrics">
        <input
          ref={inputRef}
          type="file"
          accept=".lrc,.json,.txt,text/plain,application/json"
          className="sr-only"
          aria-label="Import lyrics file"
          data-testid="import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <IconImport /> Lyrics
      </label>
      <button
        type="button"
        className="dock-btn"
        onClick={() => downloadTextFile(`${stem}.lyricglow.json`, trackToJson(track), "application/json")}
        aria-label="Export lyrics as LyricGlow JSON"
        data-testid="btn-export-json"
        title="Export JSON (lossless, includes melody)"
      >
        <IconDownload /> JSON
      </button>
      <button
        type="button"
        className="dock-btn"
        onClick={() => downloadTextFile(`${stem}.lrc`, exportLrc(track), "text/plain")}
        aria-label="Export lyrics as enhanced LRC"
        data-testid="btn-export-lrc"
        title="Export enhanced LRC (word-timed)"
      >
        <IconDownload /> LRC
      </button>
    </>
  );
}
