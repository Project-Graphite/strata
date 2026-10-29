const { chromium } = require('playwright');
const { base } = require('./scripts/ui-routes.mjs');

module.exports = {
  ci: {
    collect: {
      url: ['/', '/login', '/tasks', '/spending', '/agenda/week'].map((path) => `${base}${path}`),
      chromePath: chromium.executablePath(),
      puppeteerScript: 'scripts/lighthouse-sign-in.cjs',
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': ['error', { minScore: 0.9 }],
            'categories:accessibility': ['error', { minScore: 0.95 }],
            'categories:best-practices': ['error', { minScore: 0.95 }],
          },
        },
        {
          matchingUrlPattern: '/(login)?$',
          assertions: { 'categories:seo': ['error', { minScore: 1 }] },
        },
      ],
    },
  },
};
