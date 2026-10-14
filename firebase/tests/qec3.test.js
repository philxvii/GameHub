// Qui est-ce ? 3D (qec3) : une partie complete a deux clients sur l'emulateur, par le module
// reseau du jeu (games/qui-est-ce/prototype-3d/js/game/net-firebase.js), et les tentatives de
// triche refusees : lire le secret adverse, jouer hors de son tour, repondre a sa propre
// question, ecrire la place de l'autre, publier un secret avant la fin.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update, onValue } from 'firebase/database';
import { createNetFirebase } from '../../games/qui-est-ce/prototype-3d/js/game/net-firebase.js';

const RULES = readFileSync(new URL('../database.rules.phase2.json', import.meta.url), 'utf8');
const fb = { ref, get, set, update, onValue };
let env, alice, bob, eve;
const wait = (cond, ms = 8000) => new Promise((res, rej) => { const t0 = Date.now(); const k = setInterval(() => { if (cond()) { clearInterval(k); res(); } else if (Date.now() - t0 > ms) { clearInterval(k); rej(new Error('delai depasse')); } }, 20); });

before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gamehub-qec3', database: { rules: RULES, host: '127.0.0.1', port: 9000 } }); });
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  alice = env.authenticatedContext('alice').database(); bob = env.authenticatedContext('bob').database(); eve = env.authenticatedContext('eve').database();
});

test('partie complete a deux, revelation, revanche', async () => {
  let seed = 3; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const A = createNetFirebase({ db: alice, uid: 'alice', fb, random }), B = createNetFirebase({ db: bob, uid: 'bob', fb, random });
  const { code } = await A.create({ name: 'Alice' });
  assert.match(code, /^[A-Z]{4}-[0-9]{2}$/);
  let va = null, vb = null;
  A.subscribe(code, 'p1', (v) => { va = v; }); 
  await B.join(code, { name: 'Bob' });
  B.subscribe(code, 'p2', (v) => { vb = v; });
  await wait(() => va?.phase === 'choose' && vb?.phase === 'choose');
  await A.send(code, 'p1', { type: 'secret', id: 3 });
  await B.send(code, 'p2', { type: 'secret', id: 7 });
  await wait(() => va.phase === 'play' && vb.phase === 'play');
  assert.equal(va.mySecret, 3); assert.equal(vb.mySecret, 7);
  assert.equal(va.reveal, null, 'pas de revelation avant la fin');
  // le secret de l'autre est illisible
  await assertFails(get(ref(alice, `qec3Secret/${code}/bob`)));
  await assertFails(get(ref(eve, `qec3/${code}`)));
  // tour 1 : Alice demande, Bob repond, Alice raye et passe
  await A.send(code, 'p1', { type: 'ask', q: 'lunettes' });
  await wait(() => vb.ask?.q === 'lunettes');
  await assertFails(set(ref(alice, `qec3/${code}/ask/answer`), true));            // pas de reponse a sa propre question
  await B.send(code, 'p2', { type: 'answer', yes: false });
  await wait(() => va.ask?.answer === false);
  await A.send(code, 'p1', { type: 'done', crossed: [2, 5, 9] });
  await wait(() => vb.turn === 'p2' && vb.players.p1.crossed.length === 3);
  await assertFails(set(ref(alice, `qec3/${code}/ask`), { by: 'p1', q: 'barbe' }));   // hors de son tour
  await assertFails(set(ref(bob, `qec3/${code}/players/p1/crossed`), [0]));          // la place de l'autre
  await assertFails(set(ref(bob, `qec3/${code}/reveal/p2`), 7));                     // publier avant la fin
  // tour 2 : Bob designe juste (3) : Alice, qui connait son secret, arbitre
  await B.send(code, 'p2', { type: 'guess', id: 3 });
  await wait(() => va.phase === 'end' && vb.phase === 'end' && vb.reveal?.p1 === 3 && va.reveal?.p2 === 7);
  assert.equal(vb.winner, 'p2'); assert.equal(vb.scores.p2, 1); assert.equal(vb.guess.right, true);
  // revanche en un clic des deux cotes : nouvelle manche, places remises a zero
  await A.send(code, 'p1', { type: 'rematch' }); await B.send(code, 'p2', { type: 'rematch' });
  await wait(() => va.phase === 'choose' && va.round === 2 && vb.players.p1.ready === false && vb.players.p2.ready === false);
  assert.equal(va.reveal, null); assert.equal(va.guess, null);
});

test('designation fausse : la manche va a l autre', async () => {
  const A = createNetFirebase({ db: alice, uid: 'alice', fb }), B = createNetFirebase({ db: bob, uid: 'bob', fb });
  const { code } = await A.create({ name: 'Alice' });
  let va = null, vb = null; A.subscribe(code, 'p1', (v) => { va = v; });
  await B.join(code, { name: 'Bob' }); B.subscribe(code, 'p2', (v) => { vb = v; });
  await wait(() => va?.phase === 'choose');
  await A.send(code, 'p1', { type: 'secret', id: 1 }); await B.send(code, 'p2', { type: 'secret', id: 2 });
  await wait(() => va.phase === 'play');
  await assertFails(set(ref(bob, `qec3/${code}/guess`), { by: 'p2', id: 1 }));        // pas son tour
  await A.send(code, 'p1', { type: 'guess', id: 9 });
  await wait(() => va.phase === 'end' && va.winner === 'p2');
  assert.equal(va.guess.right, false);
});

test('etrangers et salon plein', async () => {
  const A = createNetFirebase({ db: alice, uid: 'alice', fb });
  const { code } = await A.create({ name: 'Alice' });
  const B = createNetFirebase({ db: bob, uid: 'bob', fb }); await B.join(code, { name: 'Bob' });
  await assertFails(set(ref(eve, `qec3/${code}/members/eve`), true));               // plus au salon
  await assertFails(set(ref(eve, `qec3Secret/${code}/eve`), { id: 1 }));            // pas membre
  await assertSucceeds(get(ref(eve, `qec3/${code}/phase`)));                         // « deja lancee » lisible
});
