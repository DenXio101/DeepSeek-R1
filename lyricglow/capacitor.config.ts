import type { CapacitorConfig } from '@capacitor/cli';

// Native shells (Android / iOS) wrap the same web build. Build the web app with
//   VITE_API_BASE=https://lyricglow.vercel.app npm run build && npx cap sync
// so recognition requests reach the hosted function from the app origin.
const config: CapacitorConfig = {
  appId: 'app.lyricglow',
  appName: 'LyricGlow',
  webDir: 'dist',
  backgroundColor: '#0a0a0e',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0e',
  },
};

export default config;
