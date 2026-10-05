import Logo from "../Logo";
import type { Section } from "../lyrics";
import { IconExitFullscreen, IconFullscreen } from "./Icons";

export type Theme = "dark" | "light";

interface Props {
  title: string;
  artist: string;
  section: Section | null;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/** Compact top bar: brand · song · section badge · performance-mode toggle. */
export default function Header({ title, artist, section, fullscreen, onToggleFullscreen }: Props) {
  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-brand">
        <Logo />
        <span className="app-name">LyricGlow</span>
      </div>
      <div className="header-meta">
        <div className="track-info">
          <span className="track-title" data-testid="track-title">
            {title}
          </span>
          <span className="track-artist" data-testid="track-artist">
            {artist}
          </span>
        </div>
        {section && (
          <span className="header-section-badge" data-testid="header-section-badge">
            {section}
          </span>
        )}
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleFullscreen}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? "Exit performance mode" : "Enter performance mode (fullscreen)"}
          title="Performance mode (F)"
          data-testid="btn-fullscreen"
        >
          {fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        </button>
      </div>
    </header>
  );
}
