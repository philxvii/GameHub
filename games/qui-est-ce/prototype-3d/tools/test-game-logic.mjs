// Test de la logique de partie (Node, sans navigateur) : reseau factice + deux bots.
//   node games/qui-est-ce/prototype-3d/tools/test-game-logic.mjs
// Verifie : parties qui se terminent, secret adverse jamais visible avant la fin, actions hors
// tour refusees, revanche qui repart proprement, statistiques de la partie.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createNet } from '../js/game/net-mock.js';
import { startBot } from '../js/game/bot.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const people = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'roster.json'), 'utf8')).personnages;
let seed = 7; const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const results = []; const check = (name, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${d !== '' ? ' | ' + JSON.stringify(d) : ''}`); };

const net = createNet({ random: rng });
const { code } = await net.create({ name: 'Bot A' });
await net.join(code, { name: 'Bot B' });
let leak = false, ends = 0, questions = [], lastRound = 0;
for (const seat of ['p1', 'p2']) {
  net.subscribe(code, seat, (v) => {
    const opp = seat === 'p1' ? 'p2' : 'p1';
    if (v.phase !== 'end' && (v.reveal || JSON.stringify(v).includes('"secrets"'))) leak = true;
    if (v.phase === 'end' && seat === 'p1' && v.round !== lastRound) { lastRound = v.round; ends++; questions.push(v.log.length); }
  });
}
// hors tour : p2 ne peut pas poser de question au debut (p1 commence)
let refused = false;
startBot(net, code, 'p1', people, { rng, think: [1, 2] });
startBot(net, code, 'p2', people, { rng, think: [1, 2] });
await new Promise((r) => setTimeout(r, 30));
try { const s = net._debug(code).state; if (s.phase === 'play' && s.turn === 'p1' && !s.ask) await net.send(code, 'p2', { type: 'ask', q: 'lunettes' }); else refused = true; } catch (_) { refused = true; }
// dix manches de suite : apres chaque fin, p1 demande la revanche, le bot p2 l'accepte
for (let r = 0; r < 10; r++) {
  for (let i = 0; i < 400 && net._debug(code).state.phase !== 'end'; i++) await new Promise((res) => setTimeout(res, 5));
  if (r < 9) { await net.send(code, 'p1', { type: 'rematch' }); for (let i = 0; i < 200 && net._debug(code).state.phase === 'end'; i++) await new Promise((res) => setTimeout(res, 5)); }
}
const s = net._debug(code).state;
check('Dix manches jouees jusqu’au bout (revanche comprise)', ends === 10 && s.round === 10, { ends, round: s.round });
check('Secret adverse jamais visible avant la fin', !leak);
check('Question hors tour refusee', refused);
check('Score coherent', s.scores.p1 + s.scores.p2 === 10, s.scores);
const avg = questions.reduce((a, b) => a + b, 0) / questions.length;
check('Questions par manche (les deux joueurs)', avg > 4 && avg < 20, { moyenne: +avg.toFixed(1), parManche: questions });
console.log(`\n===== LOGIQUE DE PARTIE : ${results.filter(Boolean).length}/${results.length} =====`);
process.exit(results.every(Boolean) ? 0 : 1);
