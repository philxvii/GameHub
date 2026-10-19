// Remplit l'émulateur LOCAL de la base (127.0.0.1:9000, espace « apercu-local ») avec des données
// SYNTHÉTIQUES pour l'aperçu du panneau admin : journal, parties, réglages. Refuse toute autre adresse.
//   java -jar firebase-database-emulator-v4.11.2.jar --port 9000   (jar de firebase-tools)
//   node edge-stats/dev-seed-firebase.mjs
const BASE = 'http://127.0.0.1:9000';
const NS = 'apercu-local';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw new Error('émulateur local uniquement');

const H = 3600e3, now = Date.now();
const LOG = [
  [0.2, 'connexion', 'Connexion au panneau d’administration', 'Google'],
  [0.5, 'jeu', 'WikiRace masqué de l’accueil', 'wikirace'],
  [1.1, 'partie', 'Partie K7QF supprimée', 'Puissance 4'],
  [3, 'joueur', 'Joueur-démo-3 exclu de la partie ZX81', 'UNO'],
  [26, 'connexion', 'Connexion au panneau d’administration', 'Google'],
  [26.2, 'reglage', 'Maintenance activée', ''],
  [27, 'reglage', 'Maintenance désactivée', ''],
  [50, 'stats', 'Compteur historique de visites remis à zéro', ''],
  [74, 'global', 'Toutes les parties supprimées', 'tous les jeux'],
  [75, 'reglage', 'Vérification d’âge activée', ''],
];
const adminLog = {};
LOG.forEach(([h, cat, msg, target], i) => {
  const ts = Math.round(now - h * H);
  adminLog[`-demo${String(ts).padStart(15, '0')}${i}`] = { ts, cat, msg: `${msg} [démo]`, target, by: 'admin-demo' };
});

const data = {
  adminLog,
  hub: {
    settings: { ageGate: true, maintenance: false },
    hidden: { wikirace: true },
    stats: { visits: 1234 },
    updateLog: [{ ts: now - 200 * H, datetime: '10/10/2026 18:02:11', game: 'UNO', change: '"uno" affiché [démo]' }],
  },
  p4: { K7QF: { phase: 'play', hostUid: 'demo-a', players: [{ name: 'Joueur-démo-1' }, { name: 'Joueur-démo-2' }] } },
  uno: { ZX81: { phase: 'lobby', hostUid: 'demo-b', players: [{ name: 'Joueur-démo-3' }, { name: 'Joueur-démo-4' }, { name: 'Joueur-démo-5' }] } },
};
const res = await fetch(`${BASE}/.json?ns=${NS}`, { method: 'PUT', body: JSON.stringify(data) });
console.log(res.ok ? 'Émulateur rempli (données de démonstration).' : 'Échec ' + res.status);
