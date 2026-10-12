// Le prompt prive du presentateur (ai-host/src/persona.js) n'est pas versionne. Sur un
// clone neuf il manque : les tests partent alors du modele public persona.example.js
// (copie ignoree par git). Sans effet quand le vrai fichier est la.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'ai-host', 'src');
const PERSONA = path.join(SRC, 'persona.js');
// COPYFILE_EXCL : jamais d'ecrasement, meme si deux tests demarrent en meme temps.
if (!fs.existsSync(PERSONA)) {
  try { fs.copyFileSync(path.join(SRC, 'persona.example.js'), PERSONA, fs.constants.COPYFILE_EXCL); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
