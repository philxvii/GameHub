// Phase 2 : comptes anonymes, membres, hôte, admin, secrets d'Undercover.
// Profils : alice (hôte), bob (membre), eve (connectée, étrangère à la partie),
// un visiteur sans compte, et admin1 (inscrit dans admins/).

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove, push, runTransaction, increment, query, orderByKey, onDisconnect, serverTimestamp } from 'firebase/database';

const RULES = readFileSync(new URL('../database.rules.phase2.json', import.meta.url), 'utf8');
let env, alice, bob, eve, anon, admin;

const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));
const read = async path => {
  let v; await env.withSecurityRulesDisabled(async ctx => { v = (await get(ref(ctx.database(), path))).val(); }); return v;
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gamehub-p2',
    database: { rules: RULES, host: '127.0.0.1', port: 9000 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await seed('admins/admin1', true);
  alice = env.authenticatedContext('alice').database();
  bob = env.authenticatedContext('bob').database();
  eve = env.authenticatedContext('eve').database();
  admin = env.authenticatedContext('admin1').database();
  anon = env.unauthenticatedContext().database();
});

const GAMES = {
  games: 'LOUP-42', banqueroll: 'ROLL-17', p4: 'DISC-42', qec2: 'FACE-33',
  bn: 'NAVY-21', rl: 'SPIN-55', mg: 'GOLF-12', uno: 'WILD-90',
};
const lobby = code => ({ code, phase: 'lobby', hostUid: 'alice', members: { alice: true }, players: [{ name: 'Alice' }] });

