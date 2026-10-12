// Phase 1 : règles compatibles avec les clients actuels, qui ne s'authentifient pas.
// Chaque test rejoue une opération réelle d'un jeu (autorisée) ou une attaque (refusée).
//
//   cd firebase && npm test

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove, push, runTransaction, increment, onDisconnect } from 'firebase/database';

// Les mêmes opérations doivent passer avec les règles de transition (anciens clients en ligne).
const FILES = { 'database.rules.json': 'demo-gamehub', 'database.rules.transition.json': 'demo-gamehub-tr' };
for (const [FILE, projectId] of Object.entries(FILES)) describe(FILE, () => {
  let env, db;

  const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));
  const read = async path => {
    let v; await env.withSecurityRulesDisabled(async ctx => { v = (await get(ref(ctx.database(), path))).val(); }); return v;
  };

  before(async () => {
    env = await initializeTestEnvironment({
      projectId,
      database: { rules: readFileSync(new URL(`../${FILE}`, import.meta.url), 'utf8'), host: '127.0.0.1', port: 9000 },
    });
  });
  after(() => env.cleanup());
  beforeEach(async () => {
    await env.clearDatabase();
    db = env.unauthenticatedContext().database();
  });

  // Préfixe → code tel que le génère le jeu.
  const GAMES = {
    games: 'LOUP-42', banqueroll: 'ROLL-17', p4: 'DISC-42', qec2: 'FACE-33',
    bn: 'NAVY-21', rl: 'SPIN-55', mg: 'GOLF-12', uno: 'WILD-90',
  };

  describe('Base : refus par défaut', () => {
    test('lecture de la racine refusée', () => assertFails(get(ref(db))));
    test('écriture de la racine refusée', () => assertFails(set(ref(db), { pwned: true })));
    test('suppression de la racine refusée', () => assertFails(remove(ref(db))));
    test('préfixe inconnu (ancien wr) illisible et non inscriptible', async () => {
      await seed('wr/OLD-11', { phase: 'lobby' });
      await assertFails(get(ref(db, 'wr')));
      await assertFails(get(ref(db, 'wr/OLD-11')));
      await assertFails(set(ref(db, 'wr/OLD-12'), { phase: 'lobby' }));
    });
    test('nouveau nœud racine arbitraire refusé', () => assertFails(set(ref(db, 'stockage/x'), 'données')));
  });

  for (const [prefix, code] of Object.entries(GAMES)) {
    describe(`${prefix} : opérations normales du client`, () => {
      test('créer, rejoindre, lire, jouer, supprimer', async () => {
        const game = { code, phase: 'lobby', players: [{ name: 'Alice', ready: false }], createdAt: Date.now() };
        await assertSucceeds(set(ref(db, `${prefix}/${code}`), game));
        await assertSucceeds(get(ref(db, `${prefix}/${code}`)));
        await assertSucceeds(update(ref(db, `${prefix}/${code}`), { players: [...game.players, { name: 'Bob', ready: false }] }));
        await assertSucceeds(update(ref(db, `${prefix}/${code}`), { phase: 'playing', turnIndex: 0 }));
        await assertSucceeds(remove(ref(db, `${prefix}/${code}`)));
      });
      test('un code introuvable se lit comme absent (pas de refus)', async () => {
        const snap = await assertSucceeds(get(ref(db, `${prefix}/ABCD-99`)));
        if (snap.exists()) throw new Error('aurait dû être vide');
      });
    });

    describe(`${prefix} : accès refusés`, () => {
      test('énumération de toutes les parties refusée', async () => {
        await seed(`${prefix}/${code}`, { phase: 'lobby', players: [{ name: 'Alice' }] });
        await assertFails(get(ref(db, prefix)));
      });
      test('suppression de toutes les parties refusée', async () => {
        await seed(`${prefix}/${code}`, { phase: 'lobby', players: [{ name: 'Alice' }] });
        await assertFails(remove(ref(db, prefix)));
        await assertFails(set(ref(db, prefix), null));
        if (!(await read(`${prefix}/${code}`))) throw new Error('la partie a disparu');
      });
      test('écriture multi-chemins avec un chemin interdit refusée en bloc', async () => {
        await assertFails(update(ref(db, prefix), { [`${code}/phase`]: 'lobby', 'hors-format/phase': 'lobby' }));
        await assertFails(update(ref(db), { [`${prefix}/${code}/phase`]: 'lobby', 'hub/settings/ageGate': false }));
        if (await read(`${prefix}/${code}`)) throw new Error('écriture partielle appliquée');
      });
      test('code hors format refusé', async () => {
        await assertFails(set(ref(db, `${prefix}/n-importe-quoi`), { phase: 'lobby' }));
        await assertFails(set(ref(db, `${prefix}/${'A'.repeat(300)}`), { phase: 'lobby' }));
      });
      test('partie sans phase refusée (stockage arbitraire)', () =>
        assertFails(set(ref(db, `${prefix}/${code}`), { blob: 'x'.repeat(1000) })));
      test('écriture partielle dans une partie supprimée refusée', () =>
        assertFails(update(ref(db, `${prefix}/${code}`), { players: [{ name: 'Zombie' }] })));
      test('prénom contenant du HTML refusé', async () => {
        await seed(`${prefix}/${code}`, { phase: 'lobby', players: [{ name: 'Alice' }] });
        await assertFails(update(ref(db, `${prefix}/${code}`), { players: [{ name: 'Alice' }, { name: '<img src=x onerror=alert(1)>' }] }));
      });
      test('prénom vide ou trop long refusé', async () => {
        await seed(`${prefix}/${code}`, { phase: 'lobby', players: [{ name: 'Alice' }] });
        await assertFails(update(ref(db, `${prefix}/${code}`), { players: [{ name: '' }] }));
        await assertFails(update(ref(db, `${prefix}/${code}`), { players: [{ name: 'x'.repeat(31) }] }));
      });
      test('phase non textuelle refusée', async () => {
        await seed(`${prefix}/${code}`, { phase: 'lobby', players: [{ name: 'Alice' }] });
        await assertFails(update(ref(db, `${prefix}/${code}`), { phase: { evil: true } }));
      });
    });
  }

  describe('Undercover : opérations spécifiques', () => {
    test('partie de test admin (TEST-NN) toujours possible', () =>
      assertSucceeds(set(ref(db, 'games/TEST-42'), { code: 'TEST-42', phase: 'playing', players: [{ name: 'Admin (toi)' }, { name: 'Bot-Alpha' }] })));
    test('vote et passage en dépouillement', async () => {
      await seed('games/LOUP-42', { phase: 'voting', players: [{ name: 'Alice' }, { name: 'Bob' }], votes: {} });
      await assertSucceeds(update(ref(db, 'games/LOUP-42'), { votes: { Alice: 'Bob' } }));
      await assertSucceeds(update(ref(db, 'games/LOUP-42'), { phase: 'vote-counting' }));
    });
    test("la liste admin de toutes les parties n'est plus lisible", () => assertFails(get(ref(db, 'games'))));
  });

  describe('Banqueroll : écritures profondes réelles', () => {
    const code = 'ROLL-17';
    const base = { code, hostId: 'h1', phase: 'playing', players: [{ id: 'h1', name: 'Alice', cash: 1000 }, { id: 'p2', name: 'Bob', cash: 1025 }] };
    beforeEach(() => seed(`banqueroll/${code}`, base));

    test('code de repli avec suffixe (ROLL-17-a3x)', () =>
      assertSucceeds(set(ref(db, 'banqueroll/ROLL-17-a3x'), { ...base, code: 'ROLL-17-a3x' })));
    test('commit multi-chemins', () =>
      assertSucceeds(update(ref(db, `banqueroll/${code}`), { 'players/0/cash': 900, 'players/1/cash': 1125, turnIndex: 1 })));
    test('historique et chat par push', async () => {
      await assertSucceeds(push(ref(db, `banqueroll/${code}/history`), { ts: 1, text: 'achat' }));
      const k = push(ref(db, `banqueroll/${code}/chat`), { ts: 1, from: 'h1', text: 'salut' });
      await assertSucceeds(k);
      await assertSucceeds(update(ref(db, `banqueroll/${code}/chat/${k.key}`), { boast: true }));
    });
    test('présence avec onDisconnect', async () => {
      const p = ref(db, `banqueroll/${code}/presence/p2`);
      await assertSucceeds(set(p, { online: true, ts: 1 }));
      await assertSucceeds(onDisconnect(p).remove());
    });
    test('transaction sur un statut (open → closing)', async () => {
      await seed(`banqueroll/${code}/auction`, { status: 'open', bid: 10 });
      await assertSucceeds(runTransaction(ref(db, `banqueroll/${code}/auction/status`), st => (st === 'open' ? 'closing' : undefined)));
    });
    test('mémoire du présentateur', () =>
      assertSucceeds(update(ref(db, `banqueroll/${code}`), { hostMem: { quotes: ['a'], used: [], facts: [] } })));
    test('transaction sur la partie entière (rejoindre)', () =>
      assertSucceeds(runTransaction(ref(db, `banqueroll/${code}`), cur => cur && { ...cur, players: [...cur.players, { id: 'p3', name: 'Chloé', cash: 1050 }] })));
  });

  describe('Hub : présence, compteur, réglages', () => {
    test('présence : écrire sa clé, la retirer à la déconnexion, compter', async () => {
      const me = ref(db, 'hub/online/k3j9x0abcd');
      await assertSucceeds(set(me, { t: Date.now() }));
      await assertSucceeds(onDisconnect(me).remove());
      await assertSucceeds(get(ref(db, 'hub/online')));
      await assertSucceeds(remove(me));
    });
    test('présence : champs arbitraires, clé hors format, écrasement global refusés', async () => {
      await assertFails(set(ref(db, 'hub/online/k3j9x0'), { t: 1, payload: 'x' }));
      await assertFails(set(ref(db, 'hub/online/k3j9x0'), { t: 'maintenant' }));
      await assertFails(set(ref(db, 'hub/online/<script>'), { t: 1 }));
      await assertFails(set(ref(db, 'hub/online'), null));
    });
    test('compteur de visites : +1 accepté', async () => {
      await seed('hub/stats/visits', 41);
      await assertSucceeds(update(ref(db, 'hub/stats'), { visits: increment(1) }));
      if ((await read('hub/stats/visits')) !== 42) throw new Error('compteur faux');
      await assertSucceeds(get(ref(db, 'hub/stats/visits')));
    });
    test('compteur de visites : premier passage (absent → 1)', () =>
      assertSucceeds(update(ref(db, 'hub/stats'), { visits: increment(1) })));
    test('compteur de visites : saut, remise à zéro, texte refusés', async () => {
      await seed('hub/stats/visits', 41);
      await assertFails(set(ref(db, 'hub/stats/visits'), 999999));
      await assertFails(set(ref(db, 'hub/stats/visits'), 0));
      await assertFails(set(ref(db, 'hub/stats/visits'), '<b>hack</b>'));
      await assertFails(set(ref(db, 'hub/stats'), { visits: 42, extra: 1 }));
    });
    test('réglages lisibles, mais non modifiables par un visiteur', async () => {
      await seed('hub', { hidden: { uno: false }, settings: { ageGate: true }, updateLog: [{ ts: 1, change: 'ok' }] });
      await assertSucceeds(get(ref(db, 'hub/hidden')));
      await assertSucceeds(get(ref(db, 'hub/settings/ageGate')));
      await assertSucceeds(get(ref(db, 'hub/updateLog')));
      await assertFails(update(ref(db, 'hub/hidden'), { uno: true }));
      await assertFails(update(ref(db, 'hub/settings'), { ageGate: false }));
      await assertFails(set(ref(db, 'hub/updateLog'), [{ ts: 2, change: '<img src=x onerror=alert(1)>' }]));
      await assertFails(remove(ref(db, 'hub')));
    });
    test('hub entier illisible (pas de lecture parente)', () => assertFails(get(ref(db, 'hub'))));
  });
});
