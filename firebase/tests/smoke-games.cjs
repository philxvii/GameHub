// Test de fumée des vrais clients contre les émulateurs (base + comptes) : chaque
// joueur a son propre contexte de navigation, donc son propre compte anonyme.
// Pour chaque jeu : A crée, B rejoint, l'hôte lance, B recharge et se reconnecte,
// un étranger E ne lit rien, l'hôte supprime. Undercover est joué jusqu'au bout,
// et chacun tente de lire les secrets des autres. Puis le hub.
//
//   cd firebase
//   npx firebase emulators:start --only database,auth --project undercover-game-b0d2a
//   node tests/serve-emulated.js 4174
//   curl -X PUT -H "Authorization: Bearer owner" --data-binary @database.rules.phase2.json \
//     "http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb"
//   node tests/smoke-games.cjs

const { Browser, Page, sleep } = require('../../tools/cdp');

const SITE = process.env.SITE || 'http://localhost:4174';
const EMU = 'http://127.0.0.1:9000';
const NS = 'ns=undercover-game-b0d2a-default-rtdb';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
const admin = (path, method = 'GET') =>
  fetch(`${EMU}/${path}.json?${NS}`, { method, headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
const url = dir => `${SITE}/games/${dir}/?emu`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};
const denied = page => page.consoleErrors.concat(page.consoleAll)
  .filter(e => /permission[_ ]denied/i.test(e.text)).map(e => e.text.slice(0, 160));

async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(200); }
  return v;
}

// Une fenêtre dans un contexte isolé (stockage séparé : compte anonyme distinct).
async function player(browser, href, label) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(browser, sessionId, targetId, label);
  browser.pages.set(sessionId, page);
  for (const m of ['Runtime.enable', 'Log.enable', 'Page.enable']) await page.send(m);
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['*api.anthropic.com*'] });
  page.context = browserContextId;
  if (href) await page.goto(href);
  return page;
}
const dispose = async p => { await p.browser.send('Target.disposeBrowserContext', { browserContextId: p.context }).catch(() => {}); };

// Lecture depuis la page, avec son compte : 'ok' | 'refusé'.
const tryRead = (page, path) => page.eval(`
  const { db } = await import('/shared/firebase.js');
  const { ref, get } = await import('${SDK}');
  try { await get(ref(db, ${JSON.stringify(path)})); return 'ok'; } catch (e) { return /permission/i.test(e.message) ? 'refusé' : e.message; }`);
const active = (page, id) => page.eval(`return document.getElementById('${id}')?.classList.contains('active') || false;`);

const GAMES = [
  { dir: 'puissance4', prefix: 'p4', start: 'startGame' },
  { dir: 'qui-est-ce', prefix: 'qec2', start: 'startGame' },
  { dir: 'bataille-navale', prefix: 'bn', start: 'startPlacement' },
  { dir: 'roulette', prefix: 'rl', start: 'openTable', joinAnyPhase: true },
  { dir: 'mini-golf', prefix: 'mg', start: 'startGame' },
  { dir: 'uno', prefix: 'uno', start: 'startGame' },
];

