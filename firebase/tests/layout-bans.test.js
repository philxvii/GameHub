// Mise en page de l'accueil (hub/layout), comptes bannis du site (bans/) et exclusions d'une partie
// (<préfixe>/<code>/banned/<uid>). Profils : alice (hôte), bob, eve, un visiteur sans compte, admin1.

import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';

const RULES = readFileSync(new URL('../database.rules.phase2.json', import.meta.url), 'utf8');
let env, alice, bob, eve, anon, admin;

const seed = (path, value) => env.withSecurityRulesDisabled(ctx => set(ref(ctx.database(), path), value));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gamehub-layout',
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

const LAYOUT = {
  order: 'uno,banqueroll,puissance4',
  games: { uno: { name: 'UNO !', sub: '2 à 6 joueurs', tags: 'amis chance', wide: true, aband: false, wip: -1 }, puissance4: { wip: 80 } },
  v: 1,
};

describe('Mise en page de l’accueil', () => {
  test('lisible par tous, écrite par l’admin seul', async () => {
    await assertSucceeds(set(ref(admin, 'hub/layout'), LAYOUT));
    await assertSucceeds(get(ref(anon, 'hub/layout')));
    await assertFails(set(ref(alice, 'hub/layout/order'), 'uno'));
    await assertFails(set(ref(anon, 'hub/layout/games/uno/name'), 'Pirate'));
  });
  test('valeurs hors format refusées, même pour l’admin', async () => {
    await assertFails(set(ref(admin, 'hub/layout/order'), 'uno;<script>'));
    await assertFails(set(ref(admin, 'hub/layout/games/uno/name'), '<b>UNO</b>'));
    await assertFails(set(ref(admin, 'hub/layout/games/uno/name'), ''));
    await assertFails(set(ref(admin, 'hub/layout/games/uno/tags'), 'Amis!'));
    await assertFails(set(ref(admin, 'hub/layout/games/uno/wip'), 101));
    await assertFails(set(ref(admin, 'hub/layout/games/uno/couleur'), 'rouge'));
    await assertFails(set(ref(admin, 'hub/layout/autre'), 1));
    await assertFails(set(ref(admin, 'hub/layout/games/UNO-X/name'), 'UNO'));
  });
});

const lobby = { phase: 'lobby', hostUid: 'alice', members: { alice: true }, players: [{ name: 'Alice', uid: 'alice' }] };

describe('Bannis du site', () => {
  test('liste lisible et modifiable par l’admin seul', async () => {
    await assertSucceeds(set(ref(admin, 'bans/eve'), { at: 1, name: 'Eve', why: 'insultes' }));
    await assertSucceeds(get(ref(admin, 'bans')));
    await assertFails(get(ref(eve, 'bans/eve')));
    await assertFails(remove(ref(eve, 'bans/eve')));
    await assertFails(set(ref(bob, 'bans/eve'), { at: 1 }));
    await assertFails(set(ref(admin, 'bans/bob'), { name: 'Bob' }));   // date obligatoire
  });
  test('un banni ne crée, ne rejoint ni ne lit plus aucune partie', async () => {
    await seed('p4/DISC-42', lobby);
    await seed('p4/DISC-43', { ...lobby, members: { alice: true, eve: true } });
    await seed('bans/eve', { at: 1 });
    await assertFails(set(ref(eve, 'p4/DISC-42/members/eve'), true));
    await assertFails(get(ref(eve, 'p4/DISC-42/phase')));
    await assertFails(get(ref(eve, 'p4/DISC-43')));
    await assertFails(set(ref(eve, 'uno/WILD-90'), { phase: 'lobby', hostUid: 'eve', members: { eve: true } }));
    await assertFails(set(ref(eve, 'mp/SHOW-11'), { phase: 'lobby', hostUid: 'eve', coord: 'eve', members: { eve: true } }));
    // Les autres ne sont pas touchés ; une fois débanni, eve revient.
    await assertSucceeds(set(ref(bob, 'p4/DISC-42/members/bob'), true));
    await assertSucceeds(remove(ref(admin, 'bans/eve')));
    await assertSucceeds(set(ref(eve, 'p4/DISC-42/members/eve'), true));
  });
});

describe('Exclusion d’une partie', () => {
  for (const prefix of ['games', 'banqueroll', 'p4', 'qec2', 'bn', 'rl', 'mg', 'uno']) {
    const code = prefix === 'banqueroll' ? 'ROLL-17' : 'ABCD-12';
    test(`${prefix} : l’exclu ne revient pas, les autres entrent`, async () => {
      await seed(`${prefix}/${code}`, { ...lobby, members: { alice: true, eve: true } });
      // L'admin retire eve et la marque exclue, en une écriture.
      await assertSucceeds(update(ref(admin, `${prefix}/${code}`), { 'members/eve': null, 'banned/eve': true }));
      await assertFails(get(ref(eve, `${prefix}/${code}`)));
      await assertFails(set(ref(eve, `${prefix}/${code}/members/eve`), true));
      await assertSucceeds(set(ref(bob, `${prefix}/${code}/members/bob`), true));
    });
  }
  for (const prefix of ['ms', 'mp']) {
    test(`${prefix} : exclusion par l’admin, refusée à l’hôte`, async () => {
      const room = { phase: 'lobby', hostUid: 'alice', coord: 'alice', members: { alice: true, eve: true }, players: { alice: { name: 'Alice', c: 0, dev: 'mouse' }, eve: { name: 'Eve', c: 1, dev: 'mouse' } } };
      await seed(`${prefix}/SHOW-11`, room);
      await assertFails(set(ref(alice, `${prefix}/SHOW-11/banned/eve`), true));
      await assertSucceeds(update(ref(admin, `${prefix}/SHOW-11`), { 'members/eve': null, 'players/eve': null, 'banned/eve': true }));
      await assertFails(set(ref(eve, `${prefix}/SHOW-11/members/eve`), true));
      await assertSucceeds(set(ref(bob, `${prefix}/SHOW-11/members/bob`), true));
    });
  }
  test('l’hôte reste membre : l’admin ne peut pas l’exclure seul', async () => {
    await seed('uno/WILD-90', lobby);
    await assertFails(update(ref(admin, 'uno/WILD-90'), { 'members/alice': null }));
  });
});
