// Reseau factice d'une partie a deux, a la forme du jeu en production (un etat par code de
// salon, un secret par joueur). A remplacer par un module Firebase de MEME interface :
//
//   const net = createNet();
//   const { code, seat } = await net.create({ name });        // seat : 'p1'
//   const { seat } = await net.join(code, { name });          // seat : 'p2'
//   const off = net.subscribe(code, seat, (view) => ...);     // vue du joueur (secret adverse cache)
//   await net.send(code, seat, action);                       // une action, validee par le « serveur »
//
// Le « serveur » ici est ce module : il valide chaque action (tour, phase) et ne revele jamais
// le secret d'un joueur a l'autre avant la fin (principe de ucSecret d'Undercover).
// Actions : secret {id} · ask {q} · answer {yes} · done {crossed} · guess {id} · rematch · leave
// Pur : utilisable dans Node (tests), aucun acces au DOM.

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const other = (seat) => (seat === 'p1' ? 'p2' : 'p1');

export function createNet({ random = Math.random, latency = 0 } = {}) {
  const games = new Map();          // code -> { state, secrets, subs }

  const code4 = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(random() * LETTERS.length)]).join('');
  const later = (fn) => (latency ? setTimeout(fn, latency) : queueMicrotask(fn));

  function view(g, seat) {
    const s = structuredClone(g.state);
    s.me = seat;
    s.mySecret = g.secrets[seat] ?? null;
    s.reveal = s.phase === 'end' ? { ...g.secrets } : null;        // les secrets ne sortent qu'a la fin
    return s;
  }
  function publish(g) {
    for (const [seat, cbs] of Object.entries(g.subs)) for (const cb of cbs) later(() => cb(view(g, seat)));
  }
  function fresh(round, starter) {
    return { phase: 'choose', round, turn: starter, ask: null, log: [], winner: null, guess: null, startedAt: Date.now() };
  }

  return {
    async create({ name }) {
      let code; do code = code4(); while (games.has(code));
      const g = {
        state: { code, players: { p1: { name, ready: false, crossed: [], left: false, connected: true }, p2: null },
          scores: { p1: 0, p2: 0 }, rematch: {}, ...fresh(1, 'p1'), phase: 'lobby' },
        secrets: {}, subs: { p1: [], p2: [] },
      };
      games.set(code, g);
      return { code, seat: 'p1' };
    },
    async join(code, { name }) {
      const g = games.get(code);
      if (!g) throw new Error('Salon introuvable');
      if (g.state.players.p2) throw new Error('Salon complet');
      g.state.players.p2 = { name, ready: false, crossed: [], left: false, connected: true };
      g.state.phase = 'choose';
      publish(g);
      return { seat: 'p2' };
    },
    subscribe(code, seat, cb) {
      const g = games.get(code); g.subs[seat].push(cb); later(() => cb(view(g, seat)));
      return () => { g.subs[seat] = g.subs[seat].filter((x) => x !== cb); };
    },
    async send(code, seat, a) {
      const g = games.get(code); if (!g) throw new Error('Salon introuvable');
      const s = g.state, me = s.players[seat], opp = other(seat);
      const fail = (m) => { throw new Error(m); };
      switch (a.type) {
        case 'secret':
          if (s.phase !== 'choose') fail('Pas le moment de choisir');
          g.secrets[seat] = a.id; me.ready = true;
          if (s.players.p1?.ready && s.players.p2?.ready) { s.phase = 'play'; s.startedAt = Date.now(); }
          break;
        case 'ask':
          if (s.phase !== 'play' || s.turn !== seat || s.ask) fail("Ce n'est pas ton tour");
          s.ask = { by: seat, q: a.q, answer: null };
          break;
        case 'answer':
          if (!s.ask || s.ask.by === seat || s.ask.answer !== null) fail('Aucune question en attente');
          s.ask.answer = !!a.yes;
          s.log.push({ by: s.ask.by, q: s.ask.q, answer: !!a.yes, round: s.round });
          break;
        case 'done':
          if (!s.ask || s.ask.by !== seat || s.ask.answer === null) fail('Rien a rayer');
          me.crossed = [...new Set(a.crossed)];
          s.ask = null; s.turn = opp;
          break;
        case 'guess': {
          if (s.phase !== 'play' || s.turn !== seat || s.ask) fail("Ce n'est pas ton tour");
          const right = g.secrets[opp] === a.id;
          s.guess = { by: seat, id: a.id, right };
          s.winner = right ? seat : opp;
          s.scores[s.winner]++;
          s.phase = 'end'; s.endedAt = Date.now();
          break;
        }
        case 'rematch':
          if (s.phase !== 'end') fail('La manche continue');
          s.rematch[seat] = true;
          if (s.rematch.p1 && s.rematch.p2) {                          // revanche : on repart, l'autre commence
            const starter = s.round % 2 ? 'p2' : 'p1';
            Object.assign(s, fresh(s.round + 1, starter), { rematch: {} });
            for (const p of ['p1', 'p2']) Object.assign(s.players[p], { ready: false, crossed: [] });
            g.secrets = {};
          }
          break;
        case 'leave':
          me.left = true; me.connected = false;
          break;
        default: fail('Action inconnue');
      }
      publish(g);
    },
    // Pour les tests et le mode debogage : etat complet, secrets compris.
    _debug(code) { return games.get(code); },
  };
}