async function simpleGame(browser, g) {
  const before = Object.keys((await admin(g.prefix)) || {});
  const A = await player(browser, url(g.dir), 'A');
  await A.eval(`document.getElementById('create-name').value='Alice'; createGame();`);
  const code = await waitFor(async () => Object.keys((await admin(g.prefix)) || {}).find(k => !before.includes(k)));
  check(`${g.dir} : création`, code, code || 'aucune partie créée');
  if (!code) return dispose(A);
  const s0 = await admin(`${g.prefix}/${code}`);
  check(`${g.dir} : hôte et membre enregistrés`, s0.hostUid && s0.members && s0.members[s0.hostUid] === true);

  const B = await player(browser, url(g.dir), 'B');
  await B.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Bob'; joinGame();`);
  const two = await waitFor(async () => {
    const s = await admin(`${g.prefix}/${code}`);
    return s && Object.values(s.players || {}).filter(Boolean).length >= 2 && Object.keys(s.members || {}).length === 2;
  });
  check(`${g.dir} : B rejoint (membre distinct), deux joueurs synchronisés`, two);

  await A.eval(`${g.start}();`);
  const started = await waitFor(async () => { const s = await admin(`${g.prefix}/${code}`); return s && s.phase !== 'lobby' && s.phase; });
  check(`${g.dir} : l'hôte lance la partie`, started, String(started));

  // Reconnexion : B recharge, retape le code et son prénom.
  await B.goto(url(g.dir));
  await B.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Bob'; joinGame();`);
  const back = await waitFor(async () => !(await active(B, 's-join')) && !(await active(B, 's-joining')) && !(await active(B, 's-home')));
  check(`${g.dir} : B recharge et se reconnecte`, back);

  // Étranger : ne lit pas la partie ; ne peut pas entrer en cours (sauf Roulette).
  const E = await player(browser, url(g.dir), 'E');
  check(`${g.dir} : un étranger ne lit pas la partie`, (await tryRead(E, `${g.prefix}/${code}`)) === 'refusé');
  await E.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Eve'; joinGame();`);
  await sleep(1500);
  const eMembers = Object.keys((await admin(`${g.prefix}/${code}/members`)) || {}).length;
  check(`${g.dir} : un étranger ${g.joinAnyPhase ? "s'assoit en cours (Roulette)" : "n'entre pas en cours de partie"}`,
    g.joinAnyPhase ? eMembers === 3 : eMembers === 2, `${eMembers} membres`);

  const errs = [...denied(A), ...denied(B)];
  check(`${g.dir} : aucun refus de permission pour les joueurs`, errs.length === 0, errs.join(' || '));

  // B (invité) ne supprime pas ; l'hôte supprime.
  await B.eval(`window.confirm = () => true; if (window.deleteGame) await deleteGame();`).catch(() => {});
  check(`${g.dir} : un invité ne supprime pas la partie`, (await admin(`${g.prefix}/${code}`)) !== null);
  await A.eval(`window.confirm = () => true; await deleteGame();`).catch(() => {});
  check(`${g.dir} : l'hôte supprime la partie`, await waitFor(async () => (await admin(`${g.prefix}/${code}`)) === null, 4000));
  for (const p of [A, B, E]) await dispose(p);
  await admin(`${g.prefix}/${code}`, 'DELETE');
}

