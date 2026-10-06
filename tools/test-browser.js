// Tests navigateur de bout en bout : Chrome réel, Firebase réel, deux onglets.
//
//   python -m http.server 4173          # depuis la racine du dépôt
//   node tools/test-browser.js          # gameplay + motion + responsive
//   node tools/test-browser.js --shots  # + captures dans tools/shots/
//   node tools/test-browser.js --no-gsap   # repli quand le CDN est coupé
//   node tools/test-browser.js --preview   # fenêtre visible, partie de démo
//
// Les parties de test sont créées puis SUPPRIMÉES de Firebase à la fin.
// Les assertions interrogent le DOM : c'est bien moins coûteux en tokens
// qu'une capture d'écran, et c'est vérifiable automatiquement.

const path = require('path');
const { Browser, sleep } = require('./cdp');

const URL = process.env.BQ_URL || 'http://localhost:4173/banqueroll.html';
const DB = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll/';
const SHOTS = path.join(__dirname, 'shots');
const args = process.argv.slice(2);
const want = f => args.includes(f);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};

// ---------------------------------------------------------------- utilitaires
async function openPair(b) {
  const A = await b.newPage(null, 'A');
  const B = await b.newPage(null, 'B');
  await A.goto(URL);
  await B.goto(URL);
  await sleep(1800);
  return [A, B];
}

// La durée de tour doit exister dans le <select> : une valeur absente donne NaN.
async function createGame(A, { name = 'Alice', players = '2', timer = '40' } = {}) {
  return A.eval(`
    document.getElementById('create-name').value=${JSON.stringify(name)};
    document.getElementById('create-players').value=${JSON.stringify(players)};
    document.getElementById('create-timer').value=${JSON.stringify(timer)};
    document.querySelector('#s-home .btn-primary').click();
    await new Promise(r=>setTimeout(r,2600));
    return document.getElementById('lobby-code').textContent.trim();`);
}

async function joinGame(B, code, name = 'Bob') {
  return B.eval(`
    document.getElementById('join-code').value=${JSON.stringify(code)};
    document.getElementById('join-name').value=${JSON.stringify(name)};
    document.querySelector('#s-home .btn-secondary').click();
    await new Promise(r=>setTimeout(r,2600));
    return {ecran:document.querySelector('.screen.active')?.id, err:document.getElementById('join-error').textContent};`);
}

const cleanup = (page, code) => page.eval(`await fetch('${DB}${code}.json',{method:'DELETE'}); return 1;`);

