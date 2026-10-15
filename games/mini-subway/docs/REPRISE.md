# Reprise du chantier Mini Subway

État au 2026-10-16 (soir) : jeu **fusionné dans `main` et en ligne sur roulia.me** (928bf8d), règles Firebase `ms/` déployées. La branche `feature/mini-subway` = `main` + notes de reprise. Voir `../SESSION_SUIVANTE.md` pour la suite. Détail : `ETAT.md`, `TRACABILITE.md`, `QUESTIONS.md`, `DECISIONS.md`, revues dans `revue/`.

## Reprendre sur une autre machine

```bash
git clone https://github.com/philxvii/GameHub.git && cd GameHub
git checkout feature/mini-subway
git config user.name "philxvii"
git config user.email "116272977+philxvii@users.noreply.github.com"
python -m http.server 4173      # http://localhost:4173/games/mini-subway/  (?emu = émulateurs)
node --test games/mini-subway/tests/engine.test.mjs
```

Tests navigateur et multijoueur : `tests/README.md` (Chrome installé ; multijoueur sur émulateurs, Java 11+).

## Contraintes à respecter

- Nom unique : **Mini Subway**. Aucun autre nom de jeu dans le code, les commits ou la doc.
- Pas de commit direct sur `main`, pas de `--force`, pas de déploiement sans demande explicite. Pousser sur `main` met le site en production.
- Commits courts, en français, minuscules : `feat(mini-subway): …` / `fix(mini-subway): …`, sans trailer ni co-auteur.
- Firebase : uniquement sur émulateur pour tester. Les règles `ms/` sont dans `firebase/build-rules.js` mais **pas déployées** ; le fichier de transition ne les inclut pas.
- Documentation publique minimale (voir `../CLAUDE.md`).
- Handicaps et pénalités : extension future, seulement un point d'extension prévu.

## Suite logique

1. Défauts mineurs de `revue/gate3.md` ; revoir les repères de bord (modifiés après la dernière revue).
2. Équilibrage sur de vraies parties (`QUESTIONS.md`).
3. Relancer `cd firebase && npm test` en entier (phase1 et transition n'ont pas été relancés dans le cloud).
4. (fait) fusion dans `main`, mise en ligne, règles `ms/` déployées.
