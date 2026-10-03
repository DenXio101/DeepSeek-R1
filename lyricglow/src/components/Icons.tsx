// Small inline SVG icon set (no font dependency). All are decorative; the
// surrounding control carries the accessible label.
const base = { viewBox: "0 0 24 24", "aria-hidden": true as const, focusable: "false" as const };

export function IconPlay() {
  return (
    <svg {...base}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}
export function IconPause() {
  return (
    <svg {...base}>
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  );
}
export function IconRestart() {
  return (
    <svg {...base}>
      <path d="M6 5h2v14H6zM19 6.5v11L10 12z" />
    </svg>
  );
}
export function IconUpload() {
  return (
    <svg {...base}>
      <path d="M12 4l5 5h-3.2v6h-3.6V9H7zM5 17h14v2H5z" />
    </svg>
  );
}
export function IconMic() {
  return (
    <svg {...base}>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3h2a7 7 0 0 1-6 6.92V21h-2v-3.08A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0z" />
    </svg>
  );
}
export function IconFullscreen() {
  return (
    <svg {...base}>
      <path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z" />
    </svg>
  );
}
export function IconExitFullscreen() {
  return (
    <svg {...base}>
      <path d="M8 4h2v6H4V8h4zM14 4h2v4h4v2h-6zM4 14h6v6H8v-4H4zM14 14h6v2h-4v4h-2z" />
    </svg>
  );
}
export function IconStudio() {
  return (
    <svg {...base}>
      <path d="M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4zM17 10l1.2 2.6L21 13.8l-2.8 1.2L17 17.6l-1.2-2.6L13 13.8l2.8-1.2z" />
    </svg>
  );
}
export function IconImport() {
  return (
    <svg {...base}>
      <path d="M12 16l-5-5h3.2V4h3.6v7H17zM5 18h14v2H5z" />
    </svg>
  );
}
export function IconDownload() {
  return (
    <svg {...base}>
      <path d="M11 4h2v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4L11 12.2zM5 18h14v2H5z" />
    </svg>
  );
}
export function IconSparkle() {
  return (
    <svg {...base}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}
export function IconSearch() {
  return (
    <svg {...base}>
      <path d="M10 3a7 7 0 1 1-4.9 12l-3.6 3.6-1.4-1.4L3.7 13.6A7 7 0 0 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
    </svg>
  );
}
