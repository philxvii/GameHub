# Reprise : Mauvais Perdants (nouveau jeu)

> Note de passation, à lire en premier. Elle est écrite à la fin de la session de
> développement sur l'ancien PC (23/10/2026). Mets-la à jour (ou supprime-la, ainsi que son
> renvoi dans `CLAUDE.md`) quand le jeu est en production.

## Pour Claude : comment reprendre

L'utilisateur ne retient pas les commandes. **C'est toi qui les lances.** Il dira simplement
« reprends Mauvais Perdants », « on teste le jeu », « ça marche pas en ligne »…

1. Vérifie si l'étape 2a ci-dessous (règles Firebase) est faite : demande-le-lui. Tant
   qu'elle ne l'est pas, le jeu s'affiche sur roulia.me mais ne peut ni créer ni rejoindre
   de salon (« Accès refusé »). Guide-le clic par clic dans la console.
2. Pour un test local, lance toi-même l'environnement (section « Tester en local ») en tâche
   de fond, puis donne-lui l'adresse. Pour jouer à plusieurs, il ouvre l'adresse dans des
   navigateurs différents (Chrome, Edge, une fenêtre privée) : chacun est un joueur distinct.
3. Ne pousse sur `main` (production) qu'à sa demande explicite.

## Refonte de l'interface « Canal 7 » (26/10/2026) : faite en local, NON commitée

Après plusieurs pistes refusées (music-hall avec présentateur dessiné, tableau sombre),
l'utilisateur a validé un prototype animé : le jeu est une émission de **Canal 7**, chaîne
fictive de la fin des années 70. Pas de présentateur à l'écran (ses répliques sont toujours
écrites en base, juste plus affichées), **pas de son** pour l'instant (`ENABLED = false` dans
`js/sfx.js`). Tout est décrit dans `games/mauvais-perdants/docs/DIRECTION-ARTISTIQUE.md`.

- Fichiers : `index.html`, `css/show.css`, `js/main.js` (vues), `js/ui/fx.js` (transitions).
  Supprimés : `js/ui/stage.js` (présentateur), anciens fichiers de décor. Moteur, règles,
  réseau, Firebase, IA : inchangés.