// ---------------------------------------------------------------- gameplay
async function suiteGameplay(A, B) {
  const code = await createGame(A);
  check('Création de partie (clic réel)', /^[A-Z]+-\d+/.test(code), 'code=' + code);

  const joined = await joinGame(B, code);
  check('Deuxième joueur rejoint', joined.ecran === 's-lobby' && !joined.err, JSON.stringify(joined));

  const started = await A.eval(`
    document.getElementById('start-game-btn').click();
    await new Promise(r=>setTimeout(r,2600));
    return {ecran:document.querySelector('.screen.active')?.id,
            objectif:document.getElementById('ref-objective').textContent.trim(),
            haut:document.querySelectorAll('#players-top .reference-player').length,
            bas:document.querySelectorAll('#players-bottom .reference-player').length};`);
  check('Démarrage de la partie', started.ecran === 's-game' && started.haut === 1 && started.bas === 1, started.objectif);

  // Cœur du contrat : ce que les dés AFFICHENT doit être ce qui DÉPLACE le pion.
  const roll = await A.eval(`
    const U='${DB}${code}.json';
    const before=await fetch(U).then(r=>r.json());
    const posAvant=before.players[0].position;
    const p=rollDice();
    await new Promise(r=>setTimeout(r,250));
    const pendant={rolling:document.getElementById('die-1').classList.contains('rolling'),
                   total:document.getElementById('dice-total').textContent};
    await p; await new Promise(r=>setTimeout(r,3000));
    const after=await fetch(U).then(r=>r.json());
    const pips=id=>document.querySelectorAll('#'+id+' .die-pip').length;
    const hist=Object.values(after.history||{}).sort((a,b)=>a.ts-b.ts).map(h=>h.text);
    return {posAvant, posApres:after.players[0].position, pendant,
            de1:pips('die-1'), de2:pips('die-2'),
            total:document.getElementById('dice-total').textContent,
            ligne:hist.filter(t=>t.includes('lance')).pop()};`);
  const m = /lance (\d) \+ (\d) et avance de (\d+)/.exec(roll.ligne || '');
  const delta = (roll.posApres - roll.posAvant + 28) % 28;
  check('Lancer de dés', !!m, roll.ligne);
  check('Points affichés == valeurs du moteur', m && roll.de1 === +m[1] && roll.de2 === +m[2],
    `affiché ${roll.de1}+${roll.de2}`);
  check('Total affiché == somme des dés', roll.total === `${roll.de1} + ${roll.de2} = ${roll.de1 + roll.de2}`, roll.total);
  // On compare aux cases annoncées par le moteur, pas à (posApres - posAvant) :
  // une carte Chance peut redéplacer le joueur juste après l'atterrissage.
  check('Déplacement == total des dés', m && +m[3] === roll.de1 + roll.de2,
    `dés ${roll.de1}+${roll.de2}, moteur avance de ${m ? m[3] : '?'} cases` +
    (delta !== roll.de1 + roll.de2 ? ` (case finale ${roll.posApres} après effet de case)` : ''));
  check('Animation active pendant le lancer', roll.pendant.rolling === true && roll.pendant.total === '…');

  const panelB = await B.eval(`return document.getElementById('action-panel').textContent.slice(0,60);`);
  check('Les deux clients voient le même état de tour', typeof panelB === 'string' && panelB.length > 0, panelB);

  const buy = await A.eval(`
    const U='${DB}${code}';
    const g=await fetch(U+'.json').then(r=>r.json());
    const id=g.players[0].id;
    await fetch(U+'/players/0.json',{method:'PATCH',body:JSON.stringify({position:1,cash:1500})});
    await fetch(U+'.json',{method:'PATCH',body:JSON.stringify({turnIndex:0,currentAction:{type:'buy',position:1,playerId:id},turnDeadline:Date.now()+300000})});
    await new Promise(r=>setTimeout(r,2000));
    const cible=document.querySelector('.square[data-index="1"]').classList.contains('target');
    [...document.querySelectorAll('#action-panel button')].find(x=>x.textContent.includes('Acheter')).click();
    await new Promise(r=>setTimeout(r,800));
    const sq=document.querySelector('.square[data-index="1"]');
    const flash=sq.classList.contains('just-bought');
    await new Promise(r=>setTimeout(r,1800));
    const g2=await fetch(U+'.json').then(r=>r.json());
    return {cible, flash, possedee:sq.classList.contains('owned'),
            cash:g2.players[0].cash, tour:g2.turnIndex};`);
  check('Case cible mise en avant', buy.cible === true);
  check('Achat : argent débité, propriété acquise, flash visuel',
    buy.cash === 1500 - 170 && buy.possedee && buy.flash, `cash ${buy.cash}, tour -> ${buy.tour}`);

  const trade = await A.eval(`
    const U='${DB}${code}';
    await fetch(U+'.json',{method:'PATCH',body:JSON.stringify({turnIndex:0,turnDeadline:Date.now()+300000})});
    await new Promise(r=>setTimeout(r,1600));
    openTradeModal();
    const rec=document.getElementById('trade-recipient'); rec.value=rec.options[0].value;
    document.getElementById('trade-offer-cash').value='200';
    const off=document.getElementById('trade-offer-property');
    off.value=[...off.options].find(o=>o.textContent.includes('Jakarta')).value;
    await proposeTrade();
    await new Promise(r=>setTimeout(r,2000));
    return !document.getElementById('modal-trade').classList.contains('active');`);
  const accept = await B.eval(`
    await new Promise(r=>setTimeout(r,1500));
    const btn=[...document.querySelectorAll('#action-panel button')].find(x=>x.textContent==='Accepter');
    const vu=!!btn; if(btn) btn.click();
    await new Promise(r=>setTimeout(r,2500));
    const g=await fetch('${DB}${code}.json').then(r=>r.json());
    return {vu, statut:g.trade.status};`);
  check('Échange accepté par le destinataire (hors de son tour)',
    trade && accept.vu && accept.statut === 'accepted', `statut=${accept.statut}`);

  const over = await A.eval(`
    await fetch('${DB}${code}/players/0.json',{method:'PATCH',body:JSON.stringify({cash:3300})});
    await new Promise(r=>setTimeout(r,2600));
    const ov=document.getElementById('victory');
    return {actif:ov.classList.contains('active'),
            nom:document.getElementById('victory-name').textContent,
            pieces:ov.querySelectorAll('.victory-coins i').length,
            relance:!document.getElementById('victory-restart').classList.contains('hidden')};`);
  const overB = await B.eval(`return {actif:document.getElementById('victory').classList.contains('active'),
    relance:!document.getElementById('victory-restart').classList.contains('hidden')};`);
  check('Écran de victoire, synchronisé, relance réservée à l\'hôte',
    over.actif && overB.actif && over.relance && !overB.relance, `${over.nom}, ${over.pieces} pièces`);

  const restart = await A.eval(`
    restartGame();
    await new Promise(r=>setTimeout(r,2600));
    const g=await fetch('${DB}${code}.json').then(r=>r.json());
    return {phase:g.phase, round:g.round, ownership:g.ownership===undefined,
            cash:g.players.map(p=>p.cash), pos:g.players.map(p=>p.position)};`);
  check('Nouvelle partie : remise à zéro complète',
    restart.phase === 'lobby' && restart.round === 1 && restart.ownership
    && restart.cash.every(c => c === 1500) && restart.pos.every(p => p === 21));

  await cleanup(A, code);
}

