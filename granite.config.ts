import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'te-ppu-prototype',
  brand: {
    displayName: '탑 블록 대전',
    primaryColor: '#6c5ce7',
    icon: process.env.AIT_ICON_URL ?? '/prototype-mark.svg',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host 0.0.0.0 --mode apps',
      build: 'npm run typecheck && vite build --mode apps',
    },
  },
  webViewProps: {
    type: 'game',
    allowsBackForwardNavigationGestures: false,
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
  },
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'dark',
  },
  permissions: [],
  outdir: 'dist',
});
