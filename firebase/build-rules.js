// Génère database.rules.phase2.json (phase 2 : comptes anonymes, membres, hôte, admin)
// et database.rules.transition.json (phase 1 + secrets d'Undercover + admin).
// Les huit jeux partagent le même modèle ; seuls le format du code, la phase où l'on
// peut entrer et, pour Undercover, les nœuds secrets diffèrent.
//
//   node build-rules.js        # puis npm test

import { readFileSync, writeFileSync } from 'node:fs';

const CODE = '/^[A-Z]{3,5}-[0-9]{2}$/';
const GAMES = {
  games:      { code: CODE },                                   // Undercover
  banqueroll: { code: '/^[A-Z]{3,5}-[0-9]{2}(-[a-z0-9]{1,3})?$/' },
  p4:         { code: CODE },
  qec2:       { code: CODE },
  bn:         { code: CODE },
  rl:         { code: CODE, joinAnyPhase: true },               // Roulette : on s'assoit à tout moment
  mg:         { code: CODE },
  uno:        { code: CODE },
};

const ADMIN = "auth != null && root.child('admins').child(auth.uid).val() === true";
// Maintenance (hub/settings/maintenance) : plus aucune lecture ni écriture, sauf l'admin.
const OPEN = "root.child('hub').child('settings').child('maintenance').val() !== true";
const NAME ="newData.isString() && newData.val().length >= 1 && newData.val().length <= 30 && !newData.val().contains('<')";
const SHORT_TEXT = n => `newData.isString() && newData.val().length <= ${n} && !newData.val().contains('<')`;

function gameRules(prefix, { code, joinAnyPhase }) {
  const phase = `root.child('${prefix}').child($code).child('phase')`;
  const room = {
    // Lecture : membres et admin. Jamais sur le préfixe entier (sauf admin).
    '.read': `auth != null && ((${OPEN} && data.child('members').child(auth.uid).exists()) || ${ADMIN})`,
    '.write': [
      `auth != null && ((${OPEN} && (`,
      // création : code au format, l'auteur est l'hôte et le premier membre
      `(!data.exists() && $code.matches(${code}) && newData.child('hostUid').val() === auth.uid && newData.child('members').child(auth.uid).val() === true)`,
      // jeu : tout membre (le modèle client-autoritaire ne permet pas plus fin)
      "|| (data.exists() && newData.exists() && data.child('members').child(auth.uid).exists())",
      // suppression : l'hôte seulement
      "|| (data.exists() && !newData.exists() && data.child('hostUid').val() === auth.uid)))",
      `|| (${ADMIN}))`,
    ].join(' '),
    // L'hôte reste membre : personne ne peut l'exclure de sa propre partie.
    '.validate': "newData.hasChildren(['phase', 'hostUid']) && newData.child('members').child(newData.child('hostUid').val()).val() === true",
    hostUid: { '.validate': 'newData.isString() && (!data.exists() || newData.val() === data.val())' },
    members: {
      $uid: {
        // Entrer dans une partie : s'inscrire soi-même, tant que la phase le permet.
        '.write': `auth != null && auth.uid === $uid && !data.exists() && ${OPEN} && ${joinAnyPhase ? `${phase}.exists()` : `${phase}.val() === 'lobby'`}`,
        '.validate': `newData.val() === true && ($uid === auth.uid || data.exists() || (${ADMIN}))`,
      },
    },
    // La phase seule est visible de tout compte : « code introuvable » ou « déjà lancée ».
    phase: { '.read': `auth != null && ${OPEN}`, '.validate': 'newData.isString() && newData.val().length <= 32' },
    players: { $i: { name: { '.validate': NAME } } },
  };
  return {
    '.read': ADMIN,
    '.write': `${ADMIN} && !newData.exists()`,
    $code: room,
  };
}

