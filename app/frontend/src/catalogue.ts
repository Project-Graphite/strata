export interface KnownService {
  name: string;
  category: string;
  cancelUrl: string;
}

export const catalogue: KnownService[] = [
  { name: 'Netflix', category: 'streaming', cancelUrl: 'https://www.netflix.com/cancelplan' },
  { name: 'Disney+', category: 'streaming', cancelUrl: 'https://www.disneyplus.com/account' },
  { name: 'YouTube Premium', category: 'streaming', cancelUrl: 'https://www.youtube.com/paid_memberships' },
  { name: 'Apple TV+', category: 'streaming', cancelUrl: 'https://tv.apple.com/settings' },
  { name: 'Max', category: 'streaming', cancelUrl: 'https://www.max.com/account' },
  { name: 'Hulu', category: 'streaming', cancelUrl: 'https://www.hulu.com/account' },
  { name: 'Crunchyroll', category: 'streaming', cancelUrl: 'https://www.crunchyroll.com/account/membership' },
  { name: 'Amazon Prime', category: 'streaming', cancelUrl: 'https://www.amazon.com/mc' },
  { name: 'Twitch', category: 'streaming', cancelUrl: 'https://www.twitch.tv/subscriptions' },
  { name: 'Spotify', category: 'music', cancelUrl: 'https://www.spotify.com/account/subscription/' },
  { name: 'Apple Music', category: 'music', cancelUrl: 'https://music.apple.com/account/subscriptions' },
  { name: 'Deezer', category: 'music', cancelUrl: 'https://www.deezer.com/account/subscription' },
  { name: 'Audible', category: 'other', cancelUrl: 'https://www.audible.com/account/overview' },
  { name: 'Google One', category: 'cloud', cancelUrl: 'https://one.google.com/settings' },
  { name: 'iCloud+', category: 'cloud', cancelUrl: 'https://apps.apple.com/account/subscriptions' },
  { name: 'Dropbox', category: 'cloud', cancelUrl: 'https://www.dropbox.com/account/plan' },
  { name: 'Microsoft 365', category: 'software', cancelUrl: 'https://account.microsoft.com/services' },
  { name: 'Adobe Creative Cloud', category: 'software', cancelUrl: 'https://account.adobe.com/plans' },
  { name: '1Password', category: 'software', cancelUrl: 'https://my.1password.com/' },
  { name: 'Figma', category: 'software', cancelUrl: 'https://www.figma.com/settings' },
  { name: 'Zoom', category: 'software', cancelUrl: 'https://zoom.us/billing' },
  { name: 'LinkedIn Premium', category: 'software', cancelUrl: 'https://www.linkedin.com/premium/manage/' },
  { name: 'Duolingo Super', category: 'education', cancelUrl: 'https://www.duolingo.com/settings/super' },
  { name: 'The New York Times', category: 'news', cancelUrl: 'https://www.nytimes.com/subscription/manage' },
  { name: 'Patreon', category: 'other', cancelUrl: 'https://www.patreon.com/settings/memberships' },
  { name: 'PlayStation Plus', category: 'other', cancelUrl: 'https://store.playstation.com/subscriptions' },
  { name: 'Strava', category: 'fitness', cancelUrl: 'https://www.strava.com/account' },
];

export function knownService(name: string) {
  const wanted = name.trim().toLowerCase();
  return catalogue.find((service) => service.name.toLowerCase() === wanted);
}
