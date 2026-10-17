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
  var FLAG = EMU
    ? 'http://127.0.0.1:9000/hub/settings/maintenance.json?ns=undercover-game-b0d2a-default-rtdb'
    : 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/hub/settings/maintenance.json';
  var ADMIN_HINT = 'gh-mx-admin';  // l'admin a demandé à entrer : revérifié à chaque chargement
  var root = document.documentElement;
  var state = 'pending';           // pending → open | admin | locked
  var mx = null;

  var css = document.createElement('style');
  // Même aspect que l'écran du Worker (edge/src/maintenance-view.js) : garder les deux alignés.
  css.textContent = [
    'html.mx-on,html.mx-on body{overflow:hidden!important;visibility:visible!important}',
    '#mx{--bg:#F5F6F8;--surface:#FFFFFF;--border:rgba(14,16,22,.08);--border2:rgba(14,16,22,.16);--text:#0E1016;--muted:#686D79;--accent:#0E1016;--on-accent:#FFFFFF;--brand:#FF5A3C;--err:#D2402A;--back:#111318;--back-line:rgba(255,255,255,.07);--shadow:0 1px 2px rgba(14,16,22,.06),0 14px 28px -16px rgba(14,16,22,.38)}',
    '#mx[data-theme=dark]{--bg:#0D0B12;--surface:#17141F;--border:rgba(255,255,255,.08);--border2:rgba(255,255,255,.16);--text:#F3F1F7;--muted:#9A95A8;--accent:#F3F1F7;--on-accent:#0D0B12;--err:#FF7B63;--back:#1C1826;--back-line:rgba(255,255,255,.06);--shadow:0 1px 2px rgba(0,0,0,.5),0 18px 34px -16px rgba(0,0,0,.85)}',
    '#mx{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);',
    'font:16px/1.5 "Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;overflow-y:auto;visibility:visible;-webkit-font-smoothing:antialiased}',
    '#mx *{box-sizing:border-box;margin:0}',
    '#mx .mx-card{display:grid;justify-items:center;width:100%;max-width:460px}',
    '#mx .mx-art{position:relative;width:min(48vw,200px);aspect-ratio:3/4;margin-bottom:34px;border-radius:24px;box-shadow:var(--shadow);animation:mx-drift 7s ease-in-out infinite;',
    'background:repeating-linear-gradient(0deg,var(--back-line) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,var(--back-line) 0 1px,transparent 1px 12px),var(--back)}',
    '#mx .mx-art{overflow:hidden}',
    '#mx .mx-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '#mx .mx-art svg{position:absolute;left:50%;top:50%;width:34%;transform:translate(-50%,-50%)}',
    '@keyframes mx-drift{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-10px) rotate(1.5deg)}}',
    '#mx .mx-status{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--muted)}',
    '#mx .mx-status i{width:7px;height:7px;border-radius:50%;background:var(--brand)}',
    '#mx h1{margin:12px 0;font-weight:600;font-size:clamp(34px,9vw,52px);line-height:1.02;letter-spacing:-.04em;text-wrap:balance}',
    '#mx p{max-width:31ch;font-size:17px;color:var(--muted);text-wrap:balance}',
    '#mx .mx-gear{position:fixed;right:16px;bottom:16px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;',
    'background:transparent;color:var(--muted);opacity:.5;cursor:pointer;transition:opacity .2s,transform .7s}',
    '#mx .mx-gear:hover{opacity:1;transform:rotate(60deg)}',
    '#mx .mx-gear svg{width:17px;height:17px}',
    '#mx [hidden]{display:none!important}',
    '#mx .mx-admin{display:grid;gap:8px;width:min(320px,100%);margin-top:28px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow)}',
    '#mx button.mx-btn{width:100%;padding:12px;border:1px solid var(--border2);border-radius:10px;background:transparent;color:var(--text);font:inherit;font-size:15px;font-weight:600;cursor:pointer}',
    '#mx button.mx-btn.mx-main{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}',
    '#mx button.mx-btn:disabled{opacity:.5;cursor:wait}',
    '#mx .mx-msg{font-size:13px;color:var(--err);min-height:1.2em;word-break:break-word}',
    '#mx-badge{position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:8px;background:#1b2420;color:#f4ecd8;',
    'font:600 12px/1.3 system-ui,sans-serif;opacity:.85;pointer-events:none}',
    '@media (prefers-reduced-motion:reduce){#mx .mx-art{animation:none}}',
  ].join('');
  document.head.appendChild(css);

  var DIE = '<svg viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="8" cy="8" r="1.7" fill="#fff"/><circle cx="12" cy="12" r="1.7" fill="#FF5A3C"/><circle cx="16" cy="16" r="1.7" fill="#fff"/></svg>';
  var GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

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
      document.title = kind === 'error' ? 'Site indisponible' : 'Site en maintenance';
      mx.innerHTML =
        '<div class="mx-card">' +
          '<div class="mx-art" aria-hidden="true">' + DIE + '<img src="' + new URL('maintenance.webp', base) + '" alt="" onerror="this.remove()"></div>' +
          '<span class="mx-status"><i></i>' + t[2] + '</span>' +
          '<h1>' + t[0] + '</h1><p>' + t[1] + '</p>' +
          (kind === 'error'
            ? '<div class="mx-admin"><button class="mx-btn mx-main" type="button" data-mx="retry">Réessayer</button></div>'
            : '<div class="mx-admin" hidden>' +
                '<button class="mx-btn mx-main" type="button" data-mx="login">Se connecter avec Google</button>' +
                '<button class="mx-btn mx-main" type="button" data-mx="reopen" hidden>Réactiver le site</button>' +
                '<button class="mx-btn" type="button" data-mx="enter" hidden>Entrer quand même (admin)</button>' +
                '<div class="mx-msg" aria-live="polite"></div>' +
              '</div>') +
        '</div>' +
        (kind === 'locked' ? '<button class="mx-gear" type="button" data-mx="gear" aria-label="Administration">' + GEAR + '</button>' : '');
      document.body.replaceChildren(mx);
      root.classList.add('mx-on');
      unguard();
    });
  }

  function open(admin) {
    if (mx) { location.reload(); return; }
    state = admin ? 'admin' : 'open';
    unguard();
    if (admin) whenBody(function () {
      if (document.getElementById('mx-badge')) return;
      var b = document.createElement('div');
      b.id = 'mx-badge';
      b.textContent = 'Maintenance : visible par l\'admin seulement';
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
  function verifyAdmin() {
    loadFb().then(function (m) {
      return m[0].auth.authStateReady().then(function () {
        var u = m[0].auth.currentUser;
        if (!u || u.isAnonymous) return false;
        return m[1].get(m[1].ref(m[0].db, 'admins/' + u.uid)).then(function (s) { return s.val() === true; });
      });
    }).then(function (ok) {
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
        if (!res.isAdmin) { msg.textContent = 'Compte non autorisé.'; return; }
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

  var busy = false;
  function check(first) {
    if (busy) return;
    busy = true;
    read(first ? 3 : 1).then(function (v) {
      if (v === false || v === null) {               // ouvert (ou jamais réglé)
        store(sessionStorage, ADMIN_HINT, null);
        if (state !== 'open') open(false);
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
  setInterval(function () { if (!document.hidden) check(false); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(false); });
})();
