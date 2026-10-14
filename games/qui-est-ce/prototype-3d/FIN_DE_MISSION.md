# Fin de mission cloud : Qui est-ce ? 3D

Branche `proto/qui-est-ce-3d`, 2026-10-14. Rien n'a été déployé, `main` n'a pas été touchée,
aucun secret n'est versionné. Le jeu en production (`games/qui-est-ce/index.html`, `qec2`)
est intact. Solde annoncé à la fin de L5 : 53 $ sur 100 $.

## Ce qui est fait

| Lot | Résultat | Où regarder |
| --- | --- | --- |
| L0 | Environnement cloud, parité à l'octet avec le PC ; Three.js servi depuis npm pour les tests (jsdelivr bloqué) | `CLOUD_LOG.md` |
| L1 | Personnage optimisé : **16,5 → 2,85 Mo**, SSIM 0,9996, yeux et bouche ≥ 0,998, 53 expressions gardées | `reports/ict-opt/planche.jpg` |
| L2 | Roster des 24, consignes photo, pipeline `--id` ; cause de l'écart de 6,5° trouvée (pas de hasard : différences numériques entre machines) | `data/roster.json`, `tools/pipeline/README.md` |
| DA | « Casting » + révélation du salon + revanche, déclinée sur tous les écrans, bureau et 390 px ; plus aucun son | `reports/da/partie-bureau.jpg`, `reports/da/partie-mobile.jpg` |
| L4 | Lunettes (acétate, métal noir), barbe, moustache, barbe complète (suivent les expressions), casquette + coiffure dessous, créoles, perles, variante rasée ; 4 coiffures proposées | `reports/accessories/*.jpg` |
| L3 | Plateau jouable : 24 cartes vivantes, partie complète contre un bot malicieux, révélation, titres, statistiques locales, planche contact PNG, revanche en un clic | `reports/board/*.jpg` ; `tools/test-board.js` 12/12 |
| L5 | Entrée `games/qui-est-ce/v3d/` (maintenance, compte anonyme, salons en ligne) ; règles `qec3` + secret protégé ; réseau Firebase | `firebase/tests/qec3.test.js` 342/342 (émulateur) ; `QE_PAGE=v3d … test-board.js` 12/12 ; liens 13/13 |
| L6 | Dossier PC : une commande par étape | `PC_RUNBOOK.md`, `tools/pipeline/check_refs.py`, `build_character.py --all-ready`, `tools/measure_pc.js` |

## Choix faits en autonomie (détail et retour arrière : `DECISIONS.md`)

- G1 (personnage optimisé), déclinaison multijoueur de la DA, G3 (plateau), G4 (accessoires),
  G5 (jeu en ligne, côté cloud) : **auto-validés** sur critères mesurés, à confirmer à l'œil.
- Sons retirés (accroches `qe:<évènement>` à la place).
- Monture fine en métal **noir mat** plutôt qu'or (lisibilité à la taille d'une carte).
- Barbes avec expressions par sommet (2,2 à 2,9 Mo) plutôt qu'une barbe figée qui se détache.
- Substituts des 23 personnages : le 01 habillé selon ses attributs, rasé de près s'il n'a ni
  barbe ni moustache (marqués temporaires).
- `v3d/index.html` générée depuis `board.html` avec `<base href>` (pas de copie de 14 Mo).
- Arbitrage en ligne par les clients honnêtes (pas de Cloud Function).

## Ce qui reste au PC (détail : `PC_RUNBOOK.md`)

1. `node games/qui-est-ce/prototype-3d/tools/measure_pc.js` : FPS réels, repeinte, mémoire GPU, chargement.
2. Partie en ligne à deux navigateurs contre l'émulateur.
3. Photos Gemini des 23 personnages, puis `build_character.py --all-ready --bench` (Hunyuan à la main).
4. Brancher le chargement par fiche (`person.glb`) dans `js/game/board3d.js` au deuxième personnage.
5. Mise en ligne (procédure écrite, non exécutée).

## Les 5 décisions les plus discutables

1. **G1 auto-validé** : les chiffres sont excellents, mais personne n'a encore regardé le
   personnage optimisé bouger sur un vrai GPU.
2. **Arbitrage par les clients** : un client modifié peut mentir sur son propre secret. Les
   règles empêchent tout le reste (lire le secret adverse, jouer à la place de l'autre).
3. **Substituts** : 23 cartes montrent le même visage habillé différemment ; l'âge, le genre et
   la couleur des yeux ne se lisent que sur la fiche au survol. Jouable, mais pas le jeu final.
4. **Poids des barbes** (jusqu'à 2,9 Mo) : la qualité a primé sur le poids ; à revoir si les
   mesures PC ou le mobile le demandent.
5. **`<base href>` dans `v3d/`** : simple et sans copie, mais `check-links.js` a dû apprendre
   cette balise ; à remplacer par un vrai dossier `v3d/` à la mise en ligne.

## Questions (`QUESTIONS.md`)

- Retirer les 23 expressions jamais pilotées (−0,69 Mo par personnage) ?
- Fabriquer les 23 personnages sur le PC (recommandé) ou rendre d'abord le recalage robuste ?
- Coiffures longues : règle « dégager le visage » avant de les fabriquer ?
- Arbitrage en ligne : accepter la limite actuelle, ou ajouter une Cloud Function ?
- (Budget : réglé, solde annoncé 53 $.)
