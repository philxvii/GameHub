// Maintenance du site : interrupteur hub/settings/maintenance dans Firebase, lu au
// chargement de chaque page puis toutes les minutes. Activé, un écran recouvre la page ;
// l'engrenage connecte l'admin (Google), qui peut réactiver le site ou entrer quand même.
// Ce n'est que la façade : les règles de la base refusent déjà toute écriture dans les
// parties tant que l'interrupteur est activé (firebase/build-rules.js).
//
// Script classique, chargé en premier dans <head> de chaque page.
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
  var LAST = 'gh-mx';          // dernier état connu : on ne masque la page d'attente que s'il était activé
  var BYPASS = 'gh-mx-admin';  // l'admin est entré quand même (pour cet onglet)
  var root = document.documentElement;
  var shown = false;

  var css = document.createElement('style');
  css.textContent = [
    'html.mx-wait body{visibility:hidden}',
    'html.mx-on body>*:not(#mx){display:none!important}',
    'html.mx-on,html.mx-on body{overflow:hidden!important}',
    '#mx{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;background:#14432f;color:#1b2420;',
    'font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;overflow-y:auto}',
    '#mx *{box-sizing:border-box;margin:0}',
    '#mx .mx-card{max-width:440px;width:100%;padding:2.2rem 1.8rem;background:#f4ecd8;border:2px solid #1b2420;border-radius:14px;box-shadow:0 6px 0 #1b2420}',
    '#mx img{width:56px;height:56px;margin-bottom:1rem}',
    '#mx h1{font:700 1.7rem/1.2 Georgia,"Times New Roman",serif;margin-bottom:.8rem}',
    '#mx p{color:#5a6159}',
    '#mx p+p{margin-top:.6rem}',
    '#mx hr{border:0;border-top:2px solid #b08a3e;width:48px;margin:1.2rem auto}',
    '#mx .mx-gear{position:fixed;right:16px;bottom:16px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:50%;',
    'background:transparent;color:#f4ecd8;opacity:.55;cursor:pointer;transition:opacity .2s,transform .7s}',
    '#mx .mx-gear:hover{opacity:1;transform:rotate(60deg)}',
    '#mx .mx-gear svg{width:20px;height:20px}',
    '#mx .mx-admin{margin-top:1.4rem;padding-top:1.2rem;border-top:1px dashed #b9ae94;display:grid;gap:8px}',
    '#mx .mx-admin[hidden]{display:none}',
    '#mx button.mx-btn{padding:11px 14px;border:2px solid #1b2420;border-radius:10px;background:#fffaf0;color:#1b2420;font:inherit;font-size:15px;font-weight:600;line-height:1.2;cursor:pointer}',
    '#mx button.mx-btn.mx-main{background:#1b2420;color:#f4ecd8}',
    '#mx button.mx-btn:disabled{opacity:.5;cursor:wait}',
    '#mx .mx-msg{font-size:13px;color:#a03a24;min-height:1.2em;word-break:break-word}',
    '#mx-badge{position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:8px;background:#1b2420;color:#f4ecd8;',
    'font:600 12px/1.3 system-ui,sans-serif;opacity:.85;pointer-events:none}',
  ].join('');
  document.head.appendChild(css);

  var GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  var whenBody = function (fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  };

  // Les jeux écoutent le clavier : rien ne doit leur parvenir sous l'écran.
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (shown && !(e.target && e.target.closest && e.target.closest('#mx'))) e.stopImmediatePropagation();
    }, true);
  });

  function show() {
    if (shown) return;
    shown = true;
    whenBody(function () {
      var mx = document.createElement('div');
      mx.id = 'mx';
      mx.setAttribute('role', 'dialog');
      mx.setAttribute('aria-modal', 'true');
      mx.innerHTML =
        '<div class="mx-card">' +
          '<img src="' + new URL('../icons/favicon.svg', base) + '" alt="">' +
          '<h1>Site en maintenance</h1>' +
          '<p>Roulia est momentanément indisponible le temps d\'une opération de maintenance.</p>' +
          '<hr><p>Les jeux reviennent très vite. Merci de votre patience !</p>' +
          '<div class="mx-admin" hidden>' +
            '<button class="mx-btn mx-main" type="button" data-mx="login">Se connecter avec Google</button>' +
            '<button class="mx-btn mx-main" type="button" data-mx="reopen" hidden>Réactiver le site</button>' +
            '<button class="mx-btn" type="button" data-mx="enter" hidden>Entrer quand même (admin)</button>' +
            '<div class="mx-msg" aria-live="polite"></div>' +
          '</div>' +
        '</div>' +
        '<button class="mx-gear" type="button" data-mx="gear" aria-label="Administration">' + GEAR + '</button>';
      document.body.appendChild(mx);
      root.classList.add('mx-on');
      mx.addEventListener('click', onClick);
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

  function onClick(e) {
    var btn = e.target.closest('[data-mx]');
    if (!btn) return;
    var mx = document.getElementById('mx');
    var panel = mx.querySelector('.mx-admin');
    var msg = mx.querySelector('.mx-msg');
    var act = btn.getAttribute('data-mx');
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
        store(localStorage, LAST, '0');
        store(sessionStorage, BYPASS, null);
        location.reload();
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = 'Échec : ' + (err && (err.code || err.message) || err);
      });
    } else if (act === 'enter') {
      store(sessionStorage, BYPASS, '1');
      location.reload();
    }
  }

  function badge() {
    whenBody(function () {
      if (document.getElementById('mx-badge')) return;
      var b = document.createElement('div');
      b.id = 'mx-badge';
      b.textContent = 'Maintenance : visible par l\'admin seulement';
      document.body.appendChild(b);
    });
  }

  function apply(on) {
    root.classList.remove('mx-wait');
    store(localStorage, LAST, on ? '1' : '0');
    if (on && store(sessionStorage, BYPASS) === '1') { badge(); return; }
    if (!on) store(sessionStorage, BYPASS, null);
    if (on) show();
    else if (shown) location.reload();
  }

  function check() {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); root.classList.remove('mx-wait'); }, 4000);
    return fetch(FLAG, { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (v) { apply(v === true); })
      // Base injoignable : la page s'affiche, les règles bloquent toujours les écritures.
      .catch(function () { root.classList.remove('mx-wait'); })
      .then(function () { clearTimeout(t); });
  }

  if (store(localStorage, LAST) === '1' && store(sessionStorage, BYPASS) !== '1') root.classList.add('mx-wait');
  check();
  setInterval(function () { if (!document.hidden) check(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
