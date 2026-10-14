#!/usr/bin/env node
// Pages de connexion Google de Firebase, servies depuis roulia.me (__/auth/).
//
// Firebase les sert d'ordinaire depuis <projet>.firebaseapp.com : la fenêtre de
// Google affichait alors ce nom. Copiées ici, telles quelles, elles font apparaître
// roulia.me (authDomain dans shared/firebase.js). Elles ne suivent pas seules les
// mises à jour de Firebase : ce script les compare et les recopie.
//
//   node tools/auth-helpers.js           # écart avec la version de Firebase (code 1 si différente)
//   node tools/auth-helpers.js --write   # recopie les fichiers
//
// Les pages HTML deviennent handler.html et iframe.html : GitHub Pages les sert aux
// adresses sans extension que Firebase appelle (/__/auth/handler, /__/auth/iframe).

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://undercover-game-b0d2a.firebaseapp.com/__/auth/';
const FILES = { 'handler': 'handler.html', 'handler.js': 'handler.js', 'experiments.js': 'experiments.js', 'iframe': 'iframe.html', 'iframe.js': 'iframe.js' };
const DIR = path.join(__dirname, '..', '__', 'auth');
const write = process.argv.includes('--write');

(async () => {
  let stale = 0;
  for (const [remote, local] of Object.entries(FILES)) {
    const res = await fetch(SOURCE + remote);
    if (!res.ok) throw new Error(`${remote} : HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    const file = path.join(DIR, local);
    const same = fs.existsSync(file) && fs.readFileSync(file).equals(body);
    if (!same) stale++;
    if (!same && write) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, body); }
    console.log(`${same ? 'à jour ' : write ? 'recopié' : 'DIFFÈRE'}  __/auth/${local}  (${body.length} o)`);
  }
  if (stale && !write) { console.log('\nRecopier : node tools/auth-helpers.js --write, puis tester la connexion admin.'); process.exitCode = 1; }
})().catch(e => { console.error(e.message); process.exitCode = 2; });
