// Reseau reel (Firebase Realtime Database) d'une partie a deux, MEME interface que net-mock.js :
//
//   const net = createNetFirebase({ db, uid, fb });   // fb : fonctions de 'firebase/database' (ref, get, set, update, onValue)
//   const { code, seat } = await net.create({ name }); const { seat } = await net.join(code, { name });
//   const off = net.subscribe(code, seat, (view) => ...); await net.send(code, seat, action);
//
// Donnees : qec3/<code> (partie) et qec3Secret/<code>/<uid> (secret, lisible par son seul
// proprietaire). Les regles (firebase/build-rules.js) n'autorisent que : sa place, les coups du
// tour a son tour, la reponse par l'autre joueur, la publication de son secret a la fin.
// Sans serveur de confiance, chaque client tient aussi son role d'arbitre honnete : il juge la
// designation adverse avec son propre secret, publie son secret a la fin, et l'hote relance la
// manche quand les deux veulent la revanche. Injection de `fb` : le meme code tourne dans le
// navigateur (SDK de gstatic) et dans Node (tests contre l'emulateur).

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const other = (s) => (s === 'p1' ? 'p2' : 'p1');
const arr = (o) => (Array.isArray(o) ? o.filter((x) => x !== null && x !== undefined) : o ? Object.values(o) : []);

