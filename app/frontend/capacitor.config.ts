import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://strata.project-graphite.com';

const config: CapacitorConfig = {
  appId: 'app.projectgraphite.strata',
  appName: 'Strata',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: serverUrl,
    allowNavigation: ['strata.project-graphite.com'],
  },
};

export default config;