// ---------------------------------------------------------------- motion
async function suiteMotion(A, B) {
  const code = await createGame(A, { timer: '40' });
  await joinGame(B, code);
  await A.eval(`document.getElementById('start-game-btn').click(); await new Promise(r=>setTimeout(r,2600)); return 1;`);

  const pawns = await A.eval(`
    const els=[...document.querySelectorAll('#pawn-layer .pawn')];
    return {nb:els.length, actifs:els.filter(e=>e.classList.contains('pawn-active')).length,
            couleurs:els.map(e=>e.style.getPropertyValue('--pawn'))};`);
  check('Un pion par joueur sur la couche dédiée', pawns.nb === 2 && pawns.actifs === 1,
    `${pawns.nb} pions ${JSON.stringify(pawns.couleurs)}`);

  // Le pion est volontairement posé dans le BAS de la case, sous le nom de la ville.
  const placed = await A.eval(`
    const p=document.querySelector('#pawn-layer .pawn').getBoundingClientRect();
    const s=document.querySelector('.square[data-index="21"]').getBoundingClientRect();
    return {dedans:p.left>=s.left-1&&p.right<=s.right+1&&p.top>=s.top-1&&p.bottom<=s.bottom+1,
            sousLeNom:p.top>s.top+s.height*0.45,
            dx:Math.round(p.left+p.width/2-(s.left+s.width/2))};`);
  check('Pion contenu dans sa case, sous le nom', placed.dedans && placed.sousLeNom && Math.abs(placed.dx) <= 14,
    `dedans=${placed.dedans} dx=${placed.dx}`);

  // On échantillonne la transform pendant le lancer : plusieurs positions
  // distinctes prouvent un déplacement case par case, pas une téléportation.
  const motion = await A.eval(`
    const U='${DB}${code}.json';
    const avant=(await fetch(U).then(r=>r.json())).players[0].position;
    const pawn=document.querySelector('#pawn-layer .pawn');
    const vus=new Set();
    const t=setInterval(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(pawn).transform);
      vus.add(Math.round(m.m41)+','+Math.round(m.m42));},35);
    await rollDice(); await new Promise(r=>setTimeout(r,2600)); clearInterval(t);
    const g=await fetch(U).then(r=>r.json());
    const p=pawn.getBoundingClientRect();
    const s=document.querySelector('.square[data-index="'+g.players[0].position+'"]').getBoundingClientRect();
    return {avant, apres:g.players[0].position, positions:vus.size,
            dedans:p.left>=s.left-1&&p.right<=s.right+1&&p.top>=s.top-1&&p.bottom<=s.bottom+1};`);
  const cases = (motion.apres - motion.avant + 28) % 28;
  check('Déplacement animé case par case', motion.positions >= Math.min(cases, 4),
    `${motion.positions} positions distinctes pour ${cases} cases`);
  check('Pion arrivé dans la bonne case', motion.dedans, `${motion.avant} -> ${motion.apres}`);

  const money = await A.eval(`
    let vus=0;
    const obs=new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.classList&&n.classList.contains('money-delta')) vus++;})));
    obs.observe(document.getElementById('players-top'),{childList:true,subtree:true});
    obs.observe(document.getElementById('players-bottom'),{childList:true,subtree:true});
    const g=await fetch('${DB}${code}.json').then(r=>r.json());
    await fetch('${DB}${code}/players/0.json',{method:'PATCH',body:JSON.stringify({cash:g.players[0].cash+250})});
    await new Promise(r=>setTimeout(r,1800));
    obs.disconnect();
    return vus;`);
  check('Feedback visuel sur variation d\'argent', money >= 1, `${money} apparition(s)`);

  await cleanup(A, code);
}