const rules = {
  '.read': false,
  '.write': false,

  admins: { $uid: { '.read': 'auth != null && auth.uid === $uid' } },

  hub: {
    online: {
      '.read': OPEN,
      $key: {
        '.write': `${OPEN} && $key.matches(/^[a-z0-9]{1,16}$/)`,
        '.validate': "newData.hasChildren(['t'])",
        t: { '.validate': 'newData.isNumber()' },
        $other: { '.validate': false },
      },
    },
    stats: {
      visits: {
        '.read': true,
        '.write': `newData.isNumber() && ((${OPEN} && ((!data.exists() && newData.val() === 1) || (data.isNumber() && newData.val() === data.val() + 1))) || (${ADMIN} && newData.val() === 0))`,
      },
    },
    hidden: { '.read': true, '.write': ADMIN, $id: { '.validate': 'newData.isBoolean()' } },
    settings: { '.write': ADMIN, ageGate: { '.read': true, '.validate': 'newData.isBoolean()' }, maintenance: { '.read': true, '.validate': 'newData.isBoolean()' }, $other: { '.validate': false } },
    updateLog: {
      '.read': true,
      '.write': ADMIN,
      $i: {
        '.validate': "newData.hasChildren(['ts'])",
        ts: { '.validate': 'newData.isNumber()' },
        datetime: { '.validate': SHORT_TEXT(40) },
        game: { '.validate': SHORT_TEXT(40) },
        change: { '.validate': SHORT_TEXT(200) },
        $other: { '.validate': false },
      },
    },
  },

  // Ancien Wikirace : visible et supprimable par l'admin seulement.
  wr: { '.read': ADMIN, '.write': `${ADMIN} && !newData.exists()` },
};

for (const [prefix, opts] of Object.entries(GAMES)) rules[prefix] = gameRules(prefix, opts);

// Undercover : les secrets ne sont jamais dans games/<code>.
const room = rules.games.$code;
room.civilWord = { '.validate': false };
room.undercoverWord = { '.validate': false };
room.roles = { '.validate': false };

const UC_HOST = "auth != null && root.child('games').child($code).child('hostUid').val() === auth.uid";
const ROLE = "newData.isString() && newData.val().matches(/^(civil|undercover|mrwhite)$/)";
const WORD = 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 60';
// ucHost/<code> : les deux mots et tous les rôles, pour l'hôte seul (il arbitre).
rules.ucHost = {
  '.read': ADMIN,
  '.write': `${ADMIN} && !newData.exists()`,
  $code: {
    '.read': `(${UC_HOST} && ${OPEN}) || (${ADMIN})`,
    '.write': `(${UC_HOST} && ${OPEN}) || (${ADMIN})`,
    '.validate': "newData.hasChildren(['civilWord', 'undercoverWord', 'roles'])",
    civilWord: { '.validate': WORD },
    undercoverWord: { '.validate': WORD },
    roles: { $i: { '.validate': ROLE } },
    $other: { '.validate': false },
  },
};
// ucSecret/<code>/<uid> : le rôle et le mot d'un joueur, lisibles par lui seul.
rules.ucSecret = {
  '.read': ADMIN,
  '.write': `${ADMIN} && !newData.exists()`,
  $code: {
    '.read': `(${UC_HOST} && ${OPEN}) || (${ADMIN})`,
    '.write': `(${UC_HOST} && ${OPEN}) || (${ADMIN})`,
    $uid: {
      '.read': `auth != null && auth.uid === $uid && ${OPEN}`,
      '.validate': "newData.hasChildren(['role'])",
      role: { '.validate': ROLE },
      word: { '.validate': WORD },
      $other: { '.validate': false },
    },
  },
};

writeFileSync(new URL('./database.rules.phase2.json', import.meta.url), JSON.stringify({ rules }, null, 2) + '\n');
console.log('database.rules.phase2.json écrit');

// Transition : acceptée à la fois par les clients en ligne (sans compte, phase 1) et par
// les nouveaux (comptes anonymes). Parties : règles de phase 1 ; en plus, les nœuds
// secrets d'Undercover, admins/ et les droits de l'admin. À publier avant les clients,
// puis à remplacer par la phase 2 une fois les anciens onglets disparus.
const phase1 = JSON.parse(readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8')).rules;
const transition = { ...phase1, admins: rules.admins, ucHost: rules.ucHost, ucSecret: rules.ucSecret, wr: rules.wr };
for (const prefix of Object.keys(GAMES)) {
  const room = { ...phase1[prefix].$code };
  room['.write'] = `${room['.write']} || (${ADMIN})`;
  // Sinon un ancien client pourrait se déclarer hôte d'une nouvelle partie et lire ucHost.
  room.hostUid = rules[prefix].$code.hostUid;
  transition[prefix] = { '.read': ADMIN, '.write': `${ADMIN} && !newData.exists()`, $code: room };
}
transition.hub = { ...phase1.hub, hidden: rules.hub.hidden, settings: rules.hub.settings, updateLog: rules.hub.updateLog, stats: rules.hub.stats };
writeFileSync(new URL('./database.rules.transition.json', import.meta.url), JSON.stringify({ rules: transition }, null, 2) + '\n');
console.log('database.rules.transition.json écrit');
