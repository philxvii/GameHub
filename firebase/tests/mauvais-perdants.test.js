// Mauvais Perdants (sa/<code>) : salon, coordinateur, réponses à écriture unique et datées.
// Profils : alice (hôte), bob et carol (membres), eve (connectée, étrangère), admin1.

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove, serverTimestamp } from 'firebase/database';

const RULES = readFileSync(new URL('../database.rules.phase2.json', import.meta.url), 'utf8');
const CODE = 'GONG-42';
let env, alice, bob, carol, eve, admin;

const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));
const read = async path => { let v; await env.withSecurityRulesDisabled(async ctx => { v = (await get(ref(ctx.database(), path))).val(); }); return v; };
const r = (db, path = '') => ref(db, `mp/${CODE}${path ? '/' + path : ''}`);
const player = name => ({ name, c: 0, dev: 'mouse', t: 1 });
const lobby = () => ({ phase: 'lobby', hostUid: 'alice', coord: 'alice', members: { alice: true }, cfg: { roast: 'soft', crude: false, v: 1 }, players: { alice: player('Alice') } });
const match = (over = {}) => ({
  tid: 't1', rk: 'r0', i: 0, step: 'play', at: Date.now() - 1000, end: Date.now() + 60000, seq: 3, seed: 'ABCD1234',
  plan: [{ g: 'gong', f: 'vitesse' }], roster: { alice: { name: 'Alice', c: 0, dev: 'mouse' }, bob: { name: 'Bob', c: 1, dev: 'mouse' } }, ...over,
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gamehub-mp', database: { rules: RULES, host: '127.0.0.1', port: 9000 } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await seed('admins/admin1', true);
  alice = env.authenticatedContext('alice').database();
  bob = env.authenticatedContext('bob').database();
  carol = env.authenticatedContext('carol').database();
  eve = env.authenticatedContext('eve').database();
  admin = env.authenticatedContext('admin1').database();
});

async function room() {
  await assertSucceeds(set(r(alice), lobby()));
  await assertSucceeds(set(r(bob, 'members/bob'), true));
  await assertSucceeds(set(r(bob, 'players/bob'), player('Bob')));
}

describe('Mauvais Perdants : salon', () => {
  test('création : code au format, hôte = coordinateur, phase lobby', async () => {
    await assertFails(set(ref(alice, 'mp/gong42'), lobby()));
    await assertFails(set(r(alice), { ...lobby(), coord: 'bob' }));
    await assertFails(set(r(alice), { ...lobby(), phase: 'playing' }));
    await assertFails(set(r(alice), { ...lobby(), hostUid: 'bob' }));
    await assertSucceeds(set(r(alice), lobby()));
  });
  test('rejoindre en lobby seulement ; étranger sans lecture', async () => {
    await room();
    await assertSucceeds(get(r(bob)));
    await assertFails(get(r(eve)));
    await assertSucceeds(get(r(eve, 'phase')));
    await assertSucceeds(update(r(alice), { phase: 'playing' }));
    await assertFails(set(r(carol, 'members/carol'), true));
  });
  test('pseudo : longueur et balises', async () => {
    await room();
    await assertFails(set(r(bob, 'players/bob'), player('<img src=x onerror=alert(1)>')));
    await assertFails(set(r(bob, 'players/bob'), player('x'.repeat(17))));
    await assertFails(set(r(bob, 'players/bob'), { ...player('Bob'), c: 9 }));
    await assertFails(set(r(bob, 'players/bob'), { ...player('Bob'), admin: true }));
    await assertSucceeds(set(r(bob, 'players/bob'), player('Bob')));
  });
  test('chacun écrit SES nœuds seulement', async () => {
    await room();
    await assertFails(set(r(bob, 'players/alice'), player('Pirate')));
    await assertFails(set(r(bob, 'presence/alice'), serverTimestamp()));
    await assertSucceeds(set(r(bob, 'presence/bob'), serverTimestamp()));
    await assertFails(set(r(bob, 'presence/bob'), 12345));          // heure du serveur imposée
    await assertSucceeds(set(r(bob, 'ready/bob'), 't1:r0'));
    await assertFails(set(r(bob, 'ready/alice'), 't1:r0'));
    await assertSucceeds(set(r(bob, 'prog/bob'), { k: 't1:r0', v: 7 }));
  });
  test('réglages et état du tournoi : hôte / coordinateur seulement', async () => {
    await room();
    await assertFails(set(r(bob, 'cfg'), { roast: 'hard', crude: true }));
    await assertSucceeds(set(r(alice, 'cfg'), { roast: 'hard', crude: true }));
    await assertFails(set(r(bob, 'match'), match()));
    await assertSucceeds(set(r(alice, 'match'), match()));
    await assertFails(set(r(bob, 'match/step'), 'final'));
    await assertFails(set(r(bob, 'phase'), 'ended'));
    await assertFails(set(r(bob, 'mc/l1'), { t: 'je suis le présentateur', ts: 1 }));
    await assertSucceeds(set(r(alice, 'mc/l1'), { t: 'Bonsoir.', ts: 1, src: 'local', ev: 'welcome' }));
    await assertFails(set(r(alice, 'mc/l2'), { t: '<script>', ts: 1 }));
    await assertFails(set(r(alice, 'mc/l2'), { t: 'ok', ts: 1, src: 'chatgpt' }));
    await assertSucceeds(set(r(alice, 'match/res/0/bob'), { rank: 2, base: 2, boast: -3, pts: -1, label: '420 ms' }));
    await assertFails(set(r(alice, 'match/res/0/bob/pts'), 999));
    await assertFails(set(r(alice, 'match/res/0/bob/rank'), 0));
  });
});