// ---------------------------------------------------------------- responsive
const WIDTHS = [360, 390, 430, 768, 1024, 1440];

async function suiteResponsive(A, B) {
  const code = await createGame(A, { players: '4', timer: '40' });
  await joinGame(B, code);
  await A.eval(`
    const U='${DB}${code}';
    const g=await fetch(U+'.json').then(r=>r.json());
    const extra=[{id:'demo-c',name:'Chloé',position:21,cash:1500,jailTurns:0,inJail:false,color:'#34d399',ready:true},
                 {id:'demo-d',name:'Driss',position:21,cash:1500,jailTurns:0,inJail:false,color:'#fb7185',ready:true}];
    await fetch(U+'/players.json',{method:'PUT',body:JSON.stringify([...g.players,...extra])});
    await new Promise(r=>setTimeout(r,1600));
    document.getElementById('start-game-btn').click();
    await new Promise(r=>setTimeout(r,2600));
    const g2=await fetch(U+'.json').then(r=>r.json());
    const ids=g2.players.map(p=>p.id);
    await fetch(U+'/ownership.json',{method:'PATCH',body:JSON.stringify({1:ids[0],5:ids[1],22:ids[2],26:ids[3]})});
    await fetch(U+'/players/1.json',{method:'PATCH',body:JSON.stringify({position:4})});
    await fetch(U+'/players/2.json',{method:'PATCH',body:JSON.stringify({position:12})});
    await fetch(U+'/players/3.json',{method:'PATCH',body:JSON.stringify({position:25})});
    await new Promise(r=>setTimeout(r,1600));
    return 1;`);

  let allOk = true;
  for (const w of WIDTHS) {
    const mobile = w <= 430;
    await A.setViewport(w, mobile ? 900 : 1000, mobile);
    const m = await A.eval(`
      const coupes=[...document.querySelectorAll('.square-name')].filter(n=>
        Math.round(n.getBoundingClientRect().height/parseFloat(getComputedStyle(n).lineHeight))>1
        && !n.textContent.includes(' ')).length;
      const pions=[...document.querySelectorAll('#pawn-layer .pawn')];
      return {debord:document.documentElement.scrollWidth>window.innerWidth, coupes,
              pions:pions.length, visibles:pions.filter(p=>p.getBoundingClientRect().width>10).length,
              plateau:Math.round(document.querySelector('.board-shell').getBoundingClientRect().width)};`);
    const ok = !m.debord && m.coupes === 0 && m.pions === 4 && m.visibles === 4;
    allOk = allOk && ok;
    console.log(`       ${String(w).padStart(4)} px : débordement=${m.debord} noms coupés=${m.coupes} pions=${m.visibles}/${m.pions} plateau=${m.plateau}`);
    if (want('--shots') && [390, 1024].includes(w)) await A.screenshot(path.join(SHOTS, `jeu-${w}.png`));
  }
  check(`Responsive sur ${WIDTHS.length} largeurs`, allOk);
  await A.clearViewport();

  if (want('--shots')) {
    await A.eval(`await fetch('${DB}${code}/players/0.json',{method:'PATCH',body:JSON.stringify({cash:3200})});
      await new Promise(r=>setTimeout(r,1400)); return 1;`);
    await A.setViewport(390, 844, true);
    await A.screenshot(path.join(SHOTS, 'victoire.png'));
    await A.clearViewport();
    console.log('       captures écrites dans tools/shots/');
  }
  await cleanup(A, code);
}

