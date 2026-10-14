// Adversaire simule : un joueur comme un autre, branche sur le reseau factice (net-mock.js).
// Il choisit un secret au hasard, repond honnetement, pose a chaque tour une des questions qui
// coupent le mieux ses candidats restants (pas toujours la meilleure : il reste battable),
// raye ce qui ne colle pas, et designe quand il ne reste qu'un candidat. Il accepte la revanche.
// Pur : utilisable dans Node (tests). onSay(texte) : ses petites piques, pour l'interface.

import { QUESTIONS, byId } from './questions.js';

const LINES = {
  ask: ['Bon. Question piege :', 'Je sens que ça va faire mal :', 'Simple curiosité :', 'Allez, avoue :'],
  yes: ['Je le savais.', 'Intéressant…', 'Noté. Au crayon gras.'],
  no: ['Ah. Je reformule mes soupçons.', 'Pas grave, j’avais un plan B.', 'Hmm. Inattendu.'],
  win: ['Élémentaire.', 'C’était écrit sur son visage.', 'Je prends la pose pour la photo ?'],
  lose: ['Je demande à revoir la planche contact.', 'Coup de chance. Revanche ?', 'Bien joué… pour cette fois.'],
  rematch: ['Revanche acceptée. Je m’échauffe les crayons.'],
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function startBot(net, code, seat, people, { rng = Math.random, think = [900, 1800], onSay = () => {} } = {}) {
  let round = 0, candidates = [], asked = new Set(), busy = false, last = null, saidEnd = 0;
  const all = people.map((_, i) => i);
  const wait = () => new Promise((r) => setTimeout(r, think[0] + rng() * (think[1] - think[0])));
  const act = async (a) => { busy = true; await wait(); try { await net.send(code, seat, a); } catch (_) { /* etat deja change */ } busy = false; if (last) step(last); };

  function choose(s) {
    // parmi les 3 meilleures questions, la meilleure 2 fois sur 3 : un adversaire credible, pas un oracle
    const ranked = QUESTIONS.filter((q) => !asked.has(q.id)).map((q) => {
      const yes = candidates.filter((i) => q.test(people[i].attributs)).length;
      return { q, score: yes === 0 || yes === candidates.length ? Infinity : Math.abs(2 * yes - candidates.length) };
    }).filter((x) => x.score < Infinity).sort((a, b) => a.score - b.score);
    if (!ranked.length) return null;
    return rng() < 0.67 ? ranked[0].q : ranked[Math.min(ranked.length - 1, 1 + Math.floor(rng() * 2))].q;
  }

  function step(s) {
    last = s;
    if (busy) return;
    if (s.round !== round) { round = s.round; candidates = [...all]; asked = new Set(); }
    const me = s.players[seat], opp = seat === 'p1' ? 'p2' : 'p1';
    if (s.phase === 'choose' && !me.ready) return act({ type: 'secret', id: Math.floor(rng() * people.length) });
    if (s.phase === 'play') {
      if (s.ask && s.ask.by !== seat && s.ask.answer === null) {
        return act({ type: 'answer', yes: byId[s.ask.q].test(people[s.mySecret].attributs) });
      }
      if (s.ask && s.ask.by === seat && s.ask.answer !== null) {
        const q = byId[s.ask.q];
        onSay(pick(rng, s.ask.answer ? LINES.yes : LINES.no));
        candidates = candidates.filter((i) => q.test(people[i].attributs) === s.ask.answer);
        return act({ type: 'done', crossed: all.filter((i) => !candidates.includes(i)) });
      }
      if (s.turn === seat && !s.ask) {
        if (candidates.length === 1) return act({ type: 'guess', id: candidates[0] });
        const q = choose(s);
        if (!q) return act({ type: 'guess', id: candidates[Math.floor(rng() * candidates.length)] });
        asked.add(q.id);
        onSay(`${pick(rng, LINES.ask)} ${q.label}`);
        return act({ type: 'ask', q: q.id });
      }
    }
    if (s.phase === 'end') {
      if (saidEnd !== s.round) { saidEnd = s.round; onSay(pick(rng, s.winner === seat ? LINES.win : LINES.lose)); }
      if (s.rematch[opp] && !s.rematch[seat]) { onSay(pick(rng, LINES.rematch)); return act({ type: 'rematch' }); }
    }
  }
  return net.subscribe(code, seat, step);
}
