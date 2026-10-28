// Maintenance du site : interrupteur hub/settings/maintenance dans Firebase.
//
// Chaque page commence masquée (<style id="mx-guard">, juste avant ce script) et ne
// s'affiche que si la base confirme que le site est ouvert : script bloqué, base
// injoignable ou réponse douteuse laissent la page fermée. En maintenance, la page est
// vidée (pas seulement recouverte) et le reste. L'engrenage connecte l'admin (Google) :
// « Réactiver le site » ou « Entrer quand même », accès revérifié auprès de la base à
// chaque chargement. Les règles de la base refusent de toute façon toute lecture et
// écriture aux autres comptes tant que l'interrupteur est activé.
(function () {
  var base = document.currentScript.src;
  var store = function (s, k, v) {
    try { if (v === undefined) return s.getItem(k); if (v === null) s.removeItem(k); else s.setItem(k, v); } catch (e) {}
    return null;
  };
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var EMU = LOCAL && (new URLSearchParams(location.search).has('emu') || store(sessionStorage, 'gh-emu'));
  var DB = EMU
    ? 'http://127.0.0.1:9000/'
    : 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/';
  var NS = EMU ? '?ns=undercover-game-b0d2a-default-rtdb' : '';
  var FLAG = DB + 'hub/settings/maintenance.json' + NS;
  // Jeu masqué par l'admin (hub/hidden/<id>) : la page du jeu se ferme comme en maintenance.
  // Le dossier du jeu n'est pas toujours son identifiant dans hub/hidden (liste GAMES de home.html).
  var DIR_ID = { 'qui-est-ce': 'quiestce', 'bataille-navale': 'bataille', 'mini-golf': 'minigolf', 'mini-subway': 'minisubway', 'mauvais-perdants': 'mauvaisperdants' };
  var dir = (location.pathname.match(/\/games\/([^\/]+)\//) || [])[1];
  var GAME = dir && (DIR_ID[dir] || dir);
  var ADMIN_HINT = 'gh-mx-admin';  // l'admin a demandé à entrer : revérifié à chaque chargement
  var root = document.documentElement;
  var state = 'pending';           // pending → open | admin | locked
  var mx = null;

  var css = document.createElement('style');
  // Même aspect que l'écran du Worker (edge/src/maintenance-view.js) : garder les deux alignés.
  css.textContent = [
    'html.mx-on,html.mx-on body{overflow:hidden!important;visibility:visible!important}',
    '#mx{--bg:#F5F6F8;--surface:#FFFFFF;--border:rgba(14,16,22,.08);--border2:rgba(14,16,22,.16);--text:#0E1016;--muted:#686D79;--accent:#0E1016;--on-accent:#FFFFFF;--brand:#FF5A3C;--err:#D2402A;--back:#111318;--back-line:rgba(255,255,255,.07);--shadow:0 1px 2px rgba(14,16,22,.06),0 14px 28px -16px rgba(14,16,22,.38);--dot:rgba(14,16,22,.13);--glow:.2}',
    '#mx[data-theme=dark]{--dot:rgba(255,255,255,.1);--glow:.3;--bg:#0D0B12;--surface:#17141F;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.16);--text:#F3F1F7;--muted:#9A95A8;--accent:#F3F1F7;--on-accent:#0D0B12;--err:#FF7B63;--back:#1C1826;--back-line:rgba(255,255,255,.06);--shadow:0 1px 2px rgba(0,0,0,.5),0 18px 34px -16px rgba(0,0,0,.85)}',
    // Mise en page de la 404 du hub : en-tête (logo, thème), texte à gauche, carte inclinée à droite, pied de page.
    '#mx{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:var(--bg);color:var(--text);--gutter:clamp(20px,4vw,56px);',
    'font:16px/1.5 "Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;overflow-y:auto;visibility:visible;-webkit-font-smoothing:antialiased}',
    '#mx *{box-sizing:border-box;margin:0}',
    '#mx a{color:inherit;text-decoration:none}',
    '#mx .mx-wrap{width:100%;max-width:calc(2112px + 2 * var(--gutter));margin:0 auto;padding-left:var(--gutter);padding-right:var(--gutter)}',
    '#mx .mx-top{display:flex;align-items:center;justify-content:space-between;height:68px;flex:none}',
    '#mx .mx-tools{display:flex;align-items:center;gap:8px}',
    '#mx .mx-logo{display:inline-flex;align-items:center;gap:10px;font-size:21px;line-height:1;letter-spacing:-.045em}',
    '#mx .mx-logo svg{width:34px;height:34px;flex:none}',
    '#mx .mx-logo svg{overflow:visible}#mx .mx-logo .g1{font-weight:430}#mx .mx-logo .g2{font-weight:690}',
    '#mx .mx-logo .l{display:inline-block;transform-origin:50% 62%}',
    '#mx .die{transform-box:fill-box;transform-origin:center}',
    '#mx .pips circle{transform-box:fill-box;transform-origin:center;transition:transform .38s cubic-bezier(.3,1.8,.5,1)}',
    '#mx .pips circle:not(.on){transform:scale(0)}#mx .pips .acc{fill:#FF5A3C}',
    '#mx .mx-logo.pop .die{animation:mx-logo-pop .45s cubic-bezier(.3,1.6,.5,1)}',
    '#mx .mx-logo.tumble .l{animation:mx-logo-tumble .85s cubic-bezier(.3,1.3,.5,1) both;animation-delay:calc(var(--i)*45ms)}',
    '@keyframes mx-logo-pop{0%{transform:scale(1)}35%{transform:scale(.9,.94) rotate(-4deg)}70%{transform:scale(1.07) rotate(2deg)}100%{transform:scale(1)}}',
    '@keyframes mx-logo-tumble{0%{transform:perspective(380px) rotateX(0) translateY(0)}45%{transform:perspective(380px) rotateX(200deg) translateY(-4px)}100%{transform:perspective(380px) rotateX(360deg) translateY(0)}}',
    '#mx .mx-ico{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:1px solid var(--border2);background:transparent;color:var(--text);cursor:pointer;transition:border-color .22s}',
    '#mx .mx-ico:hover{border-color:var(--text)}',
    '#mx .mx-ico svg{width:17px;height:17px}',
    '#mx .mx-sun{display:none}#mx[data-theme=dark] .mx-sun{display:block}#mx[data-theme=dark] .mx-moon{display:none}',
    '#mx .mx-lost{flex:1;display:flex;align-items:center;justify-content:center;gap:48px clamp(72px,9vw,150px);padding-top:24px;padding-bottom:56px}',
    '#mx .mx-copy{max-width:660px}',
    '#mx .mx-media{position:relative;flex:none;width:min(360px,34vw);aspect-ratio:3/4;perspective:1400px;animation:mx-rise 1.1s .12s cubic-bezier(.22,1,.36,1) both}',
    '#mx .mx-art{position:absolute;inset:0;border-radius:24px;overflow:hidden;box-shadow:var(--shadow);animation:mx-drift 7s ease-in-out infinite;',
    'background:repeating-linear-gradient(0deg,var(--back-line) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,var(--back-line) 0 1px,transparent 1px 12px),var(--back)}',
    '#mx .mx-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '#mx .mx-art svg{position:absolute;left:50%;top:50%;width:22%;transform:translate(-50%,-50%)}',
    '#mx .mx-glint{position:absolute;inset:-10% -40%;z-index:3;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.1) 50%,transparent 58%);mix-blend-mode:screen;animation:mx-glint 7s 1.8s ease-in-out infinite}',
    '@keyframes mx-glint{0%,55%{transform:translateX(-60%)}85%,100%{transform:translateX(60%)}}',
    '@keyframes mx-drift{0%,100%{transform:translateY(0) rotateX(4deg) rotateY(-9deg)}50%{transform:translateY(-12px) rotateX(2deg) rotateY(9deg)}}',
    '#mx .mx-status{display:inline-flex;align-items:center;gap:10px;padding:7px 15px 7px 13px;border:1px solid var(--border2);border-radius:999px;background:var(--surface);font-size:13.5px;font-weight:500;color:var(--muted)}',
    '#mx .mx-status i{width:7px;height:7px;border-radius:50%;background:var(--brand);animation:mx-pulse 2.4s ease-out infinite}',
    '@keyframes mx-pulse{0%{box-shadow:0 0 0 0 rgba(255,90,60,.55)}70%,100%{box-shadow:0 0 0 9px rgba(255,90,60,0)}}',
    '#mx h1{margin:24px 0 0;font-weight:600;font-size:clamp(46px,6vw,88px);line-height:.98;letter-spacing:-.045em}',
    '#mx p{margin-top:20px;max-width:420px;font-size:18px;color:var(--muted);letter-spacing:-.005em}',
    '#mx .mx-bar{position:relative;width:min(230px,62vw);height:3px;margin-top:40px;border-radius:3px;background:var(--border2)}',
    '#mx .mx-bar::before{content:"";position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--brand);animation:mx-roll-fill 3.2s cubic-bezier(.65,0,.35,1) infinite alternate}',
    '#mx .mx-bar i{position:absolute;left:0;top:50%;width:28px;height:28px;margin-top:-14px;animation:mx-roll 3.2s cubic-bezier(.65,0,.35,1) infinite alternate;filter:drop-shadow(0 4px 6px rgba(14,16,22,.28))}',
    '#mx .mx-bar i svg{display:block;width:100%;height:100%;color:var(--text)}',
    '@keyframes mx-roll{from{left:0;transform:rotate(0)}to{left:calc(100% - 28px);transform:rotate(540deg)}}',
    '@keyframes mx-roll-fill{from{width:14px}to{width:calc(100% - 14px)}}',
    '@keyframes mx-pop{from{opacity:0;transform:translateY(8px) scale(.96)}}',
    '@keyframes mx-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}',
    '#mx .mx-copy>*{animation:mx-rise .9s cubic-bezier(.22,1,.36,1) both}',
    '#mx .mx-copy>:nth-child(2){animation-delay:.08s}#mx .mx-copy>:nth-child(3){animation-delay:.16s}#mx .mx-copy>:nth-child(4){animation-delay:.26s}',
    '#mx::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at 1px 1px,var(--dot) 1.2px,transparent 0) 0 0/30px 30px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 50%,#000 15%,transparent 78%);mask-image:radial-gradient(ellipse 70% 60% at 50% 50%,#000 15%,transparent 78%)}',
    '#mx .mx-media::before{content:"";position:absolute;inset:-28%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,90,60,var(--glow)),transparent);filter:blur(28px);pointer-events:none}',
    '#mx .mx-tilt{position:absolute;inset:0;transition:transform .5s cubic-bezier(.22,1,.36,1);transform:rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg))}',
    '#mx .mx-actions{margin-top:28px}',
    '#mx button.mx-pill{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-size:15px;font-weight:600;background:var(--accent);color:var(--on-accent);cursor:pointer;transition:opacity .22s,transform .12s}',
    '#mx button.mx-pill:hover{opacity:.88}#mx button.mx-pill:active{transform:scale(.97)}',
    // Pied de page du hub : le dé, « GameHub · par … », puis Confidentialité et l'engrenage.
    '#mx .mx-foot{border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 24px;min-height:68px;padding-top:12px;padding-bottom:12px;color:var(--muted);flex:none}',
    '#mx .mx-id{display:inline-flex;align-items:center;gap:5px;font-size:14px}',
    '#mx .mx-home{display:inline-flex;align-items:center;gap:10px}',
    '#mx .mx-home i{position:relative;flex:none;width:26px;height:26px;border-radius:8px;background:var(--back);opacity:.7;transition:opacity .22s}',
    '#mx .mx-home i svg{position:absolute;left:50%;top:50%;width:60%;transform:translate(-50%,-50%)}',
    '#mx .mx-home:hover i{opacity:1}',
    '#mx .mx-home b{font-weight:600;letter-spacing:-.02em}',
    '#mx .mx-me{font-size:12px;letter-spacing:.02em}',
    '#mx .mx-end{display:flex;align-items:center;gap:18px}',
    '#mx .mx-end a{font-size:13px;transition:color .22s}#mx .mx-end a:hover,#mx .mx-home:hover b{color:var(--text)}',
    '#mx .mx-gear{display:inline-grid;place-items:center;width:28px;height:28px;border:0;background:transparent;color:var(--muted);opacity:.6;cursor:pointer;transition:opacity .22s,transform .7s}',
    '#mx .mx-gear:hover{opacity:1;color:var(--text);transform:rotate(60deg)}',
    '#mx .mx-gear svg{width:15px;height:15px}',
    '#mx [hidden]{display:none!important}',
    '#mx .mx-admin{position:fixed;right:var(--gutter);bottom:72px;z-index:5;transform-origin:100% 100%;animation:mx-pop .32s cubic-bezier(.22,1,.36,1);display:grid;gap:8px;width:min(320px,calc(100vw - 2 * var(--gutter)));padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow)}',
    '#mx button.mx-btn{width:100%;padding:12px;border:1px solid var(--border2);border-radius:10px;background:transparent;color:var(--text);font:inherit;font-size:15px;font-weight:600;cursor:pointer}',
    '#mx button.mx-btn.mx-main{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}',
    '#mx button.mx-btn:disabled{opacity:.5;cursor:wait}',
    '#mx .mx-msg{font-size:13px;color:var(--err);min-height:1.2em;word-break:break-word}',
    '#mx-badge{position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:8px;background:rgba(27,36,32,.28);color:#f4ecd8;',
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:600 12px/1.3 system-ui,sans-serif;opacity:.55;pointer-events:none}',
    '@media (max-width:760px){#mx{--gutter:16px;overflow:hidden}#mx .mx-top{height:60px}#mx .mx-logo{font-size:19px}#mx .mx-logo svg{width:30px;height:30px}',
    '#mx .mx-lost{flex-direction:column-reverse;justify-content:center;align-items:stretch;gap:clamp(16px,4dvh,40px);min-height:0;padding-top:0;padding-bottom:clamp(12px,4dvh,40px)}',
    '#mx .mx-copy{display:flex;flex-direction:column;align-items:center;text-align:center;max-width:none}',
    '#mx .mx-media{height:min(300px,36dvh);width:auto;flex:none;margin:0 auto}#mx .mx-art{border-radius:20px}#mx .mx-media::before{inset:-14%}',
    '#mx h1{font-size:clamp(34px,11vw,48px);margin-top:clamp(12px,2.4dvh,22px)}#mx p{font-size:16px;margin-top:clamp(8px,1.6dvh,16px);max-width:300px}#mx .mx-bar{margin-top:clamp(16px,3.5dvh,32px)}}',
    '@media (prefers-reduced-motion:reduce){#mx .mx-logo *{animation:none!important}#mx .mx-art,#mx .mx-copy>*,#mx .mx-media,#mx .mx-status i,#mx .mx-bar::before,#mx .mx-bar i{animation:none}#mx .mx-bar::before{width:50%}#mx .mx-bar i{left:calc(50% - 14px)}#mx .mx-tilt{transition:none;transform:none!important}#mx .mx-glint{animation:none;opacity:0}}',
  ].join('');
  document.head.appendChild(css);

  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><g class="die"><rect x="3" y="3" width="26" height="26" rx="8.4" fill="currentColor"/><g class="pips" style="fill:var(--bg)"><circle class="on" data-k="TL" cx="10.2" cy="9.2" r="2.5"/><circle data-k="TR" cx="21.8" cy="9.2" r="2.5"/><circle data-k="ML" cx="10.2" cy="16" r="2.5"/><circle data-k="MR" cx="21.8" cy="16" r="2.5"/><circle data-k="BL" cx="10.2" cy="22.8" r="2.5"/><circle class="on" data-k="BR" cx="21.8" cy="22.8" r="2.5"/><circle class="on acc" data-k="C" cx="16" cy="16" r="2.7"/></g></g></svg>';
  var letters = function (s, from) { return s.split('').map(function (c, i) { return '<span class="l" style="--i:' + (from + i) + '">' + c + '</span>'; }).join(''); };
  var WORD = '<span class="g1">' + letters('Game', 0) + '</span><span class="g2">' + letters('Hub', 4) + '</span>';
  var DIE = '<svg viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="8" cy="8" r="1.7" fill="#fff"/><circle cx="12" cy="12" r="1.7" fill="#FF5A3C"/><circle cx="16" cy="16" r="1.7" fill="#fff"/></svg>';
  var THEME = '<svg class="mx-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><svg class="mx-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var GEAR ='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  // Même effet que le logo de l'accueil : au survol le dé change de face et les lettres culbutent.
  function logoFx(logo) {
    {
      if (!logo) return;
      var FACES = { 1: ['C'], 2: ['TL', 'BR'], 3: ['TL', 'C', 'BR'], 4: ['TL', 'TR', 'BL', 'BR'], 5: ['TL', 'TR', 'C', 'BL', 'BR'], 6: ['TL', 'TR', 'ML', 'MR', 'BL', 'BR'] };
      var ACC = { 1: 'C', 2: 'BR', 3: 'C', 4: 'TR', 5: 'C', 6: 'TR' };
      var calm = matchMedia('(prefers-reduced-motion: reduce)'), face = 3, idle = 0;
      function setFace(n) {
        face = n;
        [].forEach.call(logo.querySelectorAll('.pips circle'), function (c) {
          c.classList.toggle('on', FACES[n].indexOf(c.getAttribute('data-k')) > -1);
          c.classList.toggle('acc', c.getAttribute('data-k') === ACC[n]);
        });
      }
      function replay(cls, ms) { logo.classList.remove(cls); void logo.offsetWidth; logo.classList.add(cls); setTimeout(function () { logo.classList.remove(cls); }, ms); }
      function rearm() { clearTimeout(idle); idle = setTimeout(function () { if (face !== 3) { setFace(3); if (!calm.matches) replay('pop', 480); } }, 3000); }
      logo.addEventListener('pointerenter', function () {
        if (calm.matches) { rearm(); return; }
        var n; do { n = 1 + Math.floor(Math.random() * 6); } while (n === face);
        setFace(n); replay('pop', 480); replay('tumble', 1250); rearm();
      });
      logo.addEventListener('pointermove', rearm);
    }
  }

  var whenBody = function (fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  };
  var unguard = function () { var g = document.getElementById('mx-guard'); if (g) g.remove(); };
  var isOpen = function () { return state === 'open' || state === 'admin'; };

  // Les jeux écoutent le clavier : rien ne doit leur parvenir tant que le site est fermé.
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (!isOpen() && !(e.target && e.target.closest && e.target.closest('#mx'))) e.stopImmediatePropagation();
    }, true);
  });

  var TEXT = {
    locked: ['On revient vite.', 'Une petite maintenance est en cours. Les parties reprennent dès que tout est prêt.', 'Maintenance en cours'],
    error: ['Site indisponible.', 'Impossible de vérifier l\'état du site pour le moment. Vérifiez votre connexion, puis réessayez.', 'Vérification impossible'],
    hidden: ['Jeu indisponible.', 'Ce jeu n\'est pas accessible pour le moment.', 'Jeu masqué'],
  };

  // Vide la page et la garde vide : seul l'écran reste, même si un script du jeu
  // ou quelqu'un remet des éléments.
  function lock(kind) {
    if (isOpen()) { state = 'locked'; location.reload(); return; }
    // Pas de window.stop() : il interromprait aussi le chargement de firebase.js, dont la
    // connexion admin a besoin (un module interrompu reste en échec dans la page).
    state = 'locked';
    whenBody(function () {
      if (!mx) {
        mx = document.createElement('div');
        mx.id = 'mx';
        mx.setAttribute('role', 'dialog');
        mx.setAttribute('aria-modal', 'true');
        var th = store(localStorage, 'gh-theme');
        mx.dataset.theme = th === 'light' || th === 'dark' ? th : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        mx.addEventListener('click', onClick);
        mx.addEventListener('pointermove', function (e) {
          var tl = mx.querySelector('.mx-tilt');
          if (e.pointerType !== 'mouse' || !tl) return;
          tl.style.setProperty('--ty', ((e.clientX / innerWidth - .5) * 14) + 'deg');
          tl.style.setProperty('--tx', ((.5 - e.clientY / innerHeight) * 10) + 'deg');
        });
        // Seule exception : les cadres invisibles de Firebase, celui qui reçoit la réponse de
        // Google pendant la connexion admin et celui du long-polling de la base (qu'il retire
        // lui-même du body : le supprimer ici fait échouer son removeChild et bloque la lecture
        // de admins/). Rien du site ne s'y affiche.
        var keep = function (n) {
          if (n === mx) return true;
          if (n.tagName !== 'IFRAME') return false;
          return /^https:\/\/(roulia\.me|[a-z0-9-]+\.firebaseapp\.com)\/__\/auth\/iframe/.test(n.src || '') ||
            (n.style.display === 'none' && (!n.src || /^javascript:/.test(n.src)));   // long-polling de la base : caché, sans adresse
        };
        new MutationObserver(function () {
          if (isOpen()) return;
          [].slice.call(document.body.childNodes).forEach(function (n) { if (!keep(n)) n.remove(); });
          if (mx.parentNode !== document.body) document.body.appendChild(mx);
        }).observe(document.body, { childList: true });
      }
      var t = TEXT[kind];
      document.title = kind === 'error' ? 'Site indisponible' : kind === 'hidden' ? 'Jeu indisponible' : 'Site en maintenance';
      var home = new URL('../home.html', base).href, link = kind === 'locked' ? 'span' : 'a';
      var href = function (label) { return kind === 'locked' ? '' : ' href="' + home + '"' + (label ? ' aria-label="' + label + '"' : ''); };
      mx.innerHTML =
        '<header class="mx-wrap mx-top">' +
          '<' + link + ' class="mx-logo"' + href('GameHub, accueil') + '>' + LOGO + '<span aria-label="GameHub">' + WORD + '</span></' + link + '>' +
          '<button class="mx-ico" type="button" data-mx="theme" aria-label="Changer de thème">' + THEME + '</button>' +
        '</header>' +
        '<main class="mx-wrap mx-lost">' +
        '<div class="mx-copy">' +
          '<span class="mx-status"><i></i>' + t[2] + '</span>' +
          '<h1>' + t[0] + '</h1><p>' + t[1] + '</p>' +
          (kind === 'locked' ? '<div class="mx-bar" aria-hidden="true"><i>' + LOGO + '</i></div>' : '') +
          (kind === 'error'
            ? '<div class="mx-actions"><button class="mx-pill" type="button" data-mx="retry">Réessayer</button></div>'
            : kind === 'hidden'
            ? '<div class="mx-actions"><button class="mx-pill" type="button" data-mx="home">Retour aux jeux</button></div>'
            : '<div class="mx-admin" hidden>' +
                '<button class="mx-btn mx-main" type="button" data-mx="login">Se connecter avec Google</button>' +
                '<button class="mx-btn mx-main" type="button" data-mx="reopen" hidden>Réactiver le site</button>' +
                '<button class="mx-btn" type="button" data-mx="enter" hidden>Entrer quand même (admin)</button>' +
                '<div class="mx-msg" aria-live="polite"></div>' +
              '</div>') +
        '</div>' +
        '<div class="mx-media" aria-hidden="true"><div class="mx-tilt"><div class="mx-art">' + DIE + '<img src="' + new URL('maintenance.webp', base) + '" alt="" onerror="this.remove()"><div class="mx-glint"></div></div></div></div>' +
        '</main>' +
        '<footer class="mx-wrap mx-foot">' +
          '<span class="mx-id"><' + link + ' class="mx-home"' + href() + '><i aria-hidden="true">' + DIE + '</i><b>GameHub</b></' + link + '><span>· par <span class="mx-me">XVIIUUU</span></span></span>' +
          '<div class="mx-end"><a href="/confidentialite">Confidentialité</a>' +
            (kind === 'locked' ? '<button class="mx-gear" type="button" data-mx="gear" aria-label="Administration">' + GEAR + '</button>' : '') +
          '</div>' +
        '</footer>';
      document.body.replaceChildren(mx);
      logoFx(mx.querySelector('.mx-logo'));
      root.classList.add('mx-on');
      unguard();
      if (kind === 'locked') beatWaiting();
    });
  }

  // Présence sur l'écran de maintenance : l'admin compte les personnes devant (hub/waiting).
  // Les règles de la base n'acceptent cette écriture qu'en maintenance ; une entrée non
  // rafraîchie expire côté admin. Même principe dans le Worker (edge/src/worker.js).
  var waitUrl = null;
  function beatWaiting() {
    if (waitUrl) return;
    waitUrl = DB + 'hub/waiting/' + Math.random().toString(36).slice(2, 12) + '.json' + NS;
    var beat = function () {
      if (document.hidden) return;
      fetch(waitUrl, { method: 'PUT', body: '{"t":{".sv":"timestamp"}}' }).catch(function () {});
    };
    beat();
    setInterval(beat, 60000);
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('pageshow', beat);
    window.addEventListener('pagehide', function () { fetch(waitUrl, { method: 'DELETE', keepalive: true }).catch(function () {}); });
  }

  function open(admin, note) {
    if (mx) { location.reload(); return; }
    state = admin ? 'admin' : 'open';
    unguard();
    if (admin) whenBody(function () {
      if (document.getElementById('mx-badge')) return;
      var b = document.createElement('div');
      b.id = 'mx-badge';
      b.textContent = note || 'Maintenance : visible par l\'admin seulement';
      document.body.appendChild(b);
    });
  }

  // Le module Firebase est chargé à l'ouverture du panneau : au clic sur « Se connecter »,
  // le popup Google doit s'ouvrir sans attente, sinon le navigateur le bloque.
  var fb = null;
  var loadFb = function () {
    return fb || (fb = Promise.all([
      import(new URL('firebase.js', base).href),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'),
    ]));
  };

  // Accès admin : le compte Google connecté doit figurer dans admins/ côté base.
  // Pendant la vérification, la page reste masquée.
  function fbAdmin() {
    return loadFb().then(function (m) {
      return m[0].auth.authStateReady().then(function () {
        var u = m[0].auth.currentUser;
        if (!u || u.isAnonymous) return false;
        return m[1].get(m[1].ref(m[0].db, 'admins/' + u.uid)).then(function (s) { return s.val() === true; });
      });
    });
  }

  function verifyAdmin() {
    fbAdmin().then(function (ok) {
      if (ok) { open(true); return; }
      store(sessionStorage, ADMIN_HINT, null);
      lock('locked');
    }, function () {
      store(sessionStorage, ADMIN_HINT, null);
      lock('locked');
    });
  }

  // Le Worker a laissé passer la requête : si c'est grâce à son cookie admin, l'admin entre.
  // Réponse vérifiée par le Worker (le cookie est signé et HttpOnly) ; sans Worker : refus.
  function workerAdmin() {
    return fetch('/__gh/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok; }, function () { return false; });
  }

  function onClick(e) {
    var btn = e.target.closest('[data-mx]');
    if (!btn) return;
    var act = btn.getAttribute('data-mx');
    if (act === 'retry') { location.reload(); return; }
    if (act === 'home') { location.href = new URL('../home.html', base).href; return; }
    if (act === 'theme') {
      var next = mx.dataset.theme === 'dark' ? 'light' : 'dark';
      mx.dataset.theme = next;
      store(localStorage, 'gh-theme', next);
      return;
    }
    var panel = mx.querySelector('.mx-admin');
    var msg = mx.querySelector('.mx-msg');
    if (act === 'gear') {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) loadFb().catch(function () { msg.textContent = 'Firebase injoignable.'; });
    } else if (act === 'login') {
      btn.disabled = true;
      msg.textContent = '';
      loadFb().then(function (m) { return m[0].adminSignIn(); }).then(function (res) {
        btn.disabled = false;
        if (!res.isAdmin) { msg.textContent = 'Accès refusé.'; return; }
        btn.hidden = true;
        mx.querySelector('[data-mx="reopen"]').hidden = false;
        mx.querySelector('[data-mx="enter"]').hidden = false;
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = 'Connexion Google annulée ou impossible' + (err && err.code ? ' (' + err.code + ')' : '') + '.';
      });
    } else if (act === 'reopen') {
      btn.disabled = true;
      loadFb().then(function (m) {
        return m[1].set(m[1].ref(m[0].db, 'hub/settings/maintenance'), false);
      }).then(function () {
        store(sessionStorage, ADMIN_HINT, null);
        location.reload();
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = 'Échec : ' + (err && (err.code || err.message) || err);
      });
    } else if (act === 'enter') {
      store(sessionStorage, ADMIN_HINT, '1');
      location.reload();
    }
  }

  // Lecture de l'interrupteur, avec relances.
  function read(tries) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(FLAG, { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (v) { clearTimeout(t); return v; }, function (err) {
        clearTimeout(t);
        if (tries > 1) return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return read(tries - 1); });
        throw err;
      });
  }

  // Jeu masqué ? Sans page de jeu (accueil, 404…), toujours non. Réponse illisible : fermé.
  function isHidden(first) {
    if (!GAME) return Promise.resolve(false);
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(DB + 'hub/hidden/' + encodeURIComponent(GAME) + '.json' + NS, { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (v) { clearTimeout(t); return v === true; }, function (err) { clearTimeout(t); throw err; });
  }

  // Jeu masqué : fermé pour les visiteurs, ouvert pour l'admin (cookie du Worker ou compte Google connecté).
  function hiddenGame() {
    workerAdmin().then(function (ok) { return ok || fbAdmin().catch(function () { return false; }); }).then(function (ok) {
      if (ok) { if (!isOpen()) open(true, 'Jeu masqué : visible par l\'admin seulement'); }
      else lock('hidden');
    });
  }

  // Écoute en direct (flux Firebase) : la page se ferme dès que l'admin masque le jeu.
  // Si le flux tombe, le contrôle périodique ci-dessous prend le relais.
  var watching = false;
  function watchHidden() {
    if (!GAME || watching || !window.EventSource) return;
    watching = true;
    var es = new EventSource(DB + 'hub/hidden/' + encodeURIComponent(GAME) + '.json' + NS);
    es.addEventListener('put', function (e) {
      var d; try { d = JSON.parse(e.data); } catch (x) { return; }
      if (d && d.data === true && state === 'open') hiddenGame();
    });
    es.onerror = function () { es.close(); watching = false; };
  }

  var busy = false;
  function check(first) {
    if (busy) return;
    busy = true;
    read(first ? 3 : 1).then(function (v) {
      if (v === false || v === null) {               // ouvert (ou jamais réglé)
        store(sessionStorage, ADMIN_HINT, null);
        return isHidden(first).then(function (hid) {
          if (hid) { if (state !== 'admin') hiddenGame(); }
          else {
            if (state !== 'open') open(false);
            watchHidden();
          }
        }, function () { if (first) lock('error'); });
      } else if (state === 'pending' || state === 'open') {
        if (store(sessionStorage, ADMIN_HINT) === '1') verifyAdmin();
        else workerAdmin().then(function (ok) { if (ok) open(true); else lock('locked'); });
      }
    }, function () {
      // Base injoignable au chargement : la page reste fermée. En cours de partie, on
      // laisse faire : sans la base, rien ne se joue de toute façon.
      if (first) lock('error');
    }).then(function () { busy = false; });
  }

  check(true);
  setInterval(function () { if (!document.hidden) check(false); }, 20000);   // filet de sécurité
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(false); });
})();
