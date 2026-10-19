// Portier de roulia.me — Cloudflare Worker placé devant GitHub Pages.
//
// Site ouvert  : la requête passe telle quelle à GitHub Pages (le visiteur ne voit rien).
// Maintenance  : le Worker répond lui-même par l'écran de maintenance. Aucune page, image
//                ni feuille de style ne sort de GitHub : le contenu ne quitte pas l'origine.
// Admin        : connexion Google sur l'écran de maintenance ; le Worker vérifie auprès de la
//                base que l'uid figure dans admins/, puis pose un cookie signé (1 h) qui
//                laisse passer vers le site. Rien n'est lisible sans ce cookie.
//
// L'interrupteur est le même que celui du site : hub/settings/maintenance (Firebase).
// Cette couche s'ajoute à shared/maintenance.js et aux règles de la base, elle ne les remplace pas.

import { HEAD, CSS, BODY } from './maintenance-view.js';

const DB = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app';
const PROJECT = 'undercover-game-b0d2a';
const API_KEY = 'AIzaSyDYrmf-ThU5x0SQBdEvUy5k83LyTXxhgFA';   // clé web publique, déjà dans shared/firebase.js
const COOKIE = 'gh_admin';
const SESSION_S = 3600;
const FLAG_TTL_MS = 3000;        // l'interrupteur est relu au plus toutes les 3 s par instance
const FLAG_STALE_MS = 60000;     // base injoignable : la dernière valeur « ouvert » tient 60 s, pas plus

let flag = { open: false, at: 0, known: false };

const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export async function signSession(secret, uid, now = Date.now()) {
  const body = `${uid}.${Math.floor(now / 1000) + SESSION_S}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function checkSession(secret, value, now = Date.now()) {
  if (!secret || !value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [uid, exp, sig] = parts;
  if (!/^[A-Za-z0-9]{10,64}$/.test(uid) || !(Number(exp) > now / 1000)) return false;
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64u(sig), enc.encode(`${uid}.${exp}`));
  } catch (_) { return false; }
}

const cookieOf = (request, name) => {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
};

// Vrai si le site est ouvert. Fermé par défaut : valeur absente, illisible ou base injoignable
// (sauf dernière valeur « ouvert » récente). Une valeur `false` ou `null` = jamais réglé = ouvert,
// comme dans shared/maintenance.js.
async function siteOpen() {
  const now = Date.now();
  if (flag.known && now - flag.at < FLAG_TTL_MS) return flag.open;
  try {
    const res = await fetch(`${DB}/hub/settings/maintenance.json`, { cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const v = await res.json();
    flag = { open: v === false || v === null, at: now, known: true };
    return flag.open;
  } catch (_) {
    return flag.known && flag.open && now - flag.at < FLAG_STALE_MS;
  }
}

// Vérifie le jeton Firebase de l'utilisateur : la base le valide elle-même (?auth=) et ne
// renvoie admins/<uid> que si le jeton est bon pour cet uid. On n'accorde rien sur la foi du jeton décodé.
async function adminUid(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(unb64u(token.split('.')[1]))); } catch (_) { return null; }
  if (!claims || claims.aud !== PROJECT || typeof claims.sub !== 'string' || !(claims.exp > Date.now() / 1000)) return null;
  if (!claims.firebase || claims.firebase.sign_in_provider !== 'google.com') return null;
  const res = await fetch(`${DB}/admins/${encodeURIComponent(claims.sub)}.json?auth=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  return (await res.json()) === true ? claims.sub : null;
}

// En-têtes ajoutés aux pages servies par GitHub Pages, qui ne permet pas d'en poser.
// La politique de contenu est en mode RAPPORT : elle ne bloque rien, le navigateur signale
// seulement dans sa console (F12) ce qu'elle aurait refusé. Les pages portent des scripts en
// ligne ('unsafe-inline'), qu'il faudra sortir des pages pour pouvoir l'appliquer vraiment.
// Une fois la console propre sur tous les jeux, renommer l'en-tête en Content-Security-Policy.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://cdnjs.cloudflare.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.googleapis.com https://fr.wikipedia.org https://*.workers.dev https://tiles.openfreemap.org",
  "worker-src 'self' blob:",   // carte de l'admin (MapLibre)
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://apis.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',   // SAMEORIGIN et non DENY : Firebase Auth charge /__/auth/iframe dans la page
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=15552000',
  'Content-Security-Policy-Report-Only': CSP,
};
export function secure(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function page(status, html) {
  const retry = status === 503 ? { 'Retry-After': '300' } : {};
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE, ...retry, ...SECURITY_HEADERS } });
}