- Tests : `tests/multi.cjs` adapté (bouton « Jouer en solo », réplique lue en base au lieu de
  l'écran, fenêtres de rechargement et de 3e tournoi élargies à intro ou compte à rebours).
- Poussé le 26/10 à la demande de l'utilisateur AVANT les tests navigateur des derniers ajouts :
  animations ralenties, mises à jour sur place (fluidité), Gong vert/rouge, nouvelle manche
  « L'Étiquette » (`js/rounds/prix.js`, `js/play/prix.js`), choix des manches par l'hôte (codé dans
  `cfg.v`, voir `encodePicks` dans `js/draw.js`). Node : 67/67.
- Le 27/10, tests navigateur sur la version poussée : `multi.cjs` 17/17, `rounds.cjs` 5/5 (graines
  MAN00000 / MAN00006), `solo.cjs` 4/4. Corrigés ensuite en local (non poussés) : barre de défilement
  pendant la virgule d'antenne, un seul autocollant au salon.
- Le 27/10 encore, **poussé** (commit 7f5047c, à la demande de l'utilisateur) :
  - **L'Étiquette refaite façon jeu télé** : 47 vrais produits de supermarché (prix médians
    Open Prices, photos Open Food Facts dans `img/prix/<code-barres>.jpg`, re-téléchargeables
    avec `node games/mauvais-perdants/img/prix/telecharger.mjs`). Même produit pour tous au même
    instant : 12 s pour estimer, puis 4 s d'étiquette rouge (`slotAt` dans `js/rounds/prix.js`).
    Au verdict, tableau produit par produit avec l'estimation de chacun et le plus proche en vert.
  - **Animations calmées** : plus de rebond, trajets courts, plus de clignotements rapides ni
    d'objets qui tournent en boucle ; virgule d'antenne seulement à l'entrée et à la finale,
    plus lente ; deux fois moins de confettis.
  - **Menu de partie** (bouton ☰ en haut à droite pendant l'émission) : règles de la manche,
    « Animations réduites » (mémorisé, classe `html.calm`), plein écran, quitter avec
    confirmation, et pour le coordinateur « Arrêter le tournoi » (retour au salon).
  - **« Au programme »** déplacé dans une fiche sous le code du plateau, avec coches et bouton
    « Tout le programme » pour l'hôte.
  - Ensuite (local, à pousser) : **choix des épreuves dès l'accueil** (mémorisé, envoyé dans
    `cfg.v` à la création) et **tournoi de 1 à 5 manches** : `roundsOf(m)` dans `js/draw.js` =
    longueur du tirage ; le départage garde l'indice 5 (aucune règle Firebase changée). Moins de
    cinq épreuves cochées : toutes jouées, une fois chacune ; la dernière ne compte double que
    s'il y en a au moins deux. Vérifié : solo avec une seule épreuve jusqu'au podium.
  - Tests : Node 68/68, `multi.cjs` 17/17, `rounds.cjs` 5/5, `solo.cjs` 4/4. Les suites
    navigateur visent le port 4174 par défaut : sur ce PC, préfixer
    `SA_URL=http://localhost:4173/games/mauvais-perdants/`.

- 28/10, retours des testeurs, **local, non commité, non testé dans un navigateur** (Node 68/68) :
  défilement rendu à l'accueil/salon sur ordinateur (barres fines visibles, `show.css`) ; intro de
  manche avec mini-démo animée en 3 temps (`DEMOS` dans `main.js`) et rappel des points max
  (`pointsNote`) ; L'Étiquette : tableau des estimations de chacun placé AVANT le classement.
  Ajoutés ensuite : prix des autres affichés à chaque étiquette (via `prog`, clé `tag.produit`,
  valeur = centimes×10 + nb de réponses, sans changer les règles Firebase) ; intro du départage
  nomme les ex æquo. `rounds.cjs` 5/5 (le rendu des prix des autres n'a pas été regardé à l'œil).
  Reste : Ban (admin), `multi.cjs` et `solo.cjs` à relancer.
- 28/10, **local, non commité** : lots pour rire (12 au total, source affichée pour chacun) ; Le Coffre
  à plusieurs passe en élimination à tour de rôle (`js/rounds/coffre.js`, `derive()`, `js/play/coffre.js`,
  journal `turns/` dans `firebase/build-rules.js`). **Règles Firebase modifiées** : il faut publier
  `firebase/database.rules.phase2.json` dans la console (Realtime Database > Règles) AVANT de pousser,
  puis vérifier en ligne. Tests : Node 73/73, règles Firebase du jeu (Coffre inclus), `multi.cjs` 17/17,
  `rounds.cjs` MAN00005 3/3 (Coffre en élimination). Pas encore vu dans Chrome à 3 joueurs.

**Lancer les émulateurs sur ce PC** : le lanceur `npx firebase` est bloqué par une stratégie de
groupe (pas Java). Utiliser Node directement, avec le JDK 21 installé en ZIP (hors PATH, Java 17
reste le défaut) :
`JAVA_HOME="$LOCALAPPDATA/Programs/Eclipse Adoptium/jdk-21.0.12.1+1" PATH="$JAVA_HOME/bin:$PATH" node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only database,auth --project demo-gamehub`
(depuis `firebase/`).
  Le nom « Sans Appel » évoqué dans un prompt n'a pas été repris (le jeu reste Mauvais Perdants).

**Pièges de cette session** : l'IA simulée n'accepte que les origines `localhost:4173` et
`:4174` ; des Chrome de test orphelins (profil `bq-cdp-*`, parent mort) peuvent garder les
ports 9400+ : les fermer avant de relancer ; ne jamais lancer deux suites navigateur en même
temps (elles partagent ces ports et l'émulateur).

## Où on en est

- **Code** : fusionné dans `main` et poussé le 26/10/2026, en ligne et jouable sur
  roulia.me (règles Firebase publiées le 26/10). Mode solo contre Gonzague inclus.
  La branche `feature/party-showdown` contient la même chose.
- Règles Firebase : **publiées** (étape 2a faite).
- **Jeu** : `games/mauvais-perdants/`. C'est un tournoi de 5 mini-jeux entre amis (2 à 8
  joueurs, code de salon, sans compte), animé par Gonzague Stentor, un présentateur odieux.
  - 11 manches réparties en 5 familles, une manche par famille à chaque tournoi.
  - Points selon la place (10 au premier, 2 au dernier), 5e manche ×2, fanfaronnade ±3.
  - Petit Bac corrigé par IA ; une réponse douteuse ou une IA absente passe au vote des
    joueurs.
- **À lire** :
  - `games/mauvais-perdants/README.md` : règles, architecture, commandes ;
  - `games/mauvais-perdants/docs/CONCEPTION.md` : direction artistique, audit de
    Banqueroll, modèle de données, limites ;
  - `docs/party-game-research.md` : recherche et décisions de game design.
- **Firebase** : nouveau nœud `mp/<code>`, avec ses règles dans `firebase/build-rules.js`
  (fonction `mpRules`) et ses tests dans `firebase/tests/mauvais-perdants.test.js`.
- **IA** : Worker séparé dans `games/mauvais-perdants/ai/`, **non déployé**.
  `AI_ENDPOINT = ''` dans `js/ai.js` : sans IA, le jeu tourne avec ses répliques locales et
  le Petit Bac en mode jury. Banqueroll n'a pas été modifié.

Ajout du 26/10 : **mode solo** (duel contre un score de référence de Gonzague, `ghost()`
dans chaque `rounds/*.js`), testé par `tests/solo.cjs` (4/4).

## Derniers résultats (sur le commit poussé)

| Suite | Résultat |
|---|---|
| `node --test games/mauvais-perdants/tests/*.test.mjs` | 61/61 |
| Règles Firebase (toute la suite du dépôt) | 365/365 |
| `games/mauvais-perdants/tests/multi.cjs` (4 Chrome, 3 tournois, vraies règles) | 17/17 |
| `games/mauvais-perdants/tests/rounds.cjs` (3 Chrome, les 6 manches que multi ne tire pas) | 5/5 |
| Banqueroll, Mini Subway | 37/37, 77/77, 42/42 |
| `tools/check-links.js` | 15/16 (« racine propre » : échec antérieur à cette branche) |

Une revue indépendante (sous-agent) a fait deux passes. Ses défauts bloquants et importants
ont été corrigés et retestés. Restent assumés :
- pas de serveur arbitre (tricherie possible pour qui sait programmer) ;
- en duel, au Petit Bac, l'autre joueur juge seul.

## Ce qu'il reste à faire, dans l'ordre

1. Les captures (`games/mauvais-perdants/docs/captures/`, non commitées) se régénèrent avec
   `multi.cjs` et `rounds.cjs`.
2. **Mise en production** :
   - a. **À FAIRE** : l'utilisateur publie le contenu de `firebase/database.rules.phase2.json`
     dans la console Firebase (Realtime Database > Règles > coller > Publier). Le CLI Firebase
     est bloqué sur le PC pro, d'où la console. Le fichier contient les règles **complètes**
     du site : celles déjà en ligne, plus le nœud `mp`. Vérifie avant que les règles en ligne
     sont bien celles de phase 2 : elles contiennent un nœud `ms` avec `cmds`, et pas encore
     de nœud `mp`. Si ce n'est pas le cas, ne remplace rien sans comprendre l'écart ;
   - b. **FAIT** le 26/10/2026 : branche fusionnée dans `main` et poussée.
3. Plus tard, l'IA :
   - déployer le Worker (`games/mauvais-perdants/ai/README.md` : wrangler, ou
     `node games/mauvais-perdants/ai/build-bundle.mjs` puis coller le fichier dans le tableau
     de bord Cloudflare) ;
   - ajouter les secrets `GEMINI_API_KEY` et `OPENROUTER_API_KEY` ;
   - renseigner l'URL du Worker dans `AI_ENDPOINT` (`js/ai.js`).

## Tester en local

```bash
cd firebase && npm install                     # firebase-tools exige Java 21+
npx firebase emulators:start --only database,auth --project demo-gamehub
node firebase/tests/serve-emulated.js 4174     # à la racine
node games/mauvais-perdants/tests/ai-mock.mjs 8787   # IA simulée (facultatif)
# http://localhost:4174/games/mauvais-perdants/?emu   (ajouter &ai=http://localhost:8787)
node games/mauvais-perdants/tests/multi.cjs
node games/mauvais-perdants/tests/rounds.cjs
```

## Pièges rencontrés

- **Java** : firebase-tools refuse Java 17. Sur l'ancien PC, le Java 25 fourni par
  l'extension Java de VS Code a servi (`JAVA_HOME` vers `…/redhat.java-*/jre/*`).
- **Règles de l'émulateur** : le site parle à l'espace
  `undercover-game-b0d2a-default-rtdb`, ouvert par défaut. Les tests navigateur y chargent
  eux-mêmes les vraies règles (`loadRules()` dans `multi.cjs` et `rounds.cjs`). Sans cette
  étape, un test « vert » ne prouve rien côté sécurité.
- **Fins de ligne** : un script Python en mode texte réécrit les fichiers en CRLF sous
  Windows, ce qui casse `ai/build-bundle.mjs`. Écrire en LF.
- **Échappements** : des ` ` ou `\b` passés par un heredoc ou une chaîne Python
  non brute se transforment en vrais caractères, et une expression régulière casse en
  silence. Les reconstruire avec `chr(92)`, ou éditer directement.
- **Hub** : le jeu est ajouté à la liste `GAMES` de `home.html` **sans** champ `db`, comme
  Mini Subway : le panneau admin suppose des joueurs rangés en tableau, ce qui n'est pas le
  cas ici.
- **Captures du hub** : la vérification d'âge du hub s'affiche d'abord ; ne pas la remplir
  à la place de l'utilisateur.

## Hors de cette branche

L'ancien PC avait des modifications locales non commitées sur `main` : edge-stats,
banqueroll (briefing), mini-subway (intro), home.html, `shared/admin-audience.js`, plus
`docs/CLOUDFLARE-NAVIGATION.md`. Elles appartiennent à l'utilisateur et ne viennent pas de
cette branche ; elles n'ont pas été poussées. `games/banqueroll/ai-host/src/persona.js` est
privé et non versionné : à copier à la main si besoin.