describe('Mauvais Perdants : coordinateur', () => {
  test('relève refusée tant que le coordinateur bat ; acceptée quand il est éteint', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'presence/alice'), serverTimestamp()));
    await assertFails(set(r(bob, 'coord'), 'bob'));
    await seed(`mp/${CODE}/presence/alice`, Date.now() - 60000);
    await assertFails(set(r(bob, 'coord'), 'alice'));               // on ne nomme que soi
    await assertSucceeds(set(r(bob, 'coord'), 'bob'));
    await assertSucceeds(set(r(bob, 'match'), match()));
    await assertFails(set(r(alice, 'match/step'), 'reveal'));       // l'ancien coordinateur n'écrit plus…
    await assertSucceeds(set(r(alice, 'coord'), 'alice'));          // …mais l'hôte peut reprendre la main
    await assertFails(set(r(eve, 'coord'), 'eve'));
  });
});

describe('Mauvais Perdants : réponses de manche', () => {
  test('écriture unique, pendant play, avant l’échéance, par un joueur du tournoi', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match()));
    const sub = { d: '{"t":[200,210,220,230,240]}', t: serverTimestamp() };
    await assertSucceeds(set(r(bob, 'subs/t1/r0/bob'), sub));
    await assertFails(set(r(bob, 'subs/t1/r0/bob'), { ...sub, d: '{"t":[100,100,100,100,100]}' }));   // pas de seconde réponse
    await assertFails(set(r(bob, 'subs/t1/r0/alice'), sub));          // pas la réponse d'un autre
    await assertFails(set(r(bob, 'subs/t1/r1/bob'), sub));            // pas une autre manche
    await assertFails(set(r(bob, 'subs/t0/r0/bob'), sub));            // pas un autre tournoi
    await assertFails(set(r(alice, 'subs/t1/r0/alice'), { d: '{}', t: 1 }));   // horodatage du serveur imposé
    await assertFails(set(r(alice, 'subs/t1/r0/alice'), { d: 'x'.repeat(4001), t: serverTimestamp() }));
  });
  test('réponse tardive ou hors étape refusée', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match({ end: Date.now() - 10000 })));
    await assertFails(set(r(bob, 'subs/t1/r0/bob'), { d: '{}', t: serverTimestamp() }));
    await assertSucceeds(set(r(alice, 'match'), match({ step: 'reveal' })));
    await assertFails(set(r(bob, 'subs/t1/r0/bob'), { d: '{}', t: serverTimestamp() }));
  });
  test('hors du tournoi : refusé ; départage : seulement les ex æquo', async () => {
    await room();
    await assertSucceeds(set(r(carol, 'members/carol'), true));
    await assertSucceeds(set(r(alice, 'match'), match()));
    await assertFails(set(r(carol, 'subs/t1/r0/carol'), { d: '{}', t: serverTimestamp() }));
    await assertSucceeds(set(r(alice, 'match'), match({ rk: 'r5', i: 5, tb: { alice: true } })));
    await assertFails(set(r(bob, 'subs/t1/r5/bob'), { d: '{}', t: serverTimestamp() }));
    await assertSucceeds(set(r(alice, 'subs/t1/r5/alice'), { d: '{}', t: serverTimestamp() }));
  });
  test('fanfaronnade pendant intro, une fois ; votes pendant vote', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match({ step: 'intro' })));
    await assertSucceeds(set(r(bob, 'boast/t1/r0/bob'), true));
    await assertFails(set(r(bob, 'boast/t1/r0/bob'), true));
    await assertFails(set(r(bob, 'votes/t1/r0/bob'), { g0: true }));
    await assertSucceeds(set(r(alice, 'match'), match({ step: 'vote' })));
    await assertSucceeds(set(r(bob, 'votes/t1/r0/bob'), { g0: true }));
    await assertSucceeds(set(r(bob, 'votes/t1/r0/bob/g0'), false));
    await assertFails(set(r(bob, 'votes/t1/r0/bob'), { 'pas-un-groupe': true }));
    await assertFails(set(r(bob, 'votes/t1/r0/alice'), { g0: true }));
    await assertFails(set(r(bob, 'boast/t1/r0/alice'), true));
  });
  test('marqueur « manche commencée » : une seule fois, pendant play, pour soi', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match()));
    await assertSucceeds(set(r(bob, 'start/t1/r0/bob'), serverTimestamp()));
    await assertFails(set(r(bob, 'start/t1/r0/bob'), null));                // impossible de l'effacer
    await assertFails(set(r(bob, 'start/t1/r0/bob'), serverTimestamp()));   // ni de le réécrire
    await assertFails(set(r(bob, 'start/t1/r0/alice'), serverTimestamp()));
    await assertSucceeds(remove(r(alice, 'start')));                          // le coordinateur vide tout
  });
  test('Coffre en élimination : journal des tours, une entrée par joueur, pendant play', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match()));
    const ok = { r: 'o', t: serverTimestamp() };
    await assertSucceeds(set(r(bob, 'turns/t1/r0/0/bob'), ok));
    await assertFails(set(r(bob, 'turns/t1/r0/0/bob'), { r: 'x', t: serverTimestamp() }));   // écrit une fois
    await assertFails(set(r(bob, 'turns/t1/r0/1/alice'), ok));                              // pas un succès à la place d'un autre
    await assertSucceeds(set(r(bob, 'turns/t1/r0/1/alice'), { r: 'x', t: serverTimestamp() }));   // mais une élimination (joueur disparu)
    await assertFails(set(r(bob, 'turns/t1/r0/2/bob'), { r: 'z', t: serverTimestamp() }));  // 'o' ou 'x'
    await assertFails(set(r(bob, 'turns/t1/r0/3/bob'), { r: 'o', t: 1 }));                  // heure du serveur imposée
    await assertFails(set(r(bob, 'turns/t1/r0/abc/bob'), ok));                               // numéro de tour
    await assertFails(set(r(bob, 'turns/t1/r1/0/bob'), ok));                                // pas une autre manche
    await assertFails(set(r(carol, 'turns/t1/r0/4/carol'), ok));                            // hors tournoi
    await assertFails(remove(r(bob, 'turns')));
    await assertSucceeds(remove(r(alice, 'turns')));
    await assertSucceeds(set(r(alice, 'match'), match({ step: 'reveal' })));
    await assertFails(set(r(bob, 'turns/t1/r0/0/bob'), ok));                                // hors étape play
  });
  test('le coordinateur vide les réponses ; un joueur ne peut pas', async () => {
    await room();
    await assertSucceeds(set(r(alice, 'match'), match()));
    await assertSucceeds(set(r(bob, 'subs/t1/r0/bob'), { d: '{}', t: serverTimestamp() }));
    await assertFails(remove(r(bob, 'subs')));
    await assertSucceeds(remove(r(alice, 'subs')));
    assert.equal(await read(`mp/${CODE}/subs`), null);
  });
  test('fermer : l’hôte seul ; l’admin peut tout lire', async () => {
    await room();
    await assertFails(remove(r(bob)));
    await assertSucceeds(get(r(admin)));
    await assertSucceeds(remove(r(alice)));
  });
});

import assert from 'node:assert/strict';

describe('Mauvais Perdants : jeu masqué', () => {
  test("masqué par l'admin : ni créer, ni rejoindre, ni lire ; l'admin si ; réaffiché, ça reprend", async () => {
    await seed(`mp/${CODE}`, lobby());
    await seed('hub/hidden/mauvaisperdants', true);
    await assertFails(set(ref(alice, 'mp/ABCD-11'), { ...lobby(), members: { alice: true } }));
    await assertFails(set(r(bob, 'members/bob'), true));
    await assertFails(get(r(eve, 'phase')));
    await assertSucceeds(get(r(admin)));
    await seed('hub/hidden/mauvaisperdants', false);
    await assertSucceeds(set(r(bob, 'members/bob'), true));
  });
});
