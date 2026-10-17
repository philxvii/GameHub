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
  --shadow-hi:0 2px 4px rgba(14,16,22,.06),0 30px 44px -20px rgba(14,16,22,.5);
  --dg-face0:#343A4C;--dg-face1:#171A24;--dg-lip0:#0D0F16;--dg-lip1:#040508;--dg-hair:rgba(0,0,0,.4);--dg-trim:rgba(255,255,255,.3);--dg-pt:#B6BBCB;--dg-pb:#FFFFFF;--dg-cav:rgba(0,0,0,.38);--dg-arc:rgba(255,255,255,.32);--dg-ground:rgba(14,16,22,.3);--dg-sheen:rgba(255,255,255,.9);
  --f:'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --gutter:clamp(20px,4vw,56px);--e-out:cubic-bezier(.22,1,.36,1);
}
:root[data-theme="dark"]{
  --bg:#0D0B12;--surface:#17141F;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.16);
  --text:#F3F1F7;--muted:#9A95A8;--accent:#F3F1F7;--on-accent:#0D0B12;--focus:#8EA6FF;--err:#FF7B63;
  --back:#1C1826;--back-line:rgba(255,255,255,.06);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 18px 34px -16px rgba(0,0,0,.85);
  --shadow-hi:0 2px 4px rgba(0,0,0,.5),0 34px 50px -20px rgba(0,0,0,.9);
  --dg-face0:#FFFFFF;--dg-face1:#E3E7EF;--dg-lip0:#8F95A9;--dg-lip1:#6A7086;--dg-hair:rgba(0,0,0,.25);--dg-trim:rgba(255,255,255,.9);--dg-pt:#07080C;--dg-pb:#2B303D;--dg-cav:rgba(14,16,22,.1);--dg-arc:rgba(255,255,255,.95);--dg-ground:rgba(0,0,0,.55);--dg-sheen:rgba(14,16,22,.5);
}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:var(--f);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:clip}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:6px}
.top{display:flex;align-items:center;justify-content:space-between;height:68px;padding:0 var(--gutter)}
  .logo{display:inline-flex;align-items:center;gap:10px;font-size:21px;line-height:1;color:var(--text);}
  .logo svg{width:34px;height:34px;flex:none;overflow:visible;}
  .logo .word{display:inline-block;letter-spacing:-.045em;filter:drop-shadow(0 3px 5px rgba(14,16,22,.14));}
  :root[data-theme="dark"] .logo .word{filter:drop-shadow(0 3px 7px rgba(0,0,0,.5));}
  .logo .l{display:inline-block;padding:.12em .09em;margin:-.12em -.09em;transform-origin:50% 62%;color:transparent;-webkit-text-fill-color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:linear-gradient(105deg,transparent 42%,var(--dg-sheen) 50%,transparent 58%),linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 46%,rgba(255,255,255,0) 70%,rgba(255,255,255,.18) 100%),linear-gradient(var(--text),var(--text));
    background-size:260% 100%,100% 100%,100% 100%;background-position:130% 0,0 0,0 0;background-repeat:no-repeat;
    transition:font-weight .5s cubic-bezier(.4,0,.2,1) calc(var(--i)*45ms)}
  .logo .g1 .l{font-weight:430;}
  .logo .g2 .l{font-weight:680;}
  .logo.on .g1 .l{font-weight:690;}
  .logo.on .g2 .l{font-weight:420;}
  .logo .die{transform-box:fill-box;transform-origin:center;}
  .logo .pip{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .38s cubic-bezier(.3,1.8,.5,1);}
  .logo .pip.on{transform:scale(1);}
  .logo.pop .die{animation:logo-pop .45s cubic-bezier(.3,1.6,.5,1);}
  .logo.tumble .l{animation:logo-tumble .85s cubic-bezier(.3,1.3,.5,1) both,logo-glint 1s ease-out both;animation-delay:calc(var(--i)*45ms),calc(var(--i)*45ms);}
  .logo.tumble .word{animation:logo-settle .85s ease-out;}
  @keyframes logo-pop{0%{transform:scale(1)}35%{transform:scale(.9,.94) rotate(-4deg)}70%{transform:scale(1.07) rotate(2deg)}100%{transform:scale(1)}}
  @keyframes logo-tumble{0%{transform:perspective(380px) rotateX(0) translateY(0)}45%{transform:perspective(380px) rotateX(200deg) translateY(-4px)}100%{transform:perspective(380px) rotateX(360deg) translateY(0)}}
  @keyframes logo-glint{from{background-position:130% 0,0 0,0 0}to{background-position:-30% 0,0 0,0 0}}
  @keyframes logo-settle{0%,100%{letter-spacing:-.045em}45%{letter-spacing:-.02em}}
  @media (prefers-reduced-motion:reduce){.logo *{animation:none!important;}.logo .l,.logo .pip{transition:none!important;}}