for (const [P, code] of Object.entries(GAMES)) {
  const r = (db, path = '') => ref(db, `${P}/${code}${path ? '/' + path : ''}`);

  describe(`${P} : parcours normal`, () => {
    test("créer, rejoindre, jouer, se reconnecter, supprimer", async () => {
      await assertSucceeds(set(r(alice), lobby(code)));
      // Bob : la phase est visible, il s'inscrit puis lit.
      await assertSucceeds(get(r(bob, 'phase')));
      await assertSucceeds(set(r(bob, 'members/bob'), true));
      await assertSucceeds(get(r(bob)));
      await assertSucceeds(update(r(bob), { players: [{ name: 'Alice' }, { name: 'Bob' }] }));
      await assertSucceeds(update(r(alice), { phase: 'playing', turnIndex: 0 }));
      await assertSucceeds(update(r(bob), { turnIndex: 1, 'players/1/score': 3 }));
      // Reconnexion (même compte anonyme après rechargement) : lecture et écoute directes.
      await assertSucceeds(get(r(bob)));
      await assertSucceeds(remove(r(alice)));
    });
  });

  describe(`${P} : accès refusés`, () => {
    beforeEach(() => seed(`${P}/${code}`, lobby(code)));

    test('visiteur sans compte : ni lecture, ni phase, ni écriture', async () => {
      await assertFails(get(r(anon)));
      await assertFails(get(r(anon, 'phase')));
      await assertFails(set(r(anon, 'members/x'), true));
      await assertFails(set(ref(anon, `${P}/ABCD-11`), { ...lobby('ABCD-11'), hostUid: 'x', members: { x: true } }));
    });
    test("compte étranger : ne lit pas la partie, n'écrit rien", async () => {
      await assertFails(get(r(eve)));
      await assertFails(get(r(eve, 'players')));
      await assertFails(update(r(eve), { phase: 'gameover' }));
      await assertFails(remove(r(eve)));
      await assertSucceeds(get(r(eve, 'phase')));
    });
    test("pas d'énumération ni de suppression globale, même pour un membre", async () => {
      await assertFails(get(ref(alice, P)));
      await assertFails(get(query(ref(alice, P), orderByKey())));
      await assertFails(remove(ref(alice, P)));
      await assertFails(get(ref(alice)));
    });
    test("création : pas d'écrasement, pas d'hôte usurpé, pas de partie sans membre", async () => {
      await assertFails(set(r(eve), { ...lobby(code), hostUid: 'eve', members: { eve: true } }));
      await assertFails(set(ref(eve, `${P}/ABCD-11`), { ...lobby('ABCD-11') }));               // hôte = alice
      await assertFails(set(ref(eve, `${P}/ABCD-11`), { ...lobby('ABCD-11'), hostUid: 'eve', members: {} }));
      await assertFails(set(ref(eve, `${P}/mauvais`), { ...lobby('x'), hostUid: 'eve', members: { eve: true } }));
      await assertSucceeds(set(ref(eve, `${P}/ABCD-11`), { ...lobby('ABCD-11'), hostUid: 'eve', members: { eve: true } }));
    });
    test("membres : on ne s'inscrit que soi-même", async () => {
      await assertFails(set(r(eve, 'members/bob'), true));
      await assertFails(set(r(eve, 'members/eve'), 'oui'));
      await assertSucceeds(set(r(bob, 'members/bob'), true));
      await assertFails(set(r(bob, 'members/eve'), true));
    });
    test("un membre ne change pas l'hôte, ne l'exclut pas, ne supprime pas la partie", async () => {
      await seed(`${P}/${code}/members/bob`, true);
      await assertFails(update(r(bob), { hostUid: 'bob' }));
      await assertFails(remove(r(bob, 'members/alice')));
      await assertFails(set(r(bob, 'members'), { bob: true }));
      await assertFails(remove(r(bob)));
      await assertFails(set(r(bob), null));
      if (!(await read(`${P}/${code}`))) throw new Error('partie supprimée');
    });
    test('écriture multi-chemins vers une autre partie refusée en bloc', async () => {
      await seed(`${P}/${code}/members/bob`, true);
      await seed(`${P}/AUTRE-11`, { ...lobby('AUTRE-11'), hostUid: 'eve', members: { eve: true } });
      await assertFails(update(ref(bob), { [`${P}/${code}/turn`]: 1, [`${P}/AUTRE-11/phase`]: 'gameover' }));
      if ((await read(`${P}/${code}/turn`)) !== null) throw new Error('écriture partielle');
    });
    test('format : prénom HTML, phase non textuelle refusés', async () => {
      await seed(`${P}/${code}/members/bob`, true);
      await assertFails(update(r(bob), { players: [{ name: 'Alice' }, { name: '<script>x</script>' }] }));
      await assertFails(update(r(bob), { phase: 42 }));
    });
    test('admin : liste, lit, supprime', async () => {
      await assertSucceeds(get(ref(admin, P)));
      await assertSucceeds(get(r(admin)));
      await assertSucceeds(update(r(admin), { players: [null] }));
      await assertSucceeds(remove(r(admin)));
    });
  });

  describe(`${P} : entrer en cours de partie`, () => {
    test(P === 'rl' ? 'Roulette : possible à tout moment' : 'refusé hors du salon', async () => {
      await seed(`${P}/${code}`, { ...lobby(code), phase: 'playing' });
      const join = set(r(eve, 'members/eve'), true);
      if (P === 'rl') await assertSucceeds(join); else await assertFails(join);
    });
  });
}

describe('Banqueroll : écritures profondes des membres', () => {
  const code = 'ROLL-17';
  beforeEach(() => seed(`banqueroll/${code}`, { code, phase: 'playing', hostUid: 'alice', members: { alice: true, bob: true },
    players: [{ id: 'h1', name: 'Alice', cash: 1000 }, { id: 'p2', name: 'Bob', cash: 1025 }], auction: { status: 'open' } }));
  test('push, présence, onDisconnect, transactions', async () => {
    await assertSucceeds(push(ref(bob, `banqueroll/${code}/chat`), { ts: 1, text: 'salut' }));
    await assertSucceeds(set(ref(bob, `banqueroll/${code}/presence/p2`), { online: true }));
    await assertSucceeds(onDisconnect(ref(bob, `banqueroll/${code}/presence/p2`)).remove());
    await assertSucceeds(runTransaction(ref(bob, `banqueroll/${code}/auction/status`), s => (s === 'open' ? 'closing' : undefined)));
    await assertSucceeds(runTransaction(ref(alice, `banqueroll/${code}`), cur => cur && { ...cur, turnIndex: 2 }));
  });
  test('un étranger ne pousse rien dans le chat', () =>
    assertFails(push(ref(eve, `banqueroll/${code}/chat`), { ts: 1, text: 'spam' })));
});