// mw : avec un Mr. White, éliminé au vote, qui devine le mot civil (jugé par l'hôte).
async function undercover(browser, mw = false) {
  const T = mw ? 'undercover (Mr. White)' : 'undercover';
  const before = Object.keys((await admin('games')) || {});
  const A = await player(browser, url('undercover'), 'A');
  await A.eval(`document.getElementById('player-count').value='3';document.getElementById('uc-count').value='1';document.getElementById('mw-count').value='${mw ? 1 : 0}';
    document.getElementById('host-name').value='Alice'; startCreation();`);
  const code = await waitFor(async () => Object.keys((await admin('games')) || {}).find(k => !before.includes(k)));
  check(`${T} : création`, code, code || 'aucune partie créée');
  if (!code) return dispose(A);
  const pub = await admin(`games/${code}`);
  check(`${T} : aucun mot ni rôle dans la partie publique`, !('civilWord' in pub) && !('undercoverWord' in pub) && !('roles' in pub));
  const host = await admin(`ucHost/${code}`);
  check(`${T} : mots et rôles dans ucHost (hôte seul)`, host && host.civilWord && host.roles && host.roles.length === 3);

  const B = await player(browser, url('undercover'), 'B');
  const C = await player(browser, url('undercover'), 'C');
  for (const [P, name] of [[B, 'Bob'], [C, 'Chloe']]) {
    await P.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='${name}'; joinGame();`);
    await sleep(600);
  }
  const g1 = await waitFor(async () => { const s = await admin(`games/${code}`); return s && (s.players || []).length === 3 && s; });
  check(`${T} : trois joueurs, trois comptes`, g1 && new Set(g1.players.map(p => p.uid)).size === 3);
  const uids = g1.players.map(p => p.uid);
  const secrets = await waitFor(async () => { const s = await admin(`ucSecret/${code}`); return s && Object.keys(s).length === 3 && s; });
  check(`${T} : l'hôte remet un secret à chaque joueur`, secrets);

  // Rôles affichés : chacun voit le sien, conforme à ucHost.
  await A.eval('startGame();');
  const pages = [A, B, C];
  const shown = await waitFor(async () => {
    const words = [];
    for (const p of pages) words.push(await p.eval(`return document.getElementById('s-role').classList.contains('active') ? document.getElementById('role-word').textContent : null;`));
    return words.every(Boolean) && words;
  });
  const expected = host.roles.map(r => (r === 'civil' ? host.civilWord : r === 'undercover' ? host.undercoverWord : '???'));
  check(`${T} : chaque joueur voit son propre mot`, shown && shown.every((w, i) => w === expected[i]), JSON.stringify(shown));

  // Accès croisés depuis les pages, avec le compte de chaque joueur.
  check(`${T} : B lit son secret`, (await tryRead(B, `ucSecret/${code}/${uids[1]}`)) === 'ok');
  check(`${T} : B ne lit pas le secret de l'hôte`, (await tryRead(B, `ucSecret/${code}/${uids[0]}`)) === 'refusé');
  check(`${T} : B ne lit pas le secret de C`, (await tryRead(B, `ucSecret/${code}/${uids[2]}`)) === 'refusé');
  check(`${T} : B ne lit pas tous les secrets`, (await tryRead(B, `ucSecret/${code}`)) === 'refusé');
  check(`${T} : B ne lit pas ucHost`, (await tryRead(B, `ucHost/${code}`)) === 'refusé');
  check(`${T} : B ne liste pas les parties`, (await tryRead(B, 'games')) === 'refusé');
  const E = await player(browser, url('undercover'), 'E');
  check(`${T} : un étranger ne lit ni la partie ni les secrets`,
    (await tryRead(E, `games/${code}`)) === 'refusé' && (await tryRead(E, `ucSecret/${code}/${uids[1]}`)) === 'refusé' && (await tryRead(E, `ucHost/${code}`)) === 'refusé');
  await E.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Eve'; joinGame();`);
  const eMsg = await waitFor(() => E.eval(`return document.getElementById('join-err').textContent;`), 5000);
  check(`${T} : un étranger n'entre pas en cours de partie`, /déjà en cours/.test(eMsg || ''), eMsg);

  // Partie jouée : prêt, descriptions, vote contre l'undercover, « Continuer » par un invité.
  const ucName = g1.players[host.roles.indexOf(mw ? 'mrwhite' : 'undercover')].name;
  const names = ['Alice', 'Bob', 'Chloe'];
  let phase = null;
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    phase = (await admin(`games/${code}/phase`));
    if (phase === 'gameover') break;
    for (let i = 0; i < 3; i++) {
      const p = pages[i];
      if (await active(p, 's-role')) await p.eval('goToGameWait();');
      else if (await active(p, 's-my-turn')) await p.eval(`document.getElementById('my-description').value='indice de ${names[i]}'; await submitDescription();`);
      else if (await active(p, 's-vote')) {
        const target = names[i] === ucName ? names.find(n => n !== ucName) : ucName;
        await p.eval(`document.querySelector('.vote-option[data-vote="${target}"]').click(); await submitVote();`);
      } else if (mw && names[i] === ucName && await p.eval(`return document.getElementById('elim-mrwhite-guess').style.display === 'block';`))
        await p.eval(`document.getElementById('mrwhite-guess-input').value=${JSON.stringify(host.civilWord)}; await mrWhiteGuess();`);
      else if (!mw && i === 1 && await active(p, 's-elim')) await p.eval('continueAfterElim();');
      else continue;
      // Un humain à la fois : « prêt » et le vote réécrivent tout le tableau (concurrence
      // d'origine du jeu, hors du périmètre de sécurité).
      await sleep(700);
    }
    await sleep(400);
  }
  const over = await admin(`games/${code}`);
  const winner = mw ? 'mrwhite' : 'civils';
  check(`${T} : partie jouée jusqu'au bout, ${winner} vainqueur`, over && over.phase === 'gameover' && over.winner === winner, `${over && over.phase} / ${over && over.winner}`);
  check(`${T} : l'hôte publie mots et rôles à la fin`, over && over.reveal && over.reveal.civilWord === host.civilWord);
  const goWords = await waitFor(async () => {
    const t = [];
    for (const p of pages) t.push(await p.eval(`return document.getElementById('s-gameover').classList.contains('active') && document.getElementById('go-words').textContent;`));
    return t.every(x => x && x.includes(host.civilWord) && x.includes(host.undercoverWord)) && t;
  });
  check(`${T} : écran de fin complet chez les trois joueurs`, goWords);

  // Reconnexion de B (même compte) puis suppression par l'hôte, secrets compris.
  await B.goto(url('undercover'));
  await B.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Bob'; joinGame();`);
  check(`${T} : B recharge et retrouve la partie`, await waitFor(() => active(B, 's-gameover')));
  await A.eval(`window.confirm = () => true; await deleteGame();`);
  const gone = await waitFor(async () => (await admin(`games/${code}`)) === null && (await admin(`ucHost/${code}`)) === null && (await admin(`ucSecret/${code}`)) === null, 5000);
  check(`${T} : l'hôte supprime la partie et ses secrets`, gone);

  const errs = [...denied(A), ...denied(B), ...denied(C)];
  check(`${T} : aucun refus de permission pour les joueurs`, errs.length === 0, errs.join(' || '));
  for (const p of [A, B, C, E]) await dispose(p);
}

