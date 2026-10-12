// Transition : les nouveaux clients (comptes anonymes) fonctionnent alors que les
// anciens (sans compte, voir phase1.test.js) restent en ligne. Les secrets
// d'Undercover sont déjà protégés ; l'admin a ses droits.

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';

const RULES = readFileSync(new URL('../database.rules.transition.json', import.meta.url), 'utf8');
let env, alice, bob, eve, anon, admin;
const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gamehub-tr2', database: { rules: RULES, host: '127.0.0.1', port: 9000 } });
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

const code = 'LOUP-42';
const game = { code, phase: 'lobby', hostUid: 'alice', members: { alice: true }, players: [{ name: 'Alice', uid: 'alice' }] };
const host = { civilWord: 'Café', undercoverWord: 'Thé', roles: ['civil', 'undercover', 'civil'] };

describe('Nouveaux clients pendant la transition', () => {
  test("création, inscription, secrets de l'hôte et des joueurs", async () => {
    await assertSucceeds(set(ref(alice, `games/${code}`), game));
    await assertSucceeds(set(ref(alice, `ucHost/${code}`), host));
    await assertSucceeds(set(ref(bob, `games/${code}/members/bob`), true));
    await assertSucceeds(update(ref(bob, `games/${code}`), { players: [...game.players, { name: 'Bob', uid: 'bob' }] }));
    await assertSucceeds(set(ref(alice, `ucSecret/${code}/bob`), { role: 'undercover', word: 'Thé' }));
    await assertSucceeds(get(ref(bob, `ucSecret/${code}/bob`)));
    await assertSucceeds(remove(ref(alice, `ucSecret/${code}`)));
    await assertSucceeds(remove(ref(alice, `ucHost/${code}`)));
    await assertSucceeds(remove(ref(alice, `games/${code}`)));
  });
  test("secrets d'Undercover déjà protégés", async () => {
    await seed(`games/${code}`, game);
    await seed(`ucHost/${code}`, host);
    await seed(`ucSecret/${code}/bob`, { role: 'undercover', word: 'Thé' });
    await assertFails(get(ref(anon, `ucHost/${code}`)));
    await assertFails(get(ref(bob, `ucHost/${code}`)));
    await assertFails(get(ref(eve, `ucSecret/${code}/bob`)));
    await assertFails(get(ref(bob, `ucSecret/${code}`)));
    await assertFails(get(ref(anon, 'ucSecret')));
  });
  test("personne ne se déclare hôte d'une partie existante (ni ancien client, ni compte)", async () => {
    await seed(`games/${code}`, game);
    await assertFails(update(ref(anon, `games/${code}`), { hostUid: 'eve' }));
    await assertFails(update(ref(eve, `games/${code}`), { hostUid: 'eve' }));
    await assertFails(set(ref(eve, `ucHost/${code}`), host));
  });
  test("anciens clients : la partie reste lisible par code (limite connue de la transition)", async () => {
    await seed(`games/${code}`, game);
    await assertSucceeds(get(ref(anon, `games/${code}`)));
    await assertFails(get(ref(anon, 'games')));
  });
  test("admin : réglages du hub, liste et suppression ; personne d'autre", async () => {
    await seed(`games/${code}`, game);
    await assertSucceeds(update(ref(admin, 'hub/settings'), { ageGate: false }));
    await assertSucceeds(update(ref(admin, 'hub/hidden'), { uno: true }));
    await assertSucceeds(get(ref(admin, 'games')));
    await assertSucceeds(remove(ref(admin, `games/${code}`)));
    await assertFails(update(ref(alice, 'hub/settings'), { ageGate: false }));
    await assertFails(update(ref(anon, 'hub/hidden'), { uno: true }));
    await assertFails(get(ref(alice, 'admins/admin1')));
  });
});