describe('Undercover : secrets', () => {
  const code = 'LOUP-42';
  const host = { civilWord: 'Café', undercoverWord: 'Thé', roles: ['civil', 'undercover', 'civil'] };
  beforeEach(async () => {
    await seed(`games/${code}`, { ...lobby(code), members: { alice: true, bob: true }, players: [{ name: 'Alice', uid: 'alice' }, { name: 'Bob', uid: 'bob' }] });
  });

  test("les mots et les rôles ne peuvent pas être écrits dans la partie publique", async () => {
    await assertFails(update(ref(alice, `games/${code}`), { civilWord: 'Café' }));
    await assertFails(update(ref(alice, `games/${code}`), { undercoverWord: 'Thé' }));
    await assertFails(update(ref(alice, `games/${code}`), { roles: ['civil'] }));
    await assertFails(set(ref(alice, 'games/ABCD-11'), { ...lobby('ABCD-11'), civilWord: 'Café' }));
  });
  test("l'hôte écrit et lit ucHost ; ni un membre ni un étranger ne le lisent", async () => {
    await assertSucceeds(set(ref(alice, `ucHost/${code}`), host));
    await assertSucceeds(get(ref(alice, `ucHost/${code}`)));
    await assertFails(get(ref(bob, `ucHost/${code}`)));
    await assertFails(get(ref(eve, `ucHost/${code}`)));
    await assertFails(get(ref(anon, `ucHost/${code}`)));
    await assertFails(set(ref(bob, `ucHost/${code}`), { ...host, civilWord: 'Pirate' }));
  });
  test('chacun lit son secret et aucun autre', async () => {
    await assertSucceeds(set(ref(alice, `ucSecret/${code}/bob`), { role: 'undercover', word: 'Thé' }));
    await assertSucceeds(set(ref(alice, `ucSecret/${code}/alice`), { role: 'civil', word: 'Café' }));
    await assertSucceeds(get(ref(bob, `ucSecret/${code}/bob`)));
    await assertFails(get(ref(bob, `ucSecret/${code}/alice`)));
    await assertFails(get(ref(bob, `ucSecret/${code}`)));
    await assertFails(get(query(ref(bob, `ucSecret/${code}`), orderByKey())));
    await assertFails(get(ref(bob, 'ucSecret')));
    await assertFails(get(ref(eve, `ucSecret/${code}/bob`)));
    await assertFails(get(ref(anon, `ucSecret/${code}/bob`)));
  });
  test('un joueur ne modifie ni son rôle ni celui des autres', async () => {
    await seed(`ucSecret/${code}/bob`, { role: 'undercover', word: 'Thé' });
    await assertFails(set(ref(bob, `ucSecret/${code}/bob`), { role: 'civil', word: 'Café' }));
    await assertFails(set(ref(bob, `ucSecret/${code}/alice`), { role: 'mrwhite' }));
    await assertFails(set(ref(eve, `ucSecret/${code}/eve`), { role: 'civil', word: 'Café' }));
  });
  test('format des secrets', async () => {
    await assertFails(set(ref(alice, `ucSecret/${code}/bob`), { role: 'espion', word: 'Thé' }));
    await assertFails(set(ref(alice, `ucSecret/${code}/bob`), { role: 'civil', word: 'x'.repeat(61) }));
    await assertFails(set(ref(alice, `ucSecret/${code}/bob`), { role: 'civil', extra: 1 }));
    await assertFails(set(ref(alice, `ucHost/${code}`), { civilWord: 'Café', undercoverWord: 'Thé', roles: ['roi'] }));
    await assertSucceeds(set(ref(alice, `ucSecret/${code}/bob`), { role: 'mrwhite' }));
  });
  test("pas de nœud secret pour une partie qui n'est pas la sienne", async () => {
    await assertFails(set(ref(eve, `ucHost/${code}`), host));
    await assertFails(set(ref(eve, 'ucHost/ZZZZ-99'), host));
    await assertFails(set(ref(bob, `ucSecret/${code}/bob`), { role: 'civil' }));
  });
  test("fin de partie : l'hôte publie les mots et les rôles, l'hôte nettoie", async () => {
    await seed(`ucHost/${code}`, host);
    await seed(`ucSecret/${code}/bob`, { role: 'undercover', word: 'Thé' });
    await assertSucceeds(update(ref(alice, `games/${code}`), { phase: 'gameover', winner: 'civils', reveal: host }));
    await assertSucceeds(get(ref(bob, `games/${code}/reveal`)));
    await assertFails(remove(ref(bob, `ucSecret/${code}`)));
    await assertSucceeds(remove(ref(alice, `ucSecret/${code}`)));
    await assertSucceeds(remove(ref(alice, `ucHost/${code}`)));
    await assertSucceeds(remove(ref(alice, `games/${code}`)));
  });
  test('admin : lit et nettoie les secrets orphelins', async () => {
    await seed(`ucHost/OLD-11`, host);
    await assertSucceeds(get(ref(admin, 'ucHost')));
    await assertSucceeds(remove(ref(admin, 'ucHost/OLD-11')));
    await assertFails(get(ref(alice, 'ucHost')));
  });
});

