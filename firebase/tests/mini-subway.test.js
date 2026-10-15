// Mini Subway (ms/<code>) : salon, journal de commandes, Versus.
// Profils : alice (hôte), bob (membre), carol (membre), eve (connectée, étrangère),
// un visiteur sans compte, admin1.

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';

const RULES = readFileSync(new URL('../database.rules.phase2.json', import.meta.url), 'utf8');
const CODE = 'RAIL-42';
let env, alice, bob, carol, eve, anon, admin;

const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));
const read = async path => { let v; await env.withSecurityRulesDisabled(async ctx => { v = (await get(ref(ctx.database(), path))).val(); }); return v; };
const r = (db, path = '') => ref(db, `ms/${CODE}${path ? '/' + path : ''}`);

const lobby = (kind = 'coop') => ({
  phase: 'lobby', hostUid: 'alice', members: { alice: true },
  cfg: { kind, map: 'val-dorme', mode: 'classic', seed: 0, round: 0, v: 1, handicaps: { v: 1 } },
  players: { alice: { name: 'Alice', ready: false, t: 1 } },
});
const cmd = (by, net, id, tick = 9) => ({ id, by, tick, c: '{"type":"train","l":0}', net });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gamehub-ms', database: { rules: RULES, host: '127.0.0.1', port: 9000 } });
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
  anon = env.unauthenticatedContext().database();
});

async function playing(kind = 'coop') {
  await assertSucceeds(set(r(alice), lobby(kind)));
  await assertSucceeds(set(r(bob, 'members/bob'), true));
  await assertSucceeds(set(r(bob, 'players/bob'), { name: 'Bob', ready: true, t: 2 }));
  await assertSucceeds(update(r(alice), { 'cfg/seed': 77, 'cfg/seats': { alice: 0, bob: 1 }, 'cfg/round': 1, head: { tick: 0, n: 0 }, phase: 'playing' }));
}

describe('Mini Subway : salon', () => {
  test('créer, rejoindre, prêt, lancer, présence, quitter, fermer', async () => {
    await playing();
    await assertSucceeds(set(r(bob, 'presence/bob'), 123));
    await assertSucceeds(set(r(bob, 'presence/bob'), null));
    await assertSucceeds(get(r(bob)));
    await assertSucceeds(set(r(bob, 'players/bob'), null)); // un invité quitte
    await assertSucceeds(remove(r(alice)));
  });
  test('création : code au format, hôte membre, phase lobby', async () => {
    await assertFails(set(ref(alice, 'ms/rail42'), lobby()));
    await assertFails(set(r(alice), { ...lobby(), hostUid: 'bob' }));
    await assertFails(set(r(alice), { ...lobby(), phase: 'playing' }));
    await assertFails(set(r(anon), lobby()));
    await assertFails(set(r(alice), { ...lobby(), extra: 1 }));
  });
  test('code inconnu et partie lancée : phase lisible, entrée refusée', async () => {
    await assertSucceeds(get(r(eve, 'phase')));
    await playing();
    await assertSucceeds(get(r(eve, 'phase')));
    await assertFails(get(r(eve)));
    await assertFails(set(r(eve, 'members/eve'), true));
    await assertFails(get(r(anon, 'phase')));
  });
  test('seul l’hôte écrit phase, configuration, tête du journal, résultat', async () => {
    await playing();
    await assertFails(set(r(bob, 'phase'), 'ended'));
    await assertFails(set(r(bob, 'cfg/seed'), 1));
    await assertFails(set(r(bob, 'head'), { tick: 999, n: 0 }));
    await assertFails(set(r(bob, 'result'), { outcome: 'win:bob' }));
    await assertFails(set(r(bob, 'hash'), { tick: 100, h: 1 }));
    await assertSucceeds(set(r(alice, 'result'), { outcome: 'coop-lose', tick: 50 }));
    await assertFails(set(r(alice, 'phase'), 'n_importe'));
  });
  test('fiche et présence : chacun la sienne', async () => {
    await playing();
    await assertFails(set(r(bob, 'players/alice/ready'), true));
    await assertFails(set(r(bob, 'presence/alice'), 1));
    await assertFails(set(r(bob, 'players/bob/name'), '<b>x</b>'));
    await assertFails(set(r(bob, 'players/bob/role'), 'hôte'));
    await assertFails(set(r(eve, 'players/eve'), { name: 'Eve' }));
  });
  test('personne n’exclut l’hôte ni ne supprime la partie à sa place', async () => {
    await playing();
    await assertFails(remove(r(bob)));
    await assertFails(set(r(bob, 'hostUid'), 'bob'));
    await assertFails(set(r(alice, 'hostUid'), 'bob'));
  });
});

