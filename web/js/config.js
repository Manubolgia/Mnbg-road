// Where the room server lives.
//
// `window.MAINLINE_SERVER` is set in index.html; the deploy workflow rewrites
// that line from the MAINLINE_SERVER repository variable. To test against a
// local `wrangler dev`, set the `mainline.server` localStorage key by hand:
//   localStorage.setItem('mainline.server', 'http://localhost:8787')

const STORAGE_KEY = 'mainline.server';

export function serverUrl() {
  const override = localStorage.getItem(STORAGE_KEY);
  if (override) return override.replace(/\/$/, '');
  const baked = (typeof window !== 'undefined' && window.MAINLINE_SERVER) || '';
  return baked.replace(/\/$/, '');
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