describe('Hub et admin', () => {
  test('présence et compteur restent ouverts aux visiteurs, sans débordement', async () => {
    await assertSucceeds(set(ref(anon, 'hub/online/abc123'), { t: 1 }));
    await assertSucceeds(update(ref(anon, 'hub/stats'), { visits: increment(1) }));
    await assertFails(set(ref(anon, 'hub/stats/visits'), 0));
    await assertFails(set(ref(alice, 'hub/stats/visits'), 0));
  });
  test("réglages : l'admin seul", async () => {
    await assertFails(update(ref(alice, 'hub/hidden'), { uno: true }));
    await assertFails(update(ref(alice, 'hub/settings'), { ageGate: false }));
    await assertSucceeds(update(ref(admin, 'hub/hidden'), { uno: true }));
    await assertSucceeds(update(ref(admin, 'hub/settings'), { ageGate: false }));
    await assertFails(update(ref(admin, 'hub/settings'), { autre: 1 }));
    await assertFails(update(ref(admin, 'hub/hidden'), { uno: 'oui' }));
    await assertSucceeds(set(ref(admin, 'hub/stats/visits'), 0));
  });
  test("journal : l'admin seul, sans HTML", async () => {
    const entry = { datetime: '12/10/2026 10:00', game: 'UNO', change: '"uno" masqué', ts: 1 };
    await assertFails(set(ref(alice, 'hub/updateLog'), [entry]));
    await assertSucceeds(set(ref(admin, 'hub/updateLog'), [entry]));
    await assertFails(set(ref(admin, 'hub/updateLog'), [{ ...entry, change: '<img src=x onerror=alert(1)>' }]));
  });
  test("ancien journal : plus lisible par les visiteurs", async () => {
    await seed('hub/updateLog', [{ ts: 1, change: 'ok' }]);
    await assertFails(get(ref(anon, 'hub/updateLog')));
    await assertFails(get(ref(alice, 'hub/updateLog')));
    await assertSucceeds(get(ref(admin, 'hub/updateLog')));
  });
  test("journal admin : ajout seul, heure du serveur, auteur réel, lecture admin", async () => {
    const e = { ts: serverTimestamp(), cat: 'jeu', msg: 'UNO masqué', target: 'uno', by: 'admin1' };
    await assertFails(set(push(ref(alice, 'adminLog')), { ...e, by: 'alice' }));
    await assertFails(set(push(ref(anon, 'adminLog')), e));
    const r = push(ref(admin, 'adminLog'));
    await assertSucceeds(set(r, e));
    await assertFails(set(r, { ...e, msg: 'réécrit' }));            // aucune modification
    await assertFails(remove(r));                                     // aucune suppression
    await assertFails(remove(ref(admin, 'adminLog')));
    await assertFails(set(push(ref(admin, 'adminLog')), { ...e, ts: 1 }));          // heure imposée par le serveur
    await assertFails(set(push(ref(admin, 'adminLog')), { ...e, by: 'alice' }));   // pas d'usurpation
    await assertFails(set(push(ref(admin, 'adminLog')), { ...e, cat: 'autre' }));
    await assertFails(set(push(ref(admin, 'adminLog')), { ...e, msg: '<img src=x>' }));
    await assertFails(set(push(ref(admin, 'adminLog')), { ...e, extra: 1 }));
    await assertFails(get(ref(alice, 'adminLog')));
    await assertFails(get(ref(anon, 'adminLog')));
    await assertSucceeds(get(ref(admin, 'adminLog')));
  });
  test("admins/ : chacun ne lit que sa propre ligne, personne n'écrit", async () => {
    await assertSucceeds(get(ref(alice, 'admins/alice')));
    await assertFails(get(ref(alice, 'admins/admin1')));
    await assertFails(get(ref(alice, 'admins')));
    await assertFails(set(ref(alice, 'admins/alice'), true));
    await assertFails(set(ref(admin, 'admins/eve'), true));
  });
  test("ancien wr : admin seul", async () => {
    await seed('wr/OLD-11', { phase: 'x' });
    await assertFails(get(ref(alice, 'wr')));
    await assertSucceeds(get(ref(admin, 'wr')));
    await assertSucceeds(remove(ref(admin, 'wr')));
  });
});