describe('Mini Subway : journal de commandes', () => {
  test('demande d’un membre, journalisée par l’hôte avec son auteur', async () => {
    await playing();
    await assertSucceeds(set(r(bob, 'req/bob-1-1-aa'), { by: 'bob', c: '{"type":"train","l":0}', net: 0 }));
    await assertFails(set(r(bob, 'req/bob-1-2-aa'), { by: 'alice', c: '{}', net: 0 }));       // usurpation
    await assertFails(set(r(eve, 'req/eve-1-1-aa'), { by: 'eve', c: '{}', net: 0 }));         // non-membre
    await assertFails(set(r(bob, 'req/bob-1-1-aa'), null));                                   // seul l'hôte retire
    await assertSucceeds(update(r(alice), { 'cmds/c000000': cmd('bob', 0, 'bob-1-1-aa'), 'req/bob-1-1-aa': null, head: { tick: 9, n: 1 } }));
    assert(await read(`ms/${CODE}/req/bob-1-1-aa`) === null);
  });
  test('journal : écriture unique, hôte seul, auteur prouvé', async () => {
    await playing();
    await assertFails(set(r(bob, 'cmds/c000000'), cmd('bob', 0, 'x-1')));                    // invité : jamais
    await assertSucceeds(set(r(alice, 'cmds/c000000'), cmd('alice', 0, 'alice-1')));
    await assertFails(set(r(alice, 'cmds/c000000'), cmd('alice', 0, 'alice-2')));            // pas de réécriture
    await assertFails(set(r(alice, 'cmds/c000001'), cmd('bob', 0, 'sans-demande')));         // auteur sans demande
    await assertFails(set(r(alice, 'cmds/zzz'), cmd('alice', 0, 'alice-3')));
    await assertSucceeds(set(r(alice, 'cmds'), null));                                        // revanche : vidé en bloc
  });
  test('Versus : une commande ne vise que le réseau de son auteur', async () => {
    await playing('versus');
    await assertSucceeds(set(r(bob, 'req/bob-1-1-bb'), { by: 'bob', c: '{"type":"train","l":0}', net: 0 }));
    // l'hôte ne peut pas journaliser une demande de Bob sur le réseau d'Alice (siège 0)
    await assertFails(update(r(alice), { 'cmds/c000000': cmd('bob', 0, 'bob-1-1-bb'), 'req/bob-1-1-bb': null }));
    await assertSucceeds(set(r(bob, 'req/bob-1-2-bb'), { by: 'bob', c: '{"type":"train","l":0}', net: 1 }));
    await assertSucceeds(update(r(alice), { 'cmds/c000000': cmd('bob', 1, 'bob-1-2-bb'), 'req/bob-1-2-bb': null }));
    await assertFails(set(r(alice, 'cmds/c000001'), cmd('alice', 1, 'alice-x')));            // l'hôte sur le réseau adverse
    await assertSucceeds(set(r(alice, 'cmds/c000001'), cmd('alice', 0, 'alice-y')));
    await assertSucceeds(set(r(alice, 'cmds/c000002'), cmd('alice', -1, 'alice-speed')));    // commande globale (vitesse, départ)
  });
  test('maintenance : plus aucune écriture', async () => {
    await playing();
    await seed('hub/settings/maintenance', true);
    await assertFails(set(r(bob, 'req/bob-1-9-aa'), { by: 'bob', c: '{}', net: 0 }));
    await assertFails(get(r(bob)));
    await assertSucceeds(get(r(admin)));
    await assertSucceeds(remove(r(admin)));
  });
});

function assert(v) { if (!v) throw new Error('assertion'); }
