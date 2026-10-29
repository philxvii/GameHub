// Catalogue des manches. Ajouter une manche : un fichier dans rounds/ (contrat :
// rounds/contract.js), son interface dans play/, une ligne ici et une dans play/index.js.

import gong from './gong.js';
import tir from './tir.js';
import dictee from './dictee.js';
import chemin from './chemin.js';
import numeros from './numeros.js';
import damier from './damier.js';
import coffre from './coffre.js';
import dejavu from './dejavu.js';
import bac from './bac.js';
import calcul from './calcul.js';
import nuage from './nuage.js';
import prix from './prix.js';
import encre from './encre.js';
import chrono from './chrono.js';
import intrus from './intrus.js';
import anagramme from './anagramme.js';
import metronome from './metronome.js';

export const ROUNDS = [gong, tir, dictee, chemin, numeros, damier, coffre, dejavu, bac, calcul, nuage, prix, encre, chrono, intrus, anagramme, metronome];
export const BY_ID = Object.fromEntries(ROUNDS.map(r => [r.id, r]));
export const round = id => BY_ID[id] || null;
export { FAMILIES, compareKeys, ABSENT, MAX_PAYLOAD } from './contract.js';

// Manche de départage : un Gong court entre les seuls ex æquo.
export const TIEBREAK = 'gong';