(async () => {
  const browser = await Browser.launch({ headless: true });
  try {
    // Deux onglets du même navigateur : un seul compte, et le premier n'en change pas.
    {
      const { browserContextId } = await browser.send('Target.createBrowserContext');
      const tab = async () => {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
        const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
        const p = new Page(browser, sessionId, targetId, 'T'); browser.pages.set(sessionId, p);
        await p.send('Runtime.enable'); await p.send('Page.enable'); await p.goto(url('uno')); return p;
      };
      const [T1, T2] = [await tab(), await tab()];
      const uidOf = p => p.eval(`return (await import('/shared/firebase.js')).auth.currentUser?.uid || null;`);
      const ask = p => p.eval(`return (await (await import('/shared/firebase.js')).ensureAuth()).uid;`);
      const [u1, u2] = await Promise.all([ask(T1), sleep(150).then(() => ask(T2))]);
      await sleep(3000);
      const [n1, n2] = [await uidOf(T1), await uidOf(T2)];
      check('Comptes : deux onglets du même navigateur partagent un seul compte, stable', u1 && u1 === u2 && n1 === u1 && n2 === u1, `${u1} ${u2} → ${n1} ${n2}`);
      await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    }
    await undercover(browser);
    await undercover(browser, true);
    for (const g of GAMES) await simpleGame(browser, g);

    // Hub : présence, compteur, réglages ; le visiteur n'a pas besoin de compte.
    const visits = (await admin('hub/stats/visits')) || 0;
    const H = await player(browser, `${SITE}/?emu`, 'Hub');
    check('Hub : présence enregistrée', await waitFor(async () => Object.keys((await admin('hub/online')) || {}).length > 0));
    check('Hub : compteur de visites +1', await waitFor(async () => (await admin('hub/stats/visits')) === visits + 1));
    check('Hub : aucun refus de permission', denied(H).length === 0, denied(H).join(' || '));
    check('Hub : un visiteur ne modifie pas les réglages',
      (await H.eval(`const { db } = await import('/shared/firebase.js'); const { ref, update } = await import('${SDK}');
        try { await update(ref(db, 'hub/settings'), { ageGate: false }); return 'ok'; } catch (e) { return 'refusé'; }`)) === 'refusé');
    await dispose(H);
  } finally {
    await browser.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== FUMÉE : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
