import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.projectgraphite.strata',
  appName: 'Strata',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(process.env.CAPACITOR_SERVER_URL ? { url: process.env.CAPACITOR_SERVER_URL } : {}),
  },
};

export default config;