describe('Maintenance', () => {
  const on = () => seed('hub/settings/maintenance', true);

  test("l'interrupteur : lisible par tous, modifiable par l'admin seul", async () => {
    await assertSucceeds(get(ref(anon, 'hub/settings/maintenance')));
    await assertFails(set(ref(alice, 'hub/settings/maintenance'), true));
    await assertFails(set(ref(anon, 'hub/settings/maintenance'), true));
    await assertSucceeds(set(ref(admin, 'hub/settings/maintenance'), true));
    await assertFails(set(ref(admin, 'hub/settings/maintenance'), 'oui'));
  });
  test("hub/waiting : l'écran de maintenance s'y signale, seulement en maintenance ; l'admin seul le lit", async () => {
    await assertFails(set(ref(anon, 'hub/waiting/abc123'), { t: 1 }));                 // site ouvert
    await on();
    await assertSucceeds(set(ref(anon, 'hub/waiting/abc123'), { t: 1 }));
    await assertFails(set(ref(anon, 'hub/waiting/ABC'), { t: 1 }));                    // clé invalide
    await assertFails(set(ref(anon, 'hub/waiting/abc123'), { t: 'x' }));
    await assertFails(set(ref(anon, 'hub/waiting/abc123'), { t: 1, x: 1 }));
    await assertFails(get(ref(anon, 'hub/waiting')));
    await assertFails(get(ref(alice, 'hub/waiting')));
    await assertSucceeds(get(ref(admin, 'hub/waiting')));
    await assertSucceeds(remove(ref(anon, 'hub/waiting/abc123')));                     // l'onglet part
    await seed('hub/waiting/old1', { t: 1 });
    await assertSucceeds(remove(ref(admin, 'hub/waiting/old1')));
  });
  for (const [P, code] of Object.entries(GAMES)) {
    test(`${P} : ni créer, ni rejoindre, ni lire, ni jouer, ni supprimer ; l'admin si`, async () => {
      await seed(`${P}/${code}`, { ...lobby(code), members: { alice: true, bob: true } });
      await on();
      await assertFails(set(ref(alice, `${P}/ABCD-11`), lobby('ABCD-11')));
      await assertFails(set(ref(eve, `${P}/${code}/members/eve`), true));
      await assertFails(update(ref(bob, `${P}/${code}`), { turnIndex: 1 }));
      await assertFails(remove(ref(alice, `${P}/${code}`)));
      await assertFails(get(ref(bob, `${P}/${code}`)));
      await assertFails(get(ref(alice, `${P}/${code}/phase`)));
      await assertFails(get(ref(eve, `${P}/${code}/phase`)));
      await assertSucceeds(get(ref(admin, `${P}/${code}`)));
      await assertSucceeds(update(ref(admin, `${P}/${code}`), { turnIndex: 1 }));
      await assertSucceeds(remove(ref(admin, `${P}/${code}`)));
    });
  }
  test("Undercover : secrets ni écrits ni lus", async () => {
    await seed('games/LOUP-42', { ...lobby('LOUP-42'), members: { alice: true } });
    await seed('ucHost/LOUP-42', { civilWord: 'Café', undercoverWord: 'Thé', roles: ['civil'] });
    await seed('ucSecret/LOUP-42/alice', { role: 'civil', word: 'Café' });
    await on();
    await assertFails(get(ref(alice, 'ucHost/LOUP-42')));
    await assertFails(get(ref(alice, 'ucSecret/LOUP-42/alice')));
    await assertSucceeds(get(ref(admin, 'ucHost/LOUP-42')));
    await assertFails(set(ref(alice, 'ucHost/LOUP-42'), { civilWord: 'Café', undercoverWord: 'Thé', roles: ['civil'] }));
    await assertFails(set(ref(alice, 'ucSecret/LOUP-42/alice'), { role: 'civil', word: 'Café' }));
  });
  test('hub : ni présence ni compteur ; réglages publics et admin/<soi> lisibles', async () => {
    await on();
    await assertFails(set(ref(anon, 'hub/online/abc123'), { t: 1 }));
    await assertFails(get(ref(anon, 'hub/online')));
    await assertFails(update(ref(anon, 'hub/stats'), { visits: increment(1) }));
    await assertSucceeds(get(ref(anon, 'hub/settings/maintenance')));
    await assertSucceeds(get(ref(admin, 'admins/admin1')));
    await assertSucceeds(set(ref(admin, 'hub/settings/maintenance'), false));
  });
  test('interrupteur coupé : le jeu reprend', async () => {
    await seed('hub/settings/maintenance', false);
    await assertSucceeds(set(ref(alice, 'p4/ABCD-11'), lobby('ABCD-11')));
  });
});

