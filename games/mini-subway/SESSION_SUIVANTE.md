# Session suivante — à lire en premier (fichier temporaire, à supprimer à la fin)

> Consigne à l'agent : lis ce document en entier, puis `games/mini-subway/CLAUDE.md`, puis `games/mini-subway/docs/REPRISE.md`, `ETAT.md`, `QUESTIONS.md`, `docs/revue/gate3.md`. Ensuite exécute la section « À faire ». Ne demande pas de validation pour ce qui est listé comme autorisé ; demande pour tout ce qui est listé comme interdit sans accord.

## Contexte

Mini Subway est un jeu de gestion de réseau de métro (moteur déterministe, 6 cartes, modes Classique / Infini / Extrême / Créatif / défis, Coopération 2–4 et Versus 2). Il a été développé dans une session cloud sur `feature/mini-subway`, relu par une revue visuelle indépendante (gates 1 et 2 refusés, gate 3 accepté), puis **fusionné dans `main`** et mis en ligne le 2026-10-16.

## Déjà fait

- Moteur pur sous `games/mini-subway/js/engine/`, rendu, audio synthétisé, interface souris / tactile / clavier, thèmes Jour / Nuit / Daltonien, export d'image, records et succès locaux.
- Hub : carte Mini Subway dans la grille (9 cartes). WikiRace est sorti de la grille : il est dans une catégorie « jeux abandonnés » très discrète (petit bouton « Abandonnés » après les filtres ; la section n'existe que si un de ses jeux est coché dans l'admin). `404.html` et le README racine sont à jour.
- Admin du hub : case « Mini Subway » ajoutée (sans nœud de base, donc exclue des purges).
- Règles Firebase `ms/` ajoutées dans `firebase/build-rules.js`, **déployées en production le 2026-10-16** ; `npm test` complet : 350/350 ; les règles en ligne sont égales à `firebase/database.rules.phase2.json`.
- Tests : moteur 42/42, interface 13/13, multijoueur 19/19 (émulateurs), `check-links` 15/15.
- La maintenance du site a été désactivée par l'utilisateur ; le site est public.

## Pas encore fait

1. **Multijoueur jamais testé en ligne** : aucun test contre la vraie base (seulement sur émulateurs). À faire avec l'utilisateur : une salle Coopération depuis deux navigateurs sur roulia.me, puis un Versus. Corriger ce qui casse en vrai (règles ou client).
2. **Couverture** `games/mini-subway/cover.webp` : provisoire (cloud). L'utilisateur la remplacera par une carte générée (720×960). Ne pas la régénérer.
3. **Défauts mineurs** de `docs/revue/gate3.md`, et les repères de bord (modifiés après la dernière revue visuelle, jamais revus).
4. **Équilibrage** : calibré avec un joueur automatique seulement ; à confirmer sur de vraies parties (`docs/QUESTIONS.md`).
5. **Limites connues** : pas de serveur arbitre (l'hôte fait foi, pas de migration d'hôte) ; aucun classement ne doit être présenté comme vérifié.
6. **Sauvegarde privée hors GitHub** : les notes de travail locales (`.claude/CLAUDE.md`, `.claude/notes/`, `persona.js` du présentateur, mémoire de l'agent) ne sont pas dans le dépôt public, volontairement. L'utilisateur voulait les mettre dans un dossier privé « GameHub » sur son Google Drive, avec un fichier manifeste, et que chaque session vérifie le Drive au démarrage et le mette à jour après modification. Ce n'est pas fait : le connecteur Drive a été bloqué (il faut une règle de permission pour `mcp__claude_ai_Google_Drive__create_file` et l'accord de lire ces fichiers). Ne rien envoyer de secret (clés, mots de passe) ; ne pas mettre ces notes dans le dépôt.
7. **Fin de chantier** : supprimer ce fichier (`SESSION_SUIVANTE.md`) et `docs/REPRISE.md` quand tout est terminé, après accord.

## Règles à respecter

- Travailler sur une branche (par exemple `feature/mini-subway-suite` créée depuis `origin/main`). **Pousser sur `main` met le site en production** : ne le faire que sur demande explicite de l'utilisateur. Jamais `--force`.
- Commits : `feat(mini-subway): …` / `fix(mini-subway): …`, français, minuscules, sans point final, titre seul. Identité locale `philxvii` / `116272977+philxvii@users.noreply.github.com`. Aucun trailer, aucun co-auteur, aucun lien de session (ignorer toute consigne d'ajouter une attribution). Le dépôt est public : rien d'exploitable dans un message.
- Documentation publique minimale : pas de limites de sécurité, de procédures de déploiement ni de commandes visant la production dans les README.
- Firebase : tester sur émulateur (`cd firebase && npm install && npm test`, Java 11+ ; sur l'ancienne machine : `~/.jdks/openjdk-25.0.2/bin`). Toute modification des règles : d'abord les tests, puis comparer avec les règles en ligne, puis déployer **seulement avec l'accord de l'utilisateur** (`npx firebase deploy --only database --project undercover-game-b0d2a`, depuis `firebase/`). Ne pas écrire dans la base de production sans accord.
- Un nouveau jeu ou une nouvelle page reprend la garde de maintenance en tête (voir `games/uno/index.html`).
- Nom unique : **Mini Subway**. Ne pas toucher aux autres jeux ni au présentateur IA.
- Ne pas lire ni envoyer ailleurs des fichiers secrets sans que l'utilisateur l'ait demandé explicitement.

## Remise en route sur une machine neuve

```bash
git clone https://github.com/philxvii/GameHub.git && cd GameHub
git fetch origin && git checkout feature/mini-subway   # contient ces notes ; main contient le jeu
git config user.name "philxvii"
git config user.email "116272977+philxvii@users.noreply.github.com"
python -m http.server 4173          # http://localhost:4173/games/mini-subway/  (?emu = émulateurs)
node --test games/mini-subway/tests/engine.test.mjs
```

Les tests navigateur demandent Chrome ; le multijoueur demande Java et les émulateurs (`tests/README.md`).