.theme{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--border2);background:transparent;cursor:pointer;transition:border-color .22s,transform .12s}
.theme:hover{border-color:var(--text)}.theme:active{transform:scale(.92)}
.theme svg{width:17px;height:17px}
.theme .sun{display:none}:root[data-theme="dark"] .theme .sun{display:block}:root[data-theme="dark"] .theme .moon{display:none}
main{flex:1;display:grid;place-items:center;padding:16px var(--gutter) 72px}
.stage{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:clamp(36px,8vw,120px);width:100%;max-width:940px}
.status{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--muted)}
.status i{width:7px;height:7px;border-radius:50%;background:var(--brand);animation:beat 2.2s ease-in-out infinite}
@keyframes beat{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
h1{margin:14px 0 12px;font-weight:600;font-size:clamp(36px,5vw,60px);line-height:1.02;letter-spacing:-.04em;text-wrap:balance}
.lede{max-width:31ch;text-wrap:balance;font-size:17px;color:var(--muted);letter-spacing:-.005em}
.media{position:relative;width:clamp(190px,25vw,290px);aspect-ratio:3/4;perspective:1400px}
.shade{position:absolute;left:10%;right:10%;bottom:-2%;height:26%;border-radius:50%;background:rgba(10,12,18,.5);filter:blur(16px);animation:shade 7s ease-in-out infinite}
:root[data-theme="dark"] .shade{background:rgba(0,0,0,.9)}
@keyframes shade{0%,100%{transform:scale(.92);opacity:.5}50%{transform:scale(.8);opacity:.34}}
.tilt{position:absolute;inset:0;transform-style:preserve-3d;transform:translateY(var(--lift,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) scale(var(--sc,1));transition:transform .45s var(--e-out)}
.c3d{position:absolute;inset:0;transform-style:preserve-3d;animation:drift 7s ease-in-out infinite}
@keyframes drift{0%,100%{transform:translateY(0) rotateX(4deg) rotateY(-9deg)}50%{transform:translateY(-12px) rotateX(2deg) rotateY(9deg)}}
.flip{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(180deg);animation:flip 1.4s .4s var(--e-out) forwards}
@keyframes flip{to{transform:rotateY(0)}}
.face{position:absolute;inset:0;border-radius:24px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:var(--shadow)}
:root[data-theme="dark"] .face{box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 0 0 1px rgba(255,255,255,.05),var(--shadow)}
.back{transform:rotateY(180deg);background:repeating-linear-gradient(0deg,var(--back-line) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,var(--back-line) 0 1px,transparent 1px 12px),var(--back)}
.back svg{position:absolute;left:50%;top:50%;width:34%;transform:translate(-50%,-50%)}
.back .lip{display:none}.back .face-d{fill:none;stroke:#fff;stroke-width:1.2}.back .pip{fill:#fff}.back .pip.o{fill:var(--brand)}
.front{background:#0b0a0d}
.front img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(var(--is,1));transition:transform .7s var(--e-out)}
.front::after{content:'';position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0;transition:opacity .35s;background:radial-gradient(circle at var(--mx,50%) var(--my,30%),rgba(255,255,255,.22),rgba(255,255,255,0) 55%);mix-blend-mode:soft-light}
.face{transition:box-shadow .4s var(--e-out)}
.shade{transition:filter .4s var(--e-out),left .4s var(--e-out),right .4s var(--e-out)}
.front::before{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(to bottom,rgba(0,0,0,0) 55%,rgba(0,0,0,.72) 100%)}
.cap{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;padding:0 clamp(14px,7cqi,24px) clamp(13px,6.5cqi,22px);color:#fff}
.media{container-type:inline-size}
.name{font-weight:600;font-size:clamp(17px,7.4cqi,26px);letter-spacing:-.025em;line-height:1.15;text-shadow:0 1px 12px rgba(0,0,0,.35)}
.sub{font-size:14.5px;color:rgba(255,255,255,.78);white-space:nowrap}
.glint{position:absolute;inset:-10% -40%;z-index:3;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.1) 50%,transparent 58%);mix-blend-mode:screen;animation:glint 7s 1.8s ease-in-out infinite}
@keyframes glint{0%,55%{transform:translateX(-60%)}85%,100%{transform:translateX(60%)}}
.gear{position:fixed;right:16px;bottom:16px;display:inline-grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--muted);opacity:.5;cursor:pointer;transition:opacity .22s,transform .7s var(--e-out)}
.gear:hover,.gear[aria-expanded="true"]{opacity:1}.gear:hover{transform:rotate(60deg)}
.gear svg{width:17px;height:17px}
.panel{position:fixed;right:16px;bottom:60px;width:min(320px,calc(100vw - 32px));display:grid;gap:8px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow)}
.panel h2{font-size:15px;font-weight:600;letter-spacing:-.01em;margin-bottom:2px}
.btn{width:100%;padding:12px;border:1px solid var(--border2);border-radius:10px;background:transparent;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .22s,transform .12s}
.btn:hover{opacity:.88}.btn:active{transform:scale(.98)}.btn:disabled{opacity:.5;cursor:wait}
.btn.main{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#msg{min-height:1.2em;font-size:13px;line-height:1.5;color:var(--err);word-break:break-word}
@media (hover:hover) and (pointer:fine){
  .media.is-hover .tilt{--lift:-10px;--sc:1.015}
  .media.is-hover .front::after{opacity:1}
  .media.is-hover .face{box-shadow:var(--shadow-hi)}
  .media.is-hover .front img{--is:1.04}
  .media.is-hover .shade{filter:blur(22px);left:6%;right:6%}
  .media.is-hover .c3d,.media.is-hover .shade{animation-play-state:paused}
}
@media (max-width:720px){
  .stage{grid-template-columns:1fr;justify-items:center;text-align:center;gap:34px}
  .media{order:-1;width:min(52vw,220px)}
  .lede{margin:0 auto}
}
@media (prefers-reduced-motion:reduce){.c3d,.shade,.glint,.status i,.flip{animation:none}.c3d{transform:rotateX(3deg) rotateY(-6deg)}.flip{transform:none}}
`;

const DIE = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="lip" x="3" y="3.5" width="26" height="26" rx="8.4"/><rect class="face face-d" x="3" y="2" width="26" height="26" rx="8.4"/><circle class="pip" cx="10.2" cy="8.2" r="2.8"/><circle class="pip o" cx="16" cy="15" r="2.8"/><circle class="pip" cx="21.8" cy="21.8" r="2.8"/></svg>`;
const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

// Les identifiants (admin, login, reopen, enter, msg, gear) sont ceux du script du Worker.
export const BODY = `<header class="top">
  <span class="logo" id="logo" tabindex="0"><svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="dg-fa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--dg-face0)"/><stop offset="1" style="stop-color:var(--dg-face1)"/></linearGradient><linearGradient id="dg-li" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--dg-lip0)"/><stop offset="1" style="stop-color:var(--dg-lip1)"/></linearGradient><linearGradient id="dg-pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--dg-pt)"/><stop offset="1" style="stop-color:var(--dg-pb)"/></linearGradient><linearGradient id="dg-og" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E24527"/><stop offset="1" stop-color="#FF7A5C"/></linearGradient><filter id="dg-bl" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation=".7"/></filter></defs><ellipse class="shadow" filter="url(#dg-bl)" cx="16" cy="30.8" rx="10" ry="1.5" style="fill:var(--dg-ground)"/><g class="die"><rect x="3" y="3.5" width="26" height="26" rx="8.4" fill="url(#dg-li)"/><rect x="3" y="2" width="26" height="26" rx="8.4" fill="url(#dg-fa)"/><rect x="3.6" y="2.6" width="24.8" height="24.8" rx="7.8" fill="none" style="stroke:var(--dg-trim)" stroke-width=".8"/><rect x="3" y="2" width="26" height="26" rx="8.4" fill="none" style="stroke:var(--dg-hair)" stroke-width=".7"/><g><g class="pip on" data-k="TL"><circle cx="10.2" cy="8.2" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="10.2" cy="8.2" r="2.55" fill="url(#dg-pg)"/><path d="M7.5 8.8 A2.8 2.8 0 0 0 12.9 8.8" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip" data-k="TR"><circle cx="21.8" cy="8.2" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="21.8" cy="8.2" r="2.55" fill="url(#dg-pg)"/><path d="M19.1 8.8 A2.8 2.8 0 0 0 24.5 8.8" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip" data-k="ML"><circle cx="10.2" cy="15" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="10.2" cy="15" r="2.55" fill="url(#dg-pg)"/><path d="M7.5 15.6 A2.8 2.8 0 0 0 12.9 15.6" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip" data-k="MR"><circle cx="21.8" cy="15" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="21.8" cy="15" r="2.55" fill="url(#dg-pg)"/><path d="M19.1 15.6 A2.8 2.8 0 0 0 24.5 15.6" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip" data-k="BL"><circle cx="10.2" cy="21.8" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="10.2" cy="21.8" r="2.55" fill="url(#dg-pg)"/><path d="M7.5 22.4 A2.8 2.8 0 0 0 12.9 22.4" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip on" data-k="BR"><circle cx="21.8" cy="21.8" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="21.8" cy="21.8" r="2.55" fill="url(#dg-pg)"/><path d="M19.1 22.4 A2.8 2.8 0 0 0 24.5 22.4" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g><g class="pip on" data-k="C"><circle cx="16" cy="15" r="3" style="fill:var(--dg-cav)"/><circle class="bead" cx="16" cy="15" r="2.85" fill="url(#dg-og)"/><path d="M13.3 15.6 A2.8 2.8 0 0 0 18.7 15.6" fill="none" style="stroke:var(--dg-arc)" stroke-width=".5" stroke-linecap="round"/></g></g></g></svg><span class="word" aria-hidden="true"><span class="g1"><span class="l" style="--i:0">G</span><span class="l" style="--i:1">a</span><span class="l" style="--i:2">m</span><span class="l" style="--i:3">e</span></span><span class="g2"><span class="l" style="--i:4">H</span><span class="l" style="--i:5">u</span><span class="l" style="--i:6">b</span></span></span></span>
  <button class="theme" id="theme" type="button" aria-label="Changer de thème">
    <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
    <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
  </button>
</header>
<main>
  <div class="stage">
    <div class="copy">
      <span class="status"><i></i>Maintenance en cours</span>
      <h1>On revient vite.</h1>
      <p class="lede">Une petite maintenance est en cours. Les parties reprennent dès que tout est prêt.</p>
    </div>
    <div class="media">
      <div class="shade"></div>
      <div class="tilt"><div class="c3d"><div class="flip">
        <div class="face back">${DIE}</div>
        <div class="face front"><img src="${ART}" alt="" width="720" height="960"><div class="cap"><span class="name">Maintenance</span><span class="sub">Retour très bientôt</span></div><div class="glint"></div></div>
      </div></div></div>
    </div>
  </div>
</main>
<div class="panel" id="admin" hidden>
  <h2>Administration</h2>
  <button class="btn main" id="login" type="button">Se connecter avec Google</button>
  <button class="btn main" id="reopen" type="button" hidden>Réactiver le site</button>
  <button class="btn" id="enter" type="button" hidden>Entrer quand même (admin)</button>
  <div id="msg" aria-live="polite"></div>
</div>
<button class="gear" id="gear" type="button" aria-label="Administration" aria-expanded="false" aria-controls="admin">${GEAR}</button>
<script>
document.getElementById('theme').onclick = function () {
  var d = document.documentElement, t = d.dataset.theme === 'dark' ? 'light' : 'dark';
  d.dataset.theme = t;
  try { localStorage.setItem('gh-theme', t); } catch (e) {}
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#0D0B12' : '#F5F6F8';
};
</script>
<script>
/* Logo : le dé garde la face 3 ; au survol il en prend une autre, et revient sur la 3 après 3 s sans action. */
(() => {
  const logo = document.getElementById('logo');
  if (!logo) return;
  const svg = logo.querySelector('svg');
  const FACES = {1:['C'],2:['TL','BR'],3:['TL','C','BR'],4:['TL','TR','BL','BR'],5:['TL','TR','C','BL','BR'],6:['TL','TR','ML','MR','BL','BR']};
  const ACC = {1:'C',2:'BR',3:'C',4:'TR',5:'C',6:'TR'};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let face = 3, idle = 0;
  function setFace(n) {
    face = n;
    svg.querySelectorAll('.pip').forEach(p => {
      const k = p.dataset.k, acc = k === ACC[n], b = p.querySelector('.bead');
      p.classList.toggle('on', FACES[n].includes(k));
      b.setAttribute('fill', \`url(#\${acc ? 'dg-og' : 'dg-pg'})\`);
      b.setAttribute('r', acc ? 2.85 : 2.55);
    });
  }
  function replay(cls, ms) {
    logo.classList.remove(cls); void logo.offsetWidth; logo.classList.add(cls);
    setTimeout(() => logo.classList.remove(cls), ms);
  }
  const rearm = () => { clearTimeout(idle); idle = setTimeout(() => { if (face !== 3) { setFace(3); if (!reduce.matches) replay('pop', 480); } }, 3000); };
  function enter() {
    logo.classList.add('on');
    if (reduce.matches) { rearm(); return; }
    let n; do { n = 1 + Math.floor(Math.random() * 6); } while (n === face);
    setFace(n); replay('pop', 480); replay('tumble', 1250); rearm();
  }
  const leave = () => { logo.classList.remove('on'); rearm(); };
  logo.addEventListener('pointerenter', enter);
  logo.addEventListener('pointerleave', leave);
  logo.addEventListener('focus', enter);
  logo.addEventListener('blur', leave);
  logo.addEventListener('pointermove', rearm);
})();
</script>
<script>
(function () {
  var m = document.querySelector('.media');
  var fine = matchMedia('(hover:hover) and (pointer:fine)'), calm = matchMedia('(prefers-reduced-motion: reduce)');
  if (!m) return;
  m.addEventListener('pointerenter', function () { if (fine.matches) m.classList.add('is-hover'); });
  m.addEventListener('pointermove', function (e) {
    if (!fine.matches) return;
    var r = m.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, st = m.style;
    if (!calm.matches) { st.setProperty('--rx', ((0.5 - y) * 10) + 'deg'); st.setProperty('--ry', ((x - 0.5) * 12) + 'deg'); }
    st.setProperty('--mx', (x * 100) + '%'); st.setProperty('--my', (y * 100) + '%');
  });
  m.addEventListener('pointerleave', function () {
    m.classList.remove('is-hover');
    ['--rx', '--ry'].forEach(function (k) { m.style.removeProperty(k); });
  });
})();
</script>`;
