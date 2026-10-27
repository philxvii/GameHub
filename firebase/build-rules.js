// Génère database.rules.phase2.json (phase 2 : comptes anonymes, membres, hôte, admin)
// et database.rules.transition.json (phase 1 + secrets d'Undercover + admin).
// Les huit jeux partagent le même modèle ; seuls le format du code, la phase où l'on
// peut entrer et, pour Undercover, les nœuds secrets diffèrent.
//
//   node build-rules.js        # puis npm test

import { readFileSync, writeFileSync } from 'node:fs';

const CODE = '/^[A-Z]{3,5}-[0-9]{2}$/';
const SHORT_TEXT = n => `newData.isString() && newData.val().length <= ${n} && !newData.val().contains('<')`;
const GAMES = {
  games:      { code: CODE, texts: { descriptions: { $round: { $i: { author: { '.validate': SHORT_TEXT(30) }, text: { '.validate': SHORT_TEXT(200) } } } } } },   // Undercover : descriptions des joueurs
  banqueroll: { code: '/^[A-Z]{3,5}-[0-9]{2}(-[a-z0-9]{1,3})?$/' },
  p4:         { code: CODE },
  qec2:       { code: CODE, texts: {                           // Qui est-ce : questions posées (120 caractères côté client)
    questions: { $i: { text: { '.validate': SHORT_TEXT(200) }, authorName: { '.validate': SHORT_TEXT(30) } } },
    pendingQuestion: { text: { '.validate': SHORT_TEXT(200) }, authorName: { '.validate': SHORT_TEXT(30) } },
  } },
  bn:         { code: CODE },
  rl:         { code: CODE, joinAnyPhase: true },               // Roulette : on s'assoit à tout moment
  mg:         { code: CODE },
  uno:        { code: CODE },
};

const ADMIN = "auth != null && root.child('admins').child(auth.uid).val() === true";
// Maintenance (hub/settings/maintenance) : plus aucune lecture ni écriture, sauf l'admin.
const OPEN = "root.child('hub').child('settings').child('maintenance').val() !== true";
// Jeu masqué par l'admin (hub/hidden/<id>) : fermé comme en maintenance, mais pour ce jeu seul.
// Les pages d'un jeu sont publiques (dépôt public) : seule la base peut vraiment l'interdire.
// Identifiant du jeu dans hub/hidden, par nœud de la base (liste GAMES de home.html).
const HUB_ID = { games: 'undercover', banqueroll: 'banqueroll', p4: 'puissance4', qec2: 'quiestce', bn: 'bataille', rl: 'roulette', mg: 'minigolf', uno: 'uno', ms: 'minisubway', mp: 'mauvaisperdants' };
const openFor = prefix => `${OPEN} && root.child('hub').child('hidden').child('${HUB_ID[prefix]}').val() !== true`;
const NAME ="newData.isString() && newData.val().length >= 1 && newData.val().length <= 30 && !newData.val().contains('<')";

