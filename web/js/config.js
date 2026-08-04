// Where the room server lives.
//
// Set `window.MAINLINE_SERVER` in index.html at deploy time (the Cloudflare
// Worker URL, e.g. https://mainline-rooms.<account>.workers.dev). Players can
// also point the app somewhere else from the settings panel, which is handy
// for testing against a local `wrangler dev`.

const STORAGE_KEY = 'mainline.server';

export function serverUrl() {
  const override = localStorage.getItem(STORAGE_KEY);
  if (override) return override.replace(/\/$/, '');
  const baked = (typeof window !== 'undefined' && window.MAINLINE_SERVER) || '';
  return baked.replace(/\/$/, '');
}

export function setServerUrl(url) {
  if (url) localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/$/, ''));
  else localStorage.removeItem(STORAGE_KEY);
}

export function hasServer() {
  return Boolean(serverUrl());
}

export function playerId() {
  let id = localStorage.getItem('mainline.pid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('mainline.pid', id);
  }
  return id;
}

export function playerName() {
  return localStorage.getItem('mainline.name') || '';
}

export function setPlayerName(name) {
  localStorage.setItem('mainline.name', name);
}
