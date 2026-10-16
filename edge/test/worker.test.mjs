// node --test edge/test/worker.test.mjs   — aucun réseau : fetch est simulé.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { signSession, checkSession } from '../src/worker.js';

const SECRET = 'x'.repeat(40);
const UID = 'KCTGn1Mr4fYObYW5nrMMmN8CPX02';
const origin = [];
let flagValue, flagFails, adminAnswer;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('/hub/settings/maintenance.json')) {
    if (flagFails) throw new Error('réseau');
    return new Response(JSON.stringify(flagValue), { status: 200 });
  }
  if (url.includes('/admins/')) return new Response(JSON.stringify(adminAnswer), { status: adminAnswer === undefined ? 401 : 200 });
  origin.push(url);
  return new Response('ORIGINE', { status: 200 });
};

const req = (path, init) => new Request('https://roulia.me' + path, init);
const env = { COOKIE_SECRET: SECRET };
// Instances isolées : le Worker garde l'interrupteur 3 s en mémoire ; chaque test attend qu'il expire.
const reset = () => { origin.length = 0; flagFails = false; flagValue = true; adminAnswer = true; return new Promise(r => setTimeout(r, 3100)); };

const jwt = claims => 'e30.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.sig';
const goodClaims = { aud: 'undercover-game-b0d2a', sub: UID, exp: Math.floor(Date.now() / 1000) + 600, firebase: { sign_in_provider: 'google.com' } };

test('maintenance : écran 503, rien n\'est demandé à l\'origine', async () => {
  await reset();
  for (const p of ['/', '/index.html', '/games/uno/index.html', '/icons/favicon.svg']) {
    const res = await worker.fetch(req(p), env);
    assert.equal(res.status, 503, p);
    assert.match(await res.text(), /Site en maintenance/);
  }
  assert.deepEqual(origin, []);
});

test('site ouvert : la requête passe à l\'origine', async () => {
  await reset(); flagValue = false;
  const res = await worker.fetch(req('/games/uno/index.html'), env);
  assert.equal(await res.text(), 'ORIGINE');
  assert.equal(origin.length, 1);
});

test('base injoignable : fermé, sauf si le site était ouvert il y a moins de 60 s', async () => {
  await reset();                                              // dernière valeur connue : fermé
  assert.equal((await worker.fetch(req('/'), env)).status, 503);
  await reset(); flagFails = true;
  assert.equal((await worker.fetch(req('/'), env)).status, 503);
  await reset(); flagValue = false;                           // dernière valeur connue : ouvert
  assert.equal((await worker.fetch(req('/'), env)).status, 200);
  await reset(); flagFails = true;
  assert.equal((await worker.fetch(req('/'), env)).status, 200);
});

test('maintenance : les pages d\'authentification Firebase restent servies', async () => {
  await reset();
  const res = await worker.fetch(req('/__/auth/handler'), env);
  assert.equal(await res.text(), 'ORIGINE');
});

test('cookie signé valide : le site s\'ouvre en maintenance', async () => {
  await reset();
  const cookie = `gh_admin=${await signSession(SECRET, UID)}`;
  const res = await worker.fetch(req('/', { headers: { Cookie: cookie } }), env);
  assert.equal(await res.text(), 'ORIGINE');
});

test('cookie falsifié, expiré ou signé avec un autre secret : refusé', async () => {
  await reset();
  const good = await signSession(SECRET, UID);
  const [uid, exp, sig] = good.split('.');
  const forged = [`${uid}.${Number(exp) + 99999}.${sig}`, `${uid}x.${exp}.${sig}`, `${uid}.${exp}.AAAA`, await signSession('y'.repeat(40), UID), await signSession(SECRET, UID, Date.now() - 7200000), 'n.importe.quoi', ''];
  for (const c of forged) {
    assert.equal(await checkSession(SECRET, c), false, c);
    const res = await worker.fetch(req('/', { headers: { Cookie: `gh_admin=${c}` } }), env);
    assert.equal(res.status, 503, c);
  }
  assert.equal(await checkSession(SECRET, good), true);
});

test('session : compte dans admins/ → cookie HttpOnly Secure', async () => {
  await reset();
  const res = await worker.fetch(req('/__gh/session', { method: 'POST', body: JSON.stringify({ token: jwt(goodClaims) }) }), env);
  assert.equal(res.status, 200);
  const set = res.headers.get('Set-Cookie');
  assert.match(set, /^gh_admin=/); assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /SameSite=Lax/);
});

test('session : refusée si la base ne confirme pas, si le jeton est mauvais ou sans secret', async () => {
  await reset();
  const post = (token, e = env) => worker.fetch(req('/__gh/session', { method: 'POST', body: JSON.stringify({ token }) }), e);
  adminAnswer = null; assert.equal((await post(jwt(goodClaims))).status, 403);       // pas dans admins/
  adminAnswer = undefined; assert.equal((await post(jwt(goodClaims))).status, 403);  // jeton rejeté par la base
  adminAnswer = true;
  assert.equal((await post(jwt({ ...goodClaims, aud: 'autre-projet' }))).status, 403);
  assert.equal((await post(jwt({ ...goodClaims, exp: 1 }))).status, 403);
  assert.equal((await post(jwt({ ...goodClaims, firebase: { sign_in_provider: 'anonymous' } }))).status, 403);
  assert.equal((await post('pas-un-jeton')).status, 403);
  assert.equal((await post(jwt(goodClaims), {})).status, 500);
  assert.equal((await worker.fetch(req('/__gh/session', { method: 'POST', body: 'x' }), env)).status, 400);
});

test("en-têtes de sécurité sur le site ouvert et sur l'écran de maintenance", async () => {
  await reset(); flagValue = false;
  let res = await worker.fetch(req('/'), env);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(res.headers.get('Strict-Transport-Security'), /max-age=\d+/);
  await reset();
  res = await worker.fetch(req('/'), env);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});
