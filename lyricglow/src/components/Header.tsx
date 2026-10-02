import Logo from "../Logo";
import type { Section } from "../lyrics";

export type Theme = "dark" | "light";

interface Props {
  title: string;
  artist: string;
  section: Section | null;
  theme: Theme;
  onToggleTheme: () => void;
  children?: React.ReactNode;
}

export default function Header({ title, artist, section, theme, onToggleTheme, children }: Props) {
  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-brand">
        <Logo />
        <span className="app-name">LyricGlow</span>
      </div>
      <div className="header-meta">
        {section && (
          <span className="header-section-badge" data-testid="header-section-badge">
            {section}
          </span>
        )}
        <div className="track-info">
          <span className="track-title" data-testid="track-title">
            {title}
          </span>
          <span className="track-artist" data-testid="track-artist">
            {artist}
          </span>
        </div>
      </div>
      <div className="header-actions">
        {children}
        <button
          type="button"
          className="icon-btn theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          data-testid="theme-toggle"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