export function createNetFirebase({ db, uid, fb, random = Math.random, now = () => Date.now() }) {
  const r = (p) => fb.ref(db, p);
  const genCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(random() * LETTERS.length)]).join('') + '-' + String(Math.floor(random() * 100)).padStart(2, '0');
  const rooms = new Map();                                   // code -> { data, secret }

  function view(code, seat) {
    const st = rooms.get(code); const d = st?.data || {};
    const pl = (s) => d.players?.[s] ? { name: d.players[s].name, ready: !!d.players[s].ready, left: !!d.players[s].left, crossed: arr(d.players[s].crossed), connected: !d.players[s].left } : null;
    return {
      code, me: seat, phase: d.phase, round: d.round || 1, turn: d.turn || 'p1',
      players: { p1: pl('p1'), p2: pl('p2') }, scores: { p1: d.scores?.p1 || 0, p2: d.scores?.p2 || 0 },
      ask: d.ask ? { by: d.ask.by, q: d.ask.q, answer: d.ask.answer ?? null } : null,
      log: arr(d.log), winner: d.winner || null, guess: d.guess ? { by: d.guess.by, id: d.guess.id, right: d.guess.right ?? null } : null,
      rematch: d.rematch || {}, mySecret: st?.secret ?? null,
      reveal: d.phase === 'end' && d.reveal ? { p1: d.reveal.p1 ?? null, p2: d.reveal.p2 ?? null } : null,
      startedAt: d.startedAt || now(), endedAt: d.endedAt || null,
    };
  }

  // Devoirs d'un client honnete, a chaque changement d'etat.
  async function duties(code, seat) {
    const st = rooms.get(code); const d = st?.data; if (!d) return;
    const opp = other(seat);
    try {
      // la designation de l'autre me vise : je dis si c'est juste, avec mon secret
      if (d.phase === 'play' && d.guess && d.guess.by === opp && d.guess.right === undefined && st.secret !== null) {
        const right = d.guess.id === st.secret, winner = right ? opp : seat;
        await fb.update(r(`qec3/${code}`), { 'guess/right': right, winner, [`scores/${winner}`]: (d.scores?.[winner] || 0) + 1, phase: 'end', endedAt: now(), [`reveal/${seat}`]: st.secret });
        return;
      }
      // fin de manche : je publie mon secret (une seule fois)
      if (d.phase === 'end' && st.secret !== null && d.reveal?.[seat] === undefined) {
        await fb.set(r(`qec3/${code}/reveal/${seat}`), st.secret);
      }
      // revanche acceptee des deux cotes : l'hote relance la manche, l'autre commence
      if (d.phase === 'end' && d.rematch?.p1 && d.rematch?.p2 && seat === 'p1') {
        const round = (d.round || 1) + 1;
        await fb.update(r(`qec3/${code}`), { phase: 'choose', round, turn: round % 2 ? 'p1' : 'p2', ask: null, guess: null, winner: null, rematch: null, reveal: null, startedAt: now(), endedAt: null });
      }
      // nouvelle manche : chacun remet sa place a zero
      if (d.phase === 'choose' && st.round !== d.round) {
        st.round = d.round; st.secret = null;
        if (d.players?.[seat]?.ready) await fb.update(r(`qec3/${code}/players/${seat}`), { ready: false, crossed: null });
      }
    } catch (_) { /* un autre client a deja fait le geste : sans gravite */ }
  }

  return {
    async create({ name }) {
      let code;
      for (let k = 0; k < 8; k++) { code = genCode(); if (!(await fb.get(r(`qec3/${code}/phase`))).exists()) break; }
      await fb.set(r(`qec3/${code}`), {
        hostUid: uid, members: { [uid]: true }, seats: { p1: uid }, phase: 'lobby', round: 1, turn: 'p1',
        players: { p1: { name, ready: false, left: false } }, scores: { p1: 0, p2: 0 }, startedAt: now(),
      });
      return { code, seat: 'p1' };
    },
    async join(code, { name }) {
      const ph = (await fb.get(r(`qec3/${code}/phase`))).val();
      if (!ph) throw new Error('Salon introuvable');
      if (ph !== 'lobby') throw new Error('Partie déjà lancée');
      await fb.set(r(`qec3/${code}/members/${uid}`), true);
      await fb.set(r(`qec3/${code}/seats/p2`), uid);
      await fb.set(r(`qec3/${code}/players/p2`), { name, ready: false, left: false });
      await fb.set(r(`qec3/${code}/phase`), 'choose');
      return { seat: 'p2' };
    },
    subscribe(code, seat, cb) {
      const st = { data: null, secret: null, round: 1 }; rooms.set(code, st);
      const emit = () => { cb(view(code, seat)); duties(code, seat); };
      const off1 = fb.onValue(r(`qec3/${code}`), (s) => { st.data = s.val(); emit(); });
      const off2 = fb.onValue(r(`qec3Secret/${code}/${uid}`), (s) => { st.secret = s.val()?.id ?? null; if (st.data) emit(); });
      return () => { off1(); off2(); };
    },
    async send(code, seat, a) {
      const st = rooms.get(code); const d = st?.data || (await fb.get(r(`qec3/${code}`))).val();
      const opp = other(seat), base = `qec3/${code}`;
      switch (a.type) {
        case 'secret': {
          await fb.set(r(`qec3Secret/${code}/${uid}`), { id: a.id });
          if (st) st.secret = a.id;
          await fb.set(r(`${base}/players/${seat}/ready`), true);
          const fresh = (await fb.get(r(base))).val();
          if (fresh.players?.[opp]?.ready && fresh.phase === 'choose') await fb.update(r(base), { phase: 'play', startedAt: now() });
          break;
        }
        case 'ask': await fb.set(r(`${base}/ask`), { by: seat, q: a.q }); break;
        case 'answer': {
          await fb.set(r(`${base}/ask/answer`), !!a.yes);
          const n = arr(d.log).length;
          await fb.set(r(`${base}/log/${n}`), { by: d.ask.by, q: d.ask.q, answer: !!a.yes, round: d.round || 1 });
          break;
        }
        case 'done':
          await fb.set(r(`${base}/players/${seat}/crossed`), [...new Set(a.crossed)]);
          await fb.update(r(base), { ask: null, turn: opp });
          break;
        case 'guess': await fb.set(r(`${base}/guess`), { by: seat, id: a.id }); break;
        case 'rematch': await fb.set(r(`${base}/rematch/${seat}`), true); break;
        case 'leave': await fb.set(r(`${base}/players/${seat}/left`), true); break;
        default: throw new Error('Action inconnue');
      }
    },
  };
}