// Jeu masqué par l'admin (hub/hidden/<id>) : la base le ferme comme en maintenance, pour ce jeu seul.
// Les pages des jeux sont publiques : sans cette règle, un jeu masqué restait entièrement jouable.
describe('Jeu masqué', () => {
  const HUB = { games: 'undercover', banqueroll: 'banqueroll', p4: 'puissance4', qec2: 'quiestce', bn: 'bataille', rl: 'roulette', mg: 'minigolf', uno: 'uno' };
  for (const [P, code] of Object.entries(GAMES)) {
    test(`${P} : masqué, ni créer, ni rejoindre, ni lire, ni jouer ; l'admin si ; les autres jeux restent ouverts`, async () => {
      await seed(`${P}/${code}`, { ...lobby(code), members: { alice: true, bob: true } });
      await seed(`hub/hidden/${HUB[P]}`, true);
      await assertFails(set(ref(alice, `${P}/ABCD-11`), lobby('ABCD-11')));
      await assertFails(set(ref(eve, `${P}/${code}/members/eve`), true));
      await assertFails(update(ref(bob, `${P}/${code}`), { turnIndex: 1 }));
      await assertFails(get(ref(bob, `${P}/${code}`)));
      await assertFails(get(ref(eve, `${P}/${code}/phase`)));
      await assertSucceeds(get(ref(admin, `${P}/${code}`)));
      await assertSucceeds(update(ref(admin, `${P}/${code}`), { turnIndex: 1 }));
      // Les autres jeux ne sont pas touchés.
      const other = P === 'uno' ? 'p4' : 'uno';
      await assertSucceeds(set(ref(alice, `${other}/ABCD-12`), lobby('ABCD-12')));
      // Réaffiché : le jeu reprend.
      await seed(`hub/hidden/${HUB[P]}`, false);
      await assertSucceeds(set(ref(alice, `${P}/ABCD-11`), lobby('ABCD-11')));
    });
  }
  test('Undercover masqué : secrets fermés aussi', async () => {
    await seed('games/LOUP-42', { ...lobby('LOUP-42'), members: { alice: true } });
    await seed('ucHost/LOUP-42', { civilWord: 'Café', undercoverWord: 'Thé', roles: ['civil'] });
    await seed('hub/hidden/undercover', true);
    await assertFails(get(ref(alice, 'ucHost/LOUP-42')));
    await assertSucceeds(get(ref(admin, 'ucHost/LOUP-42')));
  });
  test("un visiteur ne peut pas démasquer un jeu", async () => {
    await seed('hub/hidden/uno', true);
    await assertFails(set(ref(alice, 'hub/hidden/uno'), false));
    await assertFails(set(ref(anon, 'hub/hidden/uno'), false));
  });
});