function json(status, obj, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE, ...extra } });
}

const maintenancePage = () => `<!doctype html>
<html lang="fr"><head>${HEAD}
<style>${CSS}</style></head><body>
${BODY}
<script type="module">
const $ = id => document.getElementById(id);
const msg = $('msg');
$('gear').onclick = () => { $('admin').hidden = !$('admin').hidden; $('gear').setAttribute('aria-expanded', String(!$('admin').hidden)); };
let fb;
const load = () => fb || (fb = Promise.all([
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'),
]).then(([a, au, d]) => {
  const app = a.initializeApp({ apiKey: ${JSON.stringify(API_KEY)}, authDomain: 'roulia.me', databaseURL: ${JSON.stringify(DB)}, projectId: ${JSON.stringify(PROJECT)} });
  return { au, d, auth: au.getAuth(app), db: d.getDatabase(app) };
}));
$('gear').addEventListener('click', () => load().catch(() => {}), { once: true });
$('login').onclick = async () => {
  const b = $('login'); b.disabled = true; msg.textContent = '';
  try {
    const { au, auth } = await load();
    const { user } = await au.signInWithPopup(auth, new au.GoogleAuthProvider());
    const res = await fetch('/__gh/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: await user.getIdToken() }) });
    if (!res.ok) { msg.textContent = res.status === 403 ? 'Compte non autorisé.' : 'Échec de la vérification (' + res.status + ').'; b.disabled = false; return; }
    b.hidden = true; $('reopen').hidden = false; $('enter').hidden = false; b.disabled = false;
  } catch (e) { b.disabled = false; msg.textContent = 'Connexion Google annulée ou impossible' + (e && e.code ? ' (' + e.code + ')' : '') + '.'; }
};
$('enter').onclick = () => { try { sessionStorage.setItem('gh-mx-admin', '1'); } catch (_) {} location.reload(); };
$('reopen').onclick = async () => {
  $('reopen').disabled = true;
  try {
    const { d, db } = await load();
    await d.set(d.ref(db, 'hub/settings/maintenance'), false);
    location.reload();
  } catch (e) { $('reopen').disabled = false; msg.textContent = 'Échec : ' + (e && (e.code || e.message) || e); }
};
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Cookie admin valide : le site s'ouvre pour cet appareil, maintenance ou non.
    const admin = await checkSession(env.COOKIE_SECRET, cookieOf(request, COOKIE));

    if (pathname === '/__gh/session' && request.method === 'POST') {
      if (!env.COOKIE_SECRET) return json(500, { error: 'secret manquant' });
      let body;
      try { body = await request.json(); } catch (_) { return json(400, { error: 'requête invalide' }); }
      const uid = await adminUid(body && body.token).catch(() => null);
      if (!uid) return json(403, { error: 'refusé' });
      const cookie = `${COOKIE}=${await signSession(env.COOKIE_SECRET, uid)}; Max-Age=${SESSION_S}; Path=/; HttpOnly; Secure; SameSite=Lax`;
      return json(200, { ok: true }, { 'Set-Cookie': cookie });
    }

    // Aperçu : l'écran de maintenance, tel que le voient les visiteurs, même pour l'admin ou site ouvert.
    if (pathname === '/__gh/maintenance' && request.method === 'GET') return page(200, maintenancePage());

    // Le calque de secours du site demande ici si le cookie admin est valide (HttpOnly : illisible côté page).
    if (pathname === '/__gh/session' && request.method === 'GET') return json(admin ? 200 : 401, { admin: !!admin });

    if (admin || await siteOpen()) return secure(await fetch(request));

    // Seule exception pendant la maintenance : les pages de Firebase Auth copiées dans __/auth/
    // (la connexion Google de l'admin y revient). Fichiers publics de Firebase, sans rien du site.
    if (pathname.startsWith('/__/auth/')) return secure(await fetch(request));

    return page(503, maintenancePage());
  },
};
