# LyricGlow on Android and iPhone

LyricGlow ships three ways from one code base. All three run the same React app; the
difference is how it gets onto the phone.

| Route | Who it suits | What you need |
|---|---|---|
| **1. Installable web app (PWA)** — live now at https://lyricglow.vercel.app | Everyone, today | Nothing. Open the link on the phone and install (steps below). |
| **2. Android app (APK / Play Store)** — `android/` project | Play Store listing, side-loading | Android Studio on any computer; a Google Play developer account (one-off fee) to publish. |
| **3. iPhone app (TestFlight / App Store)** — `ios/` project | App Store listing | A Mac with Xcode; an Apple Developer account (yearly fee) to publish. |

Routes 2 and 3 are **Capacitor** shells: a native project that embeds the web build in a
WebView, with microphone permission declared, the app icon and splash set, and the
recognition API pointed at the hosted function.

## 1. Install the web app (no store)

**Android (Chrome, Edge, Samsung Internet)**
1. Open https://lyricglow.vercel.app.
2. Tap **More → Get the app → Install LyricGlow on this phone** (or the browser's own
   "Install app" entry in its menu).
3. The icon appears on the home screen; it opens full-screen without browser chrome.

**iPhone / iPad (Safari only — Apple does not allow other browsers to install)**
1. Open https://lyricglow.vercel.app in Safari.
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Launch from the home screen. Microphone, Listen mode and fullscreen stage all work in
   the installed app (iOS 16.4 or newer).

The service worker caches the app shell so it opens instantly and survives a flaky
connection; lyrics, YouTube and recognition always go to the network. Updates install
automatically on the next launch.

## 2. Android app

```bash
cd lyricglow
npm install
npm run build:native        # web build with VITE_API_BASE → copies into android/ and ios/
npx cap open android        # opens Android Studio
```

In Android Studio: let Gradle sync, pick a device or emulator, press **Run**. For a
store build: **Build → Generate Signed Bundle / APK → Android App Bundle**, create a
keystore (keep it safe — it is the only way to update the app later), then upload the
`.aab` in Play Console together with the listing text, screenshots and the privacy
declaration (microphone: used for scoring and song recognition; no data stored).

Already set in the project: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`
permissions, launcher + adaptive icons, dark splash, app id `app.lyricglow`,
`https` scheme so the YouTube player and `getUserMedia` behave as on the web.

## 3. iPhone app

```bash
cd lyricglow
npm install
npm run build:native
npx cap open ios            # opens Xcode (macOS only)
```

In Xcode: select the **App** target → *Signing & Capabilities* → choose your team;
pick an iPhone or simulator; **Run**. For TestFlight / App Store: **Product → Archive**
→ *Distribute App*. App Store Connect needs the listing, screenshots, the privacy
nutrition label (microphone, no tracking) and a review note explaining that the mic
scores singing and recognises songs.

Already set in the project: `NSMicrophoneUsageDescription`, app icon (1024 px), dark
splash, `https` scheme. CocoaPods is not required (Capacitor 8 uses Swift Package Manager).

## Things to know

- **Recognition keys** live on the Vercel function (`ACR_*` env vars); the native apps
  call `https://lyricglow.vercel.app/api/recognize`, so one set of keys serves web and
  apps. Change the host in `capacitor.config.ts` / `build:native` if you move hosting.
- **YouTube inside the apps** plays through the same embedded player as the web and is
  subject to the same embedding rules; Listen mode is the route that needs no embed.
- **Review risk**: Apple sometimes rejects thin web wrappers (guideline 4.2). LyricGlow
  has substantial native-feeling functionality (mic scoring, recognition, offline shell),
  but keep the store description focused on singing features, not "a website".
- **Updating**: web and PWA update on deploy. Native apps need `npm run build:native`
  and a new store build each time you want the shell's bundled copy refreshed.
