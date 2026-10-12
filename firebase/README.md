# Règles Realtime Database

Projet Firebase `undercover-game-b0d2a`, instance unique
`undercover-game-b0d2a-default-rtdb` (europe-west1), offre Spark. Le hub et
8 jeux s'en servent ; Wikirace n'utilise pas Firebase. Ni Firestore ni Storage.
La configuration client est commune : [shared/firebase.js](../shared/firebase.js).

| Fichier | Rôle |
|---|---|
| `firebase.json` | nomme le fichier **publié** par `firebase deploy` (en ce moment : la transition) |
| `database.rules.json` | phase 1 : base de la transition, retour arrière avant les nouveaux clients |
| `database.rules.transition.json` | phase 1 + secrets d'Undercover + admin : anciens et nouveaux clients |
| `database.rules.phase2.json` | règles finales : comptes anonymes, membres, hôte, admin |
| `build-rules.js` | génère les deux derniers ; ne pas les modifier à la main |

## Modèle de la phase 2

Chaque joueur reçoit un compte anonyme Firebase, invisible et conservé par le
navigateur (un seul par navigateur, partagé par ses onglets). Une partie
`<préfixe>/<code>` porte `hostUid` (son créateur, immuable) et `members/<uid>`.

| Qui | Peut |
|---|---|
| tout compte | lire `phase` d'un code (« introuvable » / « déjà lancée ») ; s'inscrire membre tant que la partie est au salon (Roulette : à tout moment) |
| membre | lire et écrire la partie (le jeu reste client-autoritaire) ; pas changer `hostUid`, pas exclure l'hôte |
| hôte | supprimer la partie |
| admin (`admins/<uid>: true`, posé dans la console) | tout lister, supprimer ; réglages et journal du hub ; remise à zéro du compteur |
| visiteur sans compte | présence et compteur du hub (+1), lecture des réglages du hub |

Undercover : les mots et les rôles ne sont jamais dans `games/<code>` (la règle
le refuse). `ucHost/<code>` (mots + rôles) n'est lisible que par l'hôte, qui
arbitre ; `ucSecret/<code>/<uid>` (rôle + mot d'un joueur) par ce joueur seul.
L'hôte juge la tentative de Mr. White, exécute « Continuer » demandé par un
invité et publie mots et rôles à la fin (`reveal`).

Limites qui demanderaient un serveur de confiance (Cloud Functions : offre Blaze,
payante) : l'hôte connaît tous les secrets ; un membre peut modifier toute sa
partie ; les mains d'UNO, flottes, personnages choisis et primes secrètes
restent lisibles par les autres membres de la même partie.

## Tester

Java 11+ requis (les émulateurs sont des JAR).

```bash
cd firebase && npm install
npm test        # règles : phase 1 et transition (anciens clients), transition (nouveaux), phase 2
```

Vrais clients contre les émulateurs, sans toucher à la production :

```bash
npx firebase emulators:start --only database,auth --project undercover-game-b0d2a
node tests/serve-emulated.js 4174      # puis ouvrir les pages avec ?emu
curl -X PUT -H "Authorization: Bearer owner" --data-binary @database.rules.phase2.json \
  "http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb"
CDP_PORT=9333 node tests/smoke-games.cjs   # 7 jeux + hub, un contexte (compte) par joueur
# Suites Banqueroll, depuis la racine (REST redirigé vers l'émulateur en administrateur) :
CDP_PORT=9333 BQ_URL="http://localhost:4173/games/banqueroll/?ai=off&emu" \
  node -r ./firebase/tests/use-emulator.cjs games/banqueroll/tests/test-browser.js
```

`CDP_PORT` évite le Chrome d'une autre suite sur 9222. L'IA simulée n'accepte que
l'origine `localhost:4173`.

## Déployer (toujours `--only database`)

```bash
npx firebase login
npx firebase deploy --only database --project undercover-game-b0d2a
```

Jamais `firebase deploy` sans `--only`. Passage à la phase 2, dans l'ordre :

1. Console → Authentication → Commencer ; activer **Anonyme** et **Google** ;
   Paramètres → Domaines autorisés : ajouter `roulia.me`.
2. Publier la **transition** : `firebase.json` → `database.rules.transition.json`,
   `npm test`, déployer. Les anciens onglets continuent.
3. Publier les clients (push sur `main`), vérifier les jeux sur roulia.me.
4. Se connecter une fois en admin (hub → ⚙) : le message donne l'uid ; dans la
   console, Realtime Database → Données, créer `admins/<uid>` = `true`.
5. Après quelques heures (anciens onglets fermés, parties d'avant terminées),
   `firebase.json` → `database.rules.phase2.json`, `npm test`, déployer, puis vérifier : une lecture sans compte
   de `.../games/<code>.json` doit répondre 401.

Retour arrière (changer le fichier dans `firebase.json`, redéployer) : avant
l'étape 3, la phase 1 ; après, la **transition**
(seule compatible avec tous les clients : la phase 1 refuse `ucHost`, donc les
nouvelles parties d'Undercover).
