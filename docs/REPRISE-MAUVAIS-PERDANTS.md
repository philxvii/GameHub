# Reprise : Mauvais Perdants (nouveau jeu)

> Note de passation, à lire en premier. Elle est écrite à la fin de la session de
> développement sur l'ancien PC (23/10/2026). Mets-la à jour (ou supprime-la, ainsi que son
> renvoi dans `CLAUDE.md`) quand le jeu est en production.

## Où on en est

- **Branche** : `feature/party-showdown`, poussée sur GitHub, rebasée sur `main` à `efb9d0c`.
  **Pas encore fusionnée dans `main`** : rien n'est en production.
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

## Derniers résultats (sur le commit poussé)

| Suite | Résultat |
|---|---|
| `node --test games/mauvais-perdants/tests/*.test.mjs` | 61/61 |
| Règles Firebase (toute la suite du dépôt) | 365/365 |
| `games/mauvais-perdants/tests/multi.cjs` (4 Chrome, 3 tournois, vraies règles) | 17/17 |
| `games/mauvais-perdants/tests/rounds.cjs` | 5/5 sur la version d'avant le renommage ; en cours au moment du départ |
| Banqueroll, Mini Subway | 37/37, 77/77, 42/42 |
| `tools/check-links.js` | 15/16 (« racine propre » : échec antérieur à cette branche) |

Une revue indépendante (sous-agent) a fait deux passes. Ses défauts bloquants et importants
ont été corrigés et retestés. Restent assumés :
- pas de serveur arbitre (tricherie possible pour qui sait programmer) ;
- en duel, au Petit Bac, l'autre joueur juge seul.

## Ce qu'il reste à faire, dans l'ordre

1. Relancer `rounds.cjs` pour confirmer le 5/5 sur la version renommée (prérequis
   ci-dessous). Les captures (`games/mauvais-perdants/docs/captures/`, non commitées) se
   régénèrent avec `multi.cjs` et `rounds.cjs`.
2. **Mise en production, sur demande explicite de l'utilisateur seulement** :
   - a. l'utilisateur publie `firebase/database.rules.phase2.json` dans la console Firebase.
     C'est **à faire avant** de fusionner : sans ces règles, la base refuse l'accès au salon.
     Sur l'ancien PC pro, le CLI Firebase était bloqué, d'où la console ;
   - b. fusionner `feature/party-showdown` dans `main` et pousser, ce qui déploie roulia.me.
     Jamais de `--force`.
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