function gameRules(prefix, { code, joinAnyPhase, texts }) {
  const OPEN = openFor(prefix);
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
    // Textes libres saisis par les joueurs : longueur bornée et jamais de balise (anti-XSS, 2e couche).
    ...texts,
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
    // Ancien journal (20 dernières entrées) : n'est plus écrit ; lisible par l'admin seul (il contenait des pseudos).
    updateLog: {
      '.read': ADMIN,
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

  // Journal de l'admin : complet, lisible par l'admin seul, en ajout seulement (aucune entrée ne se
  // modifie ni ne s'efface, même par l'admin). Heure fixée par le serveur, auteur = le compte connecté.
  adminLog: {
    '.read': ADMIN,
    $id: {
      '.write': `${ADMIN} && !data.exists() && newData.exists()`,
      '.validate': "newData.hasChildren(['ts', 'cat', 'msg', 'by'])",
      ts: { '.validate': 'newData.val() === now' },
      cat: { '.validate': "newData.isString() && newData.val().matches(/^(connexion|jeu|reglage|partie|joueur|stats|global)$/)" },
      msg: { '.validate': SHORT_TEXT(300) },
      target: { '.validate': SHORT_TEXT(60) },
      by: { '.validate': 'newData.val() === auth.uid' },
      $other: { '.validate': false },
    },
  },

  // Ancien Wikirace : visible et supprimable par l'admin seulement.
  wr: { '.read': ADMIN, '.write': `${ADMIN} && !newData.exists()` },
};

for (const [prefix, opts] of Object.entries(GAMES)) rules[prefix] = gameRules(prefix, opts);

// Mini Subway (ms/<code>) : modèle propre, plus strict que celui des autres jeux. Les
// membres n'écrivent pas la partie entière : chacun écrit sa fiche, sa présence et ses
// demandes de commande ; seul l'hôte (horloge de la partie) écrit la configuration, la
// phase et le journal ordonné des commandes, à écriture unique. Une commande du journal
// porte l'auteur de la demande d'origine ; en Versus, elle ne vise que le réseau de son
// auteur (siège attribué par l'hôte au lancement).
function msRules() {
  const OPEN = openFor('ms');
  const R = "root.child('ms').child($code)";
  const AUTH = `auth != null && ${OPEN}`;
  const MEMBER = `${R}.child('members').child(auth.uid).exists()`;
  const HOST = `${R}.child('hostUid').val() === auth.uid`;
  const NUM = 'newData.isNumber()';
  const room = {
    '.read': `auth != null && ((${OPEN} && data.child('members').child(auth.uid).exists()) || ${ADMIN})`,
    '.write': [
      `auth != null && ((${OPEN} && (`,
      `(!data.exists() && $code.matches(${CODE}) && newData.child('hostUid').val() === auth.uid && newData.child('members').child(auth.uid).val() === true && newData.child('phase').val() === 'lobby')`,
      "|| (data.exists() && !newData.exists() && data.child('hostUid').val() === auth.uid)))",
      `|| (${ADMIN}))`,
    ].join(' '),
    '.validate': "newData.hasChildren(['phase', 'hostUid']) && newData.child('members').child(newData.child('hostUid').val()).val() === true",
    hostUid: { '.validate': 'newData.isString() && (!data.exists() || newData.val() === data.val())' },
    members: {
      $uid: {
        '.write': `auth != null && auth.uid === $uid && !data.exists() && ${OPEN} && ${R}.child('phase').val() === 'lobby'`,
        '.validate': `newData.val() === true && ($uid === auth.uid || data.exists() || (${ADMIN}))`,
      },
    },
    phase: { '.read': `auth != null && ${OPEN}`, '.write': `${AUTH} && ${HOST}`, '.validate': "newData.isString() && newData.val().matches(/^(lobby|playing|ended)$/)" },
    cfg: {
      '.write': `${AUTH} && ${HOST}`,
      '.validate': "newData.hasChildren(['kind', 'map', 'mode', 'seed', 'round', 'v'])",
      kind: { '.validate': "newData.isString() && newData.val().matches(/^(coop|versus)$/)" },
      map: { '.validate': "newData.isString() && newData.val().matches(/^[a-z-]{1,32}$/)" },
      mode: { '.validate': "newData.isString() && newData.val().matches(/^(classic|infinite|extreme)$/)" },
      seed: { '.validate': NUM }, round: { '.validate': NUM }, v: { '.validate': NUM },
      seats: { $uid: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 3' } },
      handicaps: { v: { '.validate': NUM }, $other: { '.validate': false } },
      $other: { '.validate': false },
    },
    players: {
      $uid: {
        '.write': `${AUTH} && auth.uid === $uid && ${MEMBER}`,
        '.validate': "newData.hasChildren(['name'])",
        name: { '.validate': NAME }, ready: { '.validate': 'newData.isBoolean()' }, t: { '.validate': NUM },
        $other: { '.validate': false },
      },
    },
    presence: { $uid: { '.write': `${AUTH} && auth.uid === $uid && ${MEMBER}`, '.validate': NUM } },
    // Demande de commande : créée par son auteur, retirée par l'hôte une fois journalisée.
    req: {
      $id: {
        '.write': `${AUTH} && ${MEMBER} && ((!data.exists() && newData.child('by').val() === auth.uid) || (data.exists() && !newData.exists() && ${HOST}))`,
        '.validate': "$id.matches(/^[A-Za-z0-9_-]{6,40}$/) && newData.hasChildren(['by', 'c', 'net'])",
        by: { '.validate': 'newData.isString()' }, c: { '.validate': 'newData.isString() && newData.val().length <= 2000' }, net: { '.validate': NUM },
        $other: { '.validate': false },
      },
    },
    // Journal ordonné : l'hôte seul, chaque entrée écrite une fois ; vidé en bloc à la revanche.
    cmds: {
      '.write': `${AUTH} && ${HOST} && !newData.exists()`,
      $seq: {
        '.write': `${AUTH} && ${HOST} && !data.exists()`,
        '.validate': "$seq.matches(/^c[0-9]{6}$/) && newData.hasChildren(['id', 'by', 'tick', 'c', 'net'])",
        id: { '.validate': 'newData.isString() && newData.val().length <= 40' },
        by: {
          '.validate': `newData.isString() && (newData.val() === auth.uid || ${R}.child('req').child(newData.parent().child('id').val()).child('by').val() === newData.val())`
            + ` && (${R}.child('cfg').child('kind').val() !== 'versus' || newData.parent().child('net').val() === ${R}.child('cfg').child('seats').child(newData.val()).val() || (newData.val() === auth.uid && newData.parent().child('net').val() === -1))`,
        },
        tick: { '.validate': NUM }, net: { '.validate': NUM },
        c: { '.validate': 'newData.isString() && newData.val().length <= 2000' },
        $other: { '.validate': false },
      },
    },
    head: { '.write': `${AUTH} && ${HOST}`, '.validate': "newData.hasChildren(['tick', 'n'])", tick: { '.validate': NUM }, n: { '.validate': NUM }, $other: { '.validate': false } },
    hash: { '.write': `${AUTH} && ${HOST}`, tick: { '.validate': NUM }, h: { '.validate': NUM }, $other: { '.validate': false } },
    snap: { '.write': `${AUTH} && ${HOST}`, tick: { '.validate': NUM }, s: { '.validate': 'newData.isString() && newData.val().length <= 400000' }, $other: { '.validate': false } },
    result: { '.write': `${AUTH} && ${HOST}`, '.validate': "newData.hasChildren(['outcome'])", outcome: { '.validate': "newData.isString() && newData.val().length <= 64" }, tick: { '.validate': NUM }, $other: { '.validate': false } },
    $other: { '.validate': false },
  };
  return { '.read': ADMIN, '.write': `${ADMIN} && !newData.exists()`, $code: room };
}
rules.ms = msRules();

// Mauvais Perdants (mp/<code>) : tournoi de mini-jeux. Un COORDINATEUR (l'hôte, ou un membre qui
// le remplace quand sa présence n'a plus battu depuis 15 s) écrit seul l'état du tournoi
// (match), la phase et les répliques du présentateur (mc). Chaque joueur n'écrit que ses
// propres nœuds : fiche, présence, « prêt », progression, fanfaronnade, votes, et sa
// réponse de manche — UNE fois, pendant l'étape `play`, jusqu'à l'échéance + 2,5 s
// (horloge du serveur) : une réponse tardive ou rejouée est refusée par la base.
function mpRules() {
  const OPEN = openFor('mp');
  const R = "root.child('mp').child($code)";
  const M = `${R}.child('match')`;
  const AUTH = `auth != null && ${OPEN}`;
  const MEMBER = `${R}.child('members').child(auth.uid).exists()`;
  const HOST = `${R}.child('hostUid').val() === auth.uid`;
  const COORD = `${R}.child('coord').val() === auth.uid`;
  const NUM = 'newData.isNumber()';
  const ROSTER = `${M}.child('roster').child($uid).exists()`;
  const CUR = `$tid === ${M}.child('tid').val() && $rk === ${M}.child('rk').val()`;
  const OWN = `${AUTH} && auth.uid === $uid && ${MEMBER}`;
  const STALE = `(!${R}.child('presence').child(data.val()).exists() || ${R}.child('presence').child(data.val()).val() < now - 15000)`;
  const room = {
    '.read': `auth != null && ((${OPEN} && data.child('members').child(auth.uid).exists()) || ${ADMIN})`,
    '.write': [
      `auth != null && ((${OPEN} && (`,
      `(!data.exists() && $code.matches(${CODE}) && newData.child('hostUid').val() === auth.uid && newData.child('members').child(auth.uid).val() === true && newData.child('phase').val() === 'lobby' && newData.child('coord').val() === auth.uid)`,
      "|| (data.exists() && !newData.exists() && data.child('hostUid').val() === auth.uid)))",
      `|| (${ADMIN}))`,
    ].join(' '),
    '.validate': "newData.hasChildren(['phase', 'hostUid']) && newData.child('members').child(newData.child('hostUid').val()).val() === true",
    hostUid: { '.validate': 'newData.isString() && (!data.exists() || newData.val() === data.val())' },
    members: {
      $uid: {
        '.write': `auth != null && auth.uid === $uid && !data.exists() && ${OPEN} && ${R}.child('phase').val() === 'lobby'`,
        '.validate': `newData.val() === true && ($uid === auth.uid || data.exists() || (${ADMIN}))`,
      },
    },
    phase: { '.read': `auth != null && ${OPEN}`, '.write': `${AUTH} && (${HOST} || ${COORD})`, '.validate': "newData.isString() && newData.val().matches(/^(lobby|playing|ended)$/)" },
    // Reprise : un membre prend la coordination si celle de l'actuel coordinateur est éteinte ; l'hôte la reprend quand il veut.
    coord: {
      '.write': `${AUTH} && ${MEMBER} && newData.val() === auth.uid && (${HOST} || !data.exists() || ${STALE})`,
      '.validate': 'newData.isString()',
    },
    cfg: {
      '.write': `${AUTH} && ${HOST}`,
      '.validate': "newData.hasChildren(['roast', 'crude'])",
      roast: { '.validate': "newData.isString() && newData.val().matches(/^(soft|hard)$/)" },
      crude: { '.validate': 'newData.isBoolean()' },
      v: { '.validate': NUM },
      $other: { '.validate': false },
    },
    players: {
      $uid: {
        '.write': `${AUTH} && auth.uid === $uid && ${MEMBER}`,
        '.validate': "newData.hasChildren(['name', 'c', 'dev'])",
        name: { '.validate': NAME + ' && newData.val().length <= 16' },
        c: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 7' },
        dev: { '.validate': "newData.isString() && newData.val().matches(/^(touch|mouse)$/)" },
        t: { '.validate': NUM },
        $other: { '.validate': false },
      },
    },
    presence: { $uid: { '.write': OWN, '.validate': 'newData.val() === now' } },
    ready: { $uid: { '.write': OWN, '.validate': "newData.isString() && newData.val().length <= 16" } },
    prog: {
      $uid: {
        '.write': OWN,
        '.validate': "newData.hasChildren(['k', 'v'])",
        k: { '.validate': "newData.isString() && newData.val().length <= 16" },
        v: { '.validate': 'newData.isNumber() && newData.val() >= -1000 && newData.val() <= 100000' },
        $other: { '.validate': false },
      },
    },
    match: {
      '.write': `${AUTH} && ${COORD}`,
      '.validate': "newData.hasChildren(['tid', 'rk', 'step', 'at', 'end', 'seed', 'plan', 'roster'])",
      tid: { '.validate': "newData.isString() && newData.val().matches(/^t[0-9]{1,4}$/)" },
      rk: { '.validate': "newData.isString() && newData.val().matches(/^r[0-9]$/)" },
      i: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 5' },
      step: { '.validate': "newData.isString() && newData.val().matches(/^(intro|count|play|judge|vote|reveal|board|final)$/)" },
      at: { '.validate': NUM }, end: { '.validate': NUM }, seq: { '.validate': NUM },
      seed: { '.validate': "newData.isString() && newData.val().matches(/^[A-Z0-9]{4,16}$/)" },
      plan: { $k: { g: { '.validate': "newData.isString() && newData.val().matches(/^[a-z]{2,12}$/)" }, f: { '.validate': "newData.isString() && newData.val().matches(/^[a-z]{2,12}$/)" }, $other: { '.validate': false } } },
      roster: { $uid: { name: { '.validate': NAME + ' && newData.val().length <= 16' }, c: { '.validate': NUM }, dev: { '.validate': 'newData.isString()' }, $other: { '.validate': false } } },
      tb: { $uid: { '.validate': 'newData.val() === true' } },
      tbg: { '.validate': "newData.isString() && newData.val().matches(/^(gong|calcul)$/)" },
      recent: { $k: { '.validate': "newData.isString() && newData.val().length <= 12" } },
      res: { $i: { $uid: {
        // Bornes du barème (10 points de place, ×2 en finale, fanfaronnade ±3) : un coordinateur ne peut pas écrire 999.
        rank: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 8' },
        base: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 20' },
        boast: { '.validate': 'newData.isNumber() && newData.val() >= -3 && newData.val() <= 3' },
        pts: { '.validate': 'newData.isNumber() && newData.val() >= -3 && newData.val() <= 23' },
        absent: { '.validate': 'newData.isBoolean()' }, tied: { '.validate': 'newData.isBoolean()' },
        label: { '.validate': SHORT_TEXT(60) }, st: { '.validate': 'newData.isString() && newData.val().length <= 800' },
        $other: { '.validate': false },
      } } },
      // Détail d'une manche (correction du Petit Bac, ordre de départage…) : JSON borné, écrit par le coordinateur.
      det: { $i: { '.validate': 'newData.isString() && newData.val().length <= 30000' } },
      $other: { '.validate': false },
    },
    // Répliques du présentateur : le coordinateur seul. Texte borné, sans balise.
    mc: {
      '.write': `${AUTH} && ${COORD}`,
      $id: {
        '.validate': "newData.hasChildren(['t', 'ts'])",
        t: { '.validate': SHORT_TEXT(300) }, ts: { '.validate': NUM },
        ev: { '.validate': "newData.isString() && newData.val().length <= 24" },
        src: { '.validate': "newData.isString() && newData.val().matches(/^(local|gemini|openrouter|workersai)$/)" },
        $other: { '.validate': false },
      },
    },
    subs: {
      '.write': `${AUTH} && ${COORD} && !newData.exists()`,
      $tid: { $rk: { $uid: {
        '.write': `${OWN} && !data.exists() && ${CUR} && ${M}.child('step').val() === 'play' && now <= ${M}.child('end').val() + 2500 && ${ROSTER} && (!${M}.child('tb').exists() || ${M}.child('tb').child($uid).exists())`,
        '.validate': "newData.hasChildren(['d', 't'])",
        d: { '.validate': 'newData.isString() && newData.val().length <= 4000' },
        t: { '.validate': 'newData.val() === now' },
        $other: { '.validate': false },
      } } },
    },
    // Manche commencée : écrit une fois par le joueur au lancement de son interface. Un
    // rechargement voit le marqueur et arrête la manche (pas de rejeu du contenu déjà vu).
    start: {
      '.write': `${AUTH} && ${COORD} && !newData.exists()`,
      $tid: { $rk: { $uid: {
        '.write': `${OWN} && !data.exists() && ${CUR} && ${M}.child('step').val() === 'play' && ${ROSTER}`,
        '.validate': 'newData.val() === now',
      } } },
    },
    boast: {
      '.write': `${AUTH} && ${COORD} && !newData.exists()`,
      $tid: { $rk: { $uid: {
        '.write': `${OWN} && !data.exists() && ${CUR} && ${M}.child('step').val() === 'intro' && ${ROSTER}`,
        '.validate': 'newData.val() === true',
      } } },
    },
    votes: {
      '.write': `${AUTH} && ${COORD} && !newData.exists()`,
      $tid: { $rk: { $uid: {
        '.write': `${OWN} && ${CUR} && ${M}.child('step').val() === 'vote' && now <= ${M}.child('end').val() + 2500 && ${ROSTER}`,
        $g: { '.validate': "$g.matches(/^g[0-9]{1,3}$/) && newData.isBoolean()" },
      } } },
    },
    $other: { '.validate': false },
  };
  return { '.read': ADMIN, '.write': `${ADMIN} && !newData.exists()`, $code: room };
}
rules.mp = mpRules();

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
    '.read': `(${UC_HOST} && ${openFor('games')}) || (${ADMIN})`,
    '.write': `(${UC_HOST} && ${openFor('games')}) || (${ADMIN})`,
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
    '.read': `(${UC_HOST} && ${openFor('games')}) || (${ADMIN})`,
    '.write': `(${UC_HOST} && ${openFor('games')}) || (${ADMIN})`,
    $uid: {
      '.read': `auth != null && auth.uid === $uid && ${openFor('games')}`,
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
// Anciens clients : ils lisent encore hub/updateLog au chargement, la lecture reste publique ici.
transition.hub = { ...phase1.hub, hidden: rules.hub.hidden, settings: rules.hub.settings, updateLog: { ...rules.hub.updateLog, '.read': true }, stats: rules.hub.stats };
transition.adminLog = rules.adminLog;
writeFileSync(new URL('./database.rules.transition.json', import.meta.url), JSON.stringify({ rules: transition }, null, 2) + '\n');
console.log('database.rules.transition.json écrit');
