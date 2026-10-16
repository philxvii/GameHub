#!/usr/bin/env node
// Chiffre et déchiffre un fichier de notes avec un mot de passe. Seulement Node 18+, aucune dépendance.
//
//   node tools/notes-crypt.mjs encrypt docs/RECAP-MAINTENANCE-SECURITE.md      → ….md.enc
//   node tools/notes-crypt.mjs decrypt docs/RECAP-MAINTENANCE-SECURITE.md.enc  → ….md
//
// Le mot de passe se tape au clavier (masqué) ; il n'est écrit nulle part. Sans lui, le fichier
// chiffré est irrécupérable. AES-256-GCM, clé dérivée par scrypt (sel aléatoire par fichier) :
// un fichier modifié ou un mauvais mot de passe est détecté au déchiffrement.
//
// Le fichier chiffré peut être public : sa sécurité repose sur le mot de passe seul. Prends une
// phrase longue (5 mots tirés au hasard ou plus), pas un mot de passe court.
//
// NOTES_PASSPHRASE (variable d'environnement) existe pour les tests ; ne l'utilise pas à la main.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MAGIC = Buffer.from('GHN1');
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const key = (pass, salt) => scryptSync(pass.normalize('NFKC'), salt, 32, SCRYPT);

function ask(question) {
  if (process.env.NOTES_PASSPHRASE) return Promise.resolve(process.env.NOTES_PASSPHRASE);
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('Terminal interactif requis pour saisir le mot de passe.'));
    process.stderr.write(question);
    let pass = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const onData = c => {
      for (const ch of c) {
        if (ch === '\u0003') { process.stderr.write('\n'); process.exit(130); }
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stderr.write('\n'); return resolve(pass); }
        if (ch === '\u007f' || ch === '\b') pass = pass.slice(0, -1); else pass += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

const [mode, file] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(mode) || !file || !existsSync(file)) {
  console.error('Usage : node tools/notes-crypt.mjs encrypt|decrypt <fichier>');
  process.exit(2);
}

if (mode === 'encrypt') {
  const pass = await ask('Mot de passe : ');
  if (pass.length < 12) { console.error('Mot de passe trop court : 12 caractères au moins (une phrase est idéale).'); process.exit(1); }
  if (!process.env.NOTES_PASSPHRASE && (await ask('Confirmer : ')) !== pass) { console.error('Les deux saisies diffèrent.'); process.exit(1); }
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(pass, salt), iv);
  const body = Buffer.concat([c.update(readFileSync(file)), c.final()]);
  const out = file + '.enc';
  writeFileSync(out, Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]));
  console.log(`Chiffré : ${out}`);
} else {
  const raw = readFileSync(file);
  if (raw.length < 48 || !raw.subarray(0, 4).equals(MAGIC)) { console.error('Ce fichier n\'est pas un fichier chiffré par cet outil.'); process.exit(1); }
  const pass = await ask('Mot de passe : ');
  try {
    const d = createDecipheriv('aes-256-gcm', key(pass, raw.subarray(4, 20)), raw.subarray(20, 32));
    d.setAuthTag(raw.subarray(32, 48));
    const plain = Buffer.concat([d.update(raw.subarray(48)), d.final()]);
    const out = file.endsWith('.enc') ? file.slice(0, -4) : file + '.dec';
    if (existsSync(out)) { console.error(`${out} existe déjà : déplace-le avant de déchiffrer.`); process.exit(1); }
    writeFileSync(out, plain);
    console.log(`Déchiffré : ${out}`);
  } catch (_) {
    console.error('Échec : mauvais mot de passe, ou fichier modifié.');
    process.exit(1);
  }
}
