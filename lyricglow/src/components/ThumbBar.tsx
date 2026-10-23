import type { MicState } from "../engine/AudioGraph";
import type { PlaybackEngine, PlaybackSnapshot } from "../engine/PlaybackEngine";
import { IconMore, IconPause, IconPlay, IconRestart, IconSearch } from "./Icons";
import MicSwitch from "./MicSwitch";
import ProgressRow from "./ProgressRow";

interface Props {
  engine: PlaybackEngine;
  playback: PlaybackSnapshot;
  mic: MicState;
  onToggleMic: () => void;
  onFindSong: () => void;
  onMore: () => void;
  moreOpen: boolean;
}

/**
 * Bottom bar for thumbs: seek row + five big targets
 * (Find song · Restart · Play/Pause · Mic switch · More). Everything else lives in the More sheet.
 */
export default function ThumbBar({ engine, playback, mic, onToggleMic, onFindSong, onMore, moreOpen }: Props) {
  return (
    <div className="thumb-bar" data-testid="thumb-bar">
      <ProgressRow engine={engine} duration={playback.duration} />
      <div className="thumb-row" data-testid="thumb-row">
        <div className="thumb-item">
          <button type="button" className="thumb-btn thumb-btn--accent" onClick={onFindSong} aria-label="Find a song" data-testid="btn-find-song">
            <IconSearch />
          </button>
          <span className="thumb-caption">Song</span>
        </div>

        <div className="thumb-item">
          <button type="button" className="thumb-btn" onClick={() => engine.restart()} aria-label="Restart" data-testid="btn-restart">
            <IconRestart />
          </button>
          <span className="thumb-caption">Restart</span>
        </div>

        <div className="thumb-item thumb-item--primary">
          {playback.playing ? (
            <button type="button" className="thumb-btn thumb-btn--primary" onClick={() => engine.pause()} aria-label="Pause" data-testid="btn-pause">
              <IconPause />
            </button>
          ) : (
            <button
              type="button"
              className="thumb-btn thumb-btn--primary"
              onClick={() => engine.play()}
              aria-label={playback.ended ? "Play again" : "Play"}
              data-testid="btn-play"
            >
              <IconPlay />
            </button>
          )}
        </div>

        <MicSwitch mic={mic} onToggle={onToggleMic} />

        <div className="thumb-item">
          <button
            type="button"
            className="thumb-btn"
            onClick={onMore}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label="More options"
            data-testid="btn-more"
          >
            <IconMore />
          </button>
          <span className="thumb-caption">More</span>
        </div>
      </div>
    </div>
  );
}
