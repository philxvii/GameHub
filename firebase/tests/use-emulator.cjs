// Préchargement Node : redirige vers l'émulateur les appels REST qu'une suite de
// tests existante adresse à la base de production, en administrateur de l'émulateur
// (« owner ») : les suites inspectent et nettoient l'état sans être membres. Permet
// de les lancer contre l'émulateur sans les modifier.
//
//   node -r ./firebase/tests/use-emulator.cjs games/banqueroll/tests/test-browser.js

const PROD = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/';
const EMU = 'http://127.0.0.1:9000/';
const NS = 'ns=undercover-game-b0d2a-default-rtdb';
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith(PROD)) {
    const u = EMU + url.slice(PROD.length);
    const headers = { ...((init && init.headers) || {}), Authorization: 'Bearer owner' };
    return realFetch(u + (u.includes('?') ? '&' : '?') + NS, { ...init, headers });
  }
  return realFetch(input, init);
};
