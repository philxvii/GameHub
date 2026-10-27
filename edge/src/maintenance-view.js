// Écran de maintenance : même langage visuel que le hub (home.html, shared/design) —
// Instrument Sans, fond neutre clair ou sombre, le dé du logo, le dos d'une carte.
// Autonome : pendant la maintenance rien d'autre n'est servi (ni image, ni feuille de style).
import { ART } from './maintenance-art.js';

// Le calque de secours de shared/maintenance.js reprend ces mêmes valeurs : les garder alignées.

export const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#F5F6F8">
<title>Site en maintenance</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='3.6' width='28' height='28' rx='9' fill='%23040508'/%3E%3Crect x='2' y='1.6' width='28' height='28' rx='9' fill='%232A3040'/%3E%3Ccircle cx='9.6' cy='8.6' r='3' fill='%23F3F1F7'/%3E%3Ccircle cx='16' cy='15.6' r='3.4' fill='%23FF5A3C'/%3E%3Ccircle cx='22.4' cy='22.6' r='3' fill='%23F3F1F7'/%3E%3C/svg%3E">
<script>
(function () {
  var t = null;
  try { t = localStorage.getItem('gh-theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  if (t === 'dark') document.querySelector('meta[name="theme-color"]').content = '#0D0B12';
})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&display=swap" rel="stylesheet">`;

export const CSS = `
:root{
  --bg:#F5F6F8;--surface:#FFFFFF;--border:rgba(14,16,22,.08);--border2:rgba(14,16,22,.16);
  --text:#0E1016;--muted:#686D79;--accent:#0E1016;--on-accent:#FFFFFF;--brand:#FF5A3C;--focus:#2F5BE3;--err:#D2402A;
  --back:#111318;--back-line:rgba(255,255,255,.07);
  --shadow:0 1px 2px rgba(14,16,22,.06),0 14px 28px -16px rgba(14,16,22,.38);
  --f:'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --gutter:clamp(20px,4vw,56px);--e-out:cubic-bezier(.22,1,.36,1);
}
:root[data-theme="dark"]{
  --bg:#0D0B12;--surface:#17141F;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.16);
  --text:#F3F1F7;--muted:#9A95A8;--accent:#F3F1F7;--on-accent:#0D0B12;--focus:#8EA6FF;--err:#FF7B63;
  --back:#1C1826;--back-line:rgba(255,255,255,.06);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 18px 34px -16px rgba(0,0,0,.85);
}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:var(--f);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:clip}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:6px}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding-left:var(--gutter);padding-right:var(--gutter)}
.top{display:flex;align-items:center;justify-content:space-between;height:68px}
.logo{display:inline-flex;align-items:center;gap:10px;font-size:21px;line-height:1;letter-spacing:-.045em}
.logo svg{width:34px;height:34px;flex:none}
.logo span{font-weight:430}.logo b{font-weight:690}
.theme{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--border2);background:transparent;cursor:pointer;transition:border-color .22s,transform .12s}
.theme:hover{border-color:var(--text)}.theme:active{transform:scale(.92)}
.theme svg{width:17px;height:17px}
.theme .sun{display:none}:root[data-theme="dark"] .theme .sun{display:block}:root[data-theme="dark"] .theme .moon{display:none}
main{flex:1;display:flex;align-items:center;justify-content:space-between;gap:48px 72px;padding-top:24px;padding-bottom:56px}
.copy{max-width:470px}
.status{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--muted)}
.status i{width:7px;height:7px;border-radius:50%;background:var(--brand)}
h1{margin:12px 0 0;font-weight:600;font-size:clamp(40px,5.2vw,68px);line-height:1;letter-spacing:-.04em}
.lede{margin-top:14px;font-size:17px;color:var(--muted);letter-spacing:-.005em}
.media{position:relative;flex:none;width:min(300px,34vw);aspect-ratio:3/4;perspective:1400px}
.art{position:absolute;inset:0;border-radius:24px;overflow:hidden;box-shadow:var(--shadow);animation:drift 7s ease-in-out infinite;
  background:repeating-linear-gradient(0deg,var(--back-line) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,var(--back-line) 0 1px,transparent 1px 12px),var(--back)}
.art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.glint{position:absolute;inset:-10% -40%;z-index:3;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.1) 50%,transparent 58%);mix-blend-mode:screen;animation:glint 7s 1.8s ease-in-out infinite}
@keyframes glint{0%,55%{transform:translateX(-60%)}85%,100%{transform:translateX(60%)}}
@keyframes drift{0%,100%{transform:translateY(0) rotateX(4deg) rotateY(-9deg)}50%{transform:translateY(-12px) rotateX(2deg) rotateY(9deg)}}
.foot{border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 24px;min-height:68px;padding-top:12px;padding-bottom:12px;color:var(--muted)}
.ft-id{display:inline-flex;align-items:center;gap:5px;font-size:14px}
.ft-home{display:inline-flex;align-items:center;gap:10px}
.ft-home i{position:relative;flex:none;width:26px;height:26px;border-radius:8px;background:var(--back);opacity:.7}
.ft-home i svg{position:absolute;left:50%;top:50%;width:60%;transform:translate(-50%,-50%)}
.ft-home b{font-weight:600;letter-spacing:-.02em}
.ft-me{font-size:12px;letter-spacing:.02em}
.gear{display:inline-grid;place-items:center;width:28px;height:28px;border:0;background:transparent;color:var(--muted);opacity:.6;cursor:pointer;transition:opacity .22s,transform .7s var(--e-out)}
.gear:hover,.gear[aria-expanded="true"]{opacity:1;color:var(--text)}.gear:hover{transform:rotate(60deg)}
.gear svg{width:15px;height:15px}
.panel{position:fixed;right:16px;bottom:72px;width:min(320px,calc(100vw - 32px));display:grid;gap:8px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow)}
.panel h2{font-size:15px;font-weight:600;letter-spacing:-.01em;margin-bottom:2px}
.btn{width:100%;padding:12px;border:1px solid var(--border2);border-radius:10px;background:transparent;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .22s,transform .12s}
.btn:hover{opacity:.88}.btn:active{transform:scale(.98)}.btn:disabled{opacity:.5;cursor:wait}
.btn.main{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#msg{min-height:1.2em;font-size:13px;line-height:1.5;color:var(--err);word-break:break-word}
@media (max-width:760px){
  :root{--gutter:16px}
  .top{height:60px}.logo{font-size:19px}.logo svg{width:30px;height:30px}
  main{flex-direction:column-reverse;justify-content:center;align-items:flex-start;gap:36px;padding-top:12px;padding-bottom:40px}
  .media{width:min(190px,52vw);align-self:center}.art{border-radius:16px}
  h1{font-size:44px}.lede{font-size:16px}
}
@media (prefers-reduced-motion:reduce){.art{animation:none}.glint{animation:none;opacity:0}}
`;

const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="8.4" fill="currentColor"/><g style="fill:var(--bg)"><circle cx="10.2" cy="9.2" r="2.5"/><circle cx="21.8" cy="22.8" r="2.5"/></g><circle cx="16" cy="16" r="2.7" fill="#FF5A3C"/></svg>`;
const DIE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="8" cy="8" r="1.7" fill="#fff"/><circle cx="12" cy="12" r="1.7" fill="#FF5A3C"/><circle cx="16" cy="16" r="1.7" fill="#fff"/></svg>`;

// Les identifiants (admin, login, reopen, enter, msg, gear) sont ceux du script du Worker.
export const BODY = `<header class="wrap top">
  <span class="logo">${MARK}<span>Game<b>Hub</b></span></span>
  <button class="theme" id="theme" type="button" aria-label="Changer de thème">
    <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
    <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
  </button>
</header>
<main class="wrap">
  <div class="copy">
    <span class="status"><i></i>Maintenance en cours</span>
    <h1>On revient vite.</h1>
    <p class="lede">Une petite maintenance est en cours. Les parties reprennent dès que tout est prêt.</p>
  </div>
  <div class="media" aria-hidden="true"><div class="art"><img src="${ART}" alt="" width="720" height="960"><div class="glint"></div></div></div>
</main>
<div class="panel" id="admin" hidden>
  <h2>Administration</h2>
  <button class="btn main" id="login" type="button">Se connecter avec Google</button>
  <button class="btn main" id="reopen" type="button" hidden>Réactiver le site</button>
  <button class="btn" id="enter" type="button" hidden>Entrer quand même (admin)</button>
  <div id="msg" aria-live="polite"></div>
</div>
<footer class="wrap foot">
  <span class="ft-id"><span class="ft-home"><i aria-hidden="true">${DIE}</i><b>GameHub</b></span><span>· par <span class="ft-me">XVIIUUU</span></span></span>
  <button class="gear" id="gear" type="button" aria-label="Administration" aria-expanded="false" aria-controls="admin">${GEAR}</button>
</footer>
<script>
document.getElementById('theme').onclick = function () {
  var d = document.documentElement, t = d.dataset.theme === 'dark' ? 'light' : 'dark';
  d.dataset.theme = t;
  try { localStorage.setItem('gh-theme', t); } catch (e) {}
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#0D0B12' : '#F5F6F8';
};
</script>`;
