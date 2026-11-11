export default function Logo() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="LyricGlow logo"
      role="img"
    >
      {/* Outer glow ring */}
      <circle cx="22" cy="22" r="20" stroke="url(#ringGrad)" strokeWidth="1.5" opacity="0.6" />
      {/* Stage spotlight beam */}
      <path
        d="M22 6 L10 36 L34 36 Z"
        fill="url(#spotGrad)"
        opacity="0.18"
      />
      {/* Microphone body */}
      <rect x="19" y="12" width="6" height="11" rx="3" fill="url(#micGrad)" />
      {/* Microphone stand */}
      <line x1="22" y1="23" x2="22" y2="31" stroke="#b0a090" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17" y1="31" x2="27" y2="31" stroke="#b0a090" strokeWidth="1.5" strokeLinecap="round" />
      {/* Glow notes */}
      <circle cx="30" cy="15" r="2" fill="#00d4ff" opacity="0.85" />
      <circle cx="33" cy="10" r="1.2" fill="#00d4ff" opacity="0.5" />
      <circle cx="14" cy="18" r="1.5" fill="#f4a0c0" opacity="0.7" />
      <circle cx="11" cy="13" r="1" fill="#f4a0c0" opacity="0.4" />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8c87a" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
        <linearGradient id="spotGrad" x1="22" y1="6" x2="22" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8c87a" stopOpacity="1" />
          <stop offset="100%" stopColor="#e8c87a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="micGrad" x1="19" y1="12" x2="25" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8c87a" />
          <stop offset="100%" stopColor="#c49a3c" />
        </linearGradient>
      </defs>
    </svg>
  );
}
