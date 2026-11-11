# Third-party notices

LyricGlow's only runtime dependencies beyond React are:

| Package | Version | Licence | Used for |
|---|---|---|---|
| `@soundtouchjs/audio-worklet` (with `@soundtouchjs/core`, `@soundtouchjs/worklet-base`, `@soundtouchjs/interpolation-strategy-lanczos`) | 2.1.1 | MPL-2.0 | Key change for local files: the SoundTouch time-stretch/pitch-shift algorithm as an AudioWorklet. Loaded only when the key is changed. |
| `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` | 8.x | MIT | Native app shells. |

The Mozilla Public License 2.0 applies file by file: the SoundTouch files are shipped
unmodified under `/assets/` in the web build and inside the native bundles. Their licence
text is in `node_modules/@soundtouchjs/audio-worklet/LICENSE`. No LyricGlow source is
derived from them.
