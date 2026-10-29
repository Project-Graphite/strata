let signedIn;

module.exports = async (browser, { url }) => {
  const { routes, signIn } = await import('./ui-routes.mjs');
  if (routes.some((route) => route.path === new URL(url).pathname && !route.signedIn)) return;
  signedIn ??= browser.newPage().then(async (page) => {
    await signIn(page);
    await page.close();
  });
  await signedIn;
};
