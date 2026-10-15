# Tests de Mini Subway

| Fichier | Rôle | Navigateur | Réseau |
|---|---|---|---|
| `engine.test.mjs` | Moteur : cartes, graine, croissance, lignes, ponts, routage, correspondances, trains, wagons, surcharge, modes, récompenses, défis, records, longues parties, déterminisme, issue des duels. | non | non |
| `multi.cjs` | Multijoueur avec de **vrais clients distincts** (un Chrome et un compte anonyme par joueur) : salon, codes, partie pleine, départ, monde commun, ressources atomiques, édition concurrente, commande rejouée, pause, déconnexion/reconnexion, départ, Versus (même départ, réseaux indépendants, commande hors siège refusée, abandon, revanche), empreintes d'état. | oui | émulateurs |
| `capture.cjs` | Captures de référence pour la revue visuelle (`docs/captures/`). | oui | émulateurs (garde de maintenance) |
| `cover.cjs` | Régénère `cover.webp` (carte du hub) avec le moteur et le rendu du jeu. | oui | émulateurs |
| `../../../firebase/tests/mini-subway.test.js` | Règles de la base pour `ms/<code>` : membre, non-membre, non authentifié, hôte, journal à écriture unique, Versus, maintenance. | non | émulateur |

## Lancer

```bash
# moteur (Node 22+, sans dépendance)
node --test games/mini-subway/tests/*.test.mjs

# règles de la base (Java 11+), dans l'émulateur uniquement
cd firebase && npm install && npm test

# tests navigateur : dépôt servi + émulateurs base et auth
python -m http.server 4173                     # à la racine du dépôt
cd firebase && npx firebase emulators:start --only database,auth --project demo-gamehub
node games/mini-subway/tests/multi.cjs
node games/mini-subway/tests/capture.cjs gate  # préfixe des fichiers
```

Les pages sont ouvertes en `?emu` : la garde de maintenance et Firebase visent les
émulateurs locaux, jamais la base de production.

Variables utiles : `CHROME_PATH` (navigateur), `MS_URL` (adresse du jeu),
`MS_SHOTS=<préfixe>` (captures pendant `multi.cjs`), `MS_FIREBASE_SDK=<dossier>` : si le
CDN `www.gstatic.com` est injoignable depuis la machine de test, dossier du paquet npm
`firebase@10.12.0` dont les fichiers (identiques à ceux du CDN) sont servis par
interception des requêtes ; le code du jeu n'est pas modifié.