// ---------------------------------------------------------------- repli sans GSAP
async function suiteNoGsap(b) {
  const A = await b.newPage(null, 'A'), B = await b.newPage(null, 'B');
  for (const p of [A, B]) await p.blockUrls(['*cdnjs.cloudflare.com*']);
  await A.goto(URL); await B.goto(URL); await sleep(2000);
  check('GSAP bien absent de la page', (await A.eval(`return typeof gsap;`)) === 'undefined');

  const code = await createGame(A);
  await joinGame(B, code);
  const r = await A.eval(`
    document.getElementById('start-game-btn').click();
    await new Promise(r=>setTimeout(r,2600));
    const U='${DB}${code}.json';
    const avant=(await fetch(U).then(r=>r.json())).players[0].position;
    await rollDice(); await new Promise(r=>setTimeout(r,3000));
    const g=await fetch(U).then(r=>r.json());
    const p=document.querySelector('#pawn-layer .pawn').getBoundingClientRect();
    const s=document.querySelector('.square[data-index="'+g.players[0].position+'"]').getBoundingClientRect();
    const hist=Object.values(g.history||{}).sort((a,b)=>a.ts-b.ts).map(h=>h.text);
    return {pions:document.querySelectorAll('#pawn-layer .pawn').length, avant, apres:g.players[0].position,
            dedans:p.left>=s.left-1&&p.right<=s.right+1&&p.top>=s.top-1&&p.bottom<=s.bottom+1,
            ligne:hist.filter(t=>t.includes('lance')).pop(),
            de1:document.querySelectorAll('#die-1 .die-pip').length,
            de2:document.querySelectorAll('#die-2 .die-pip').length};`);
  const mm = /lance (\d) \+ (\d) et avance de (\d+)/.exec(r.ligne || '');
  check('Sans GSAP : jeu jouable, pions et dés corrects',
    r.pions === 2 && r.dedans && mm && r.de1 === +mm[1] && r.de2 === +mm[2] && +mm[3] === r.de1 + r.de2,
    `${r.avant} -> ${r.apres}, dés ${r.de1}+${r.de2} | ${r.ligne}`);
  await cleanup(A, code);
  return [A, B];
}

// ---------------------------------------------------------------- aperçu
async function preview() {
  const b = await Browser.launch({ headless: false, windowSize: '470,1010' });
  const [A, B] = await openPair(b);
  const code = await createGame(A, { name: 'Toi', players: '4' });
  await joinGame(B, code);
  await A.eval(`
    const U='${DB}${code}';
    const g=await fetch(U+'.json').then(r=>r.json());
    const extra=[{id:'demo-c',name:'Chloé',position:21,cash:1500,jailTurns:0,inJail:false,color:'#34d399',ready:true},
                 {id:'demo-d',name:'Driss',position:21,cash:1500,jailTurns:0,inJail:false,color:'#fb7185',ready:true}];
    await fetch(U+'/players.json',{method:'PUT',body:JSON.stringify([...g.players,...extra])});
    await new Promise(r=>setTimeout(r,1600));
    document.getElementById('start-game-btn').click();
    await new Promise(r=>setTimeout(r,2600));
    const g2=await fetch(U+'.json').then(r=>r.json());
    const ids=g2.players.map(p=>p.id);
    await fetch(U+'/ownership.json',{method:'PATCH',body:JSON.stringify({1:ids[0],5:ids[1],22:ids[2],26:ids[3]})});
    await fetch(U+'/players/1.json',{method:'PATCH',body:JSON.stringify({position:4})});
    await fetch(U+'/players/2.json',{method:'PATCH',body:JSON.stringify({position:12})});
    await fetch(U+'/players/3.json',{method:'PATCH',body:JSON.stringify({position:25})});
    return 1;`);
  await A.send('Page.bringToFront');
  console.log(`Fenêtre ouverte. Partie de démo : ${code} — tu joues "Toi" (hôte), c'est ton tour.`);
  console.log(`Pense à la supprimer ensuite : curl -X DELETE "${DB}${code}.json"`);
  process.exit(0);   // on laisse volontairement le navigateur ouvert
}

// ---------------------------------------------------------------- orchestration
(async () => {
  if (want('--preview')) return preview();

  const b = await Browser.launch({ headless: true });
  const pages = [];
  try {
    if (want('--no-gsap')) {
      pages.push(...await suiteNoGsap(b));
    } else {
      const [A, B] = await openPair(b);
      pages.push(A, B);
      await suiteGameplay(A, B);
      await suiteMotion(A, B);
      await suiteResponsive(A, B);
    }
    const errs = pages.flatMap(p => p.errors());
    check('Console sans erreur ni avertissement', errs.length === 0, errs.join(' || ') || 'aucune');
  } finally {
    await b.close();
  }
  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== NAVIGATEUR : ${passed}/${results.length} =====`);
  const ko = results.filter(r => !r.ok);
  if (ko.length) console.log('Échecs : ' + ko.map(r => r.name).join(' | '));
  process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e.message); process.exit(2); });
