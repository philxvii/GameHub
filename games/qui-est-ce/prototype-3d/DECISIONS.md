# Décisions prises en autonomie

Tenu par la session cloud (voir « MODE AUTONOME » dans [CLOUD_PLAN.md](CLOUD_PLAN.md)).
Chaque décision est réversible ; l'utilisateur relit à la fin et réajuste.

| Date | Lot | Question | Décision prise | Alternative écartée | Pour revenir en arrière |
| --- | --- | --- | --- | --- | --- |
| 2026-10-14 | L1 | G1 : adopter le personnage optimisé ? | **Auto-validé** : critère du plan atteint (6 états 0,01 % de pixels > 8 niveaux, SSIM 0,9996 ; pires zones yeux 0,9987, bouche 0,9986, gros plans 0,9984 ; `test-proto.js` identique). `models/character-01-ict-opt.glb` (2,85 Mo) devient le personnage par défaut du plateau et du jeu 3D. Planche : `reports/ict-opt/planche.jpg` | garder l'original de 16,5 Mo | l'original reste intact : `?char=models/character-01-ict.glb`, ou changer la constante `CHAR` du plateau |
| 2026-10-14 | L1 | Retirer les 23 expressions jamais pilotées (−0,69 Mo) ? | Non : les 53 expressions restent (de futures expressions peuvent en avoir besoin) | variante `build/ict-opt/s6-driven.glb` (2,16 Mo) | relancer `optimize_character.py … --drop-targets unused` |
| 2026-10-14 | L1 | Réduire aussi la texture du crâne (−167 Ko) ? | Non : elle couvre le cou ; 0,4 % puis 0,15 % de pixels changés dans le gros plan bouche | crâne ½ en JPEG 85 | ajouter `scalp=jpeg:85@0.5` à `--tex` |
| 2026-10-14 | L2 | Écart de 6,5° du recalage : fixer des graines ? | Aucune graine à fixer (pas de hasard) : cause = écarts numériques entre machines amplifiés par un recalage mal conditionné. Règle : toute la chaîne d'un personnage sur une seule machine (le PC), intermédiaires versionnés | rendre le recalage robuste dès maintenant | voir `CLOUD_LOG.md`, section « Écart de 6,5° » |
| 2026-10-14 | DA | Déclinaison multijoueur (point 6) | **Auto-validée** telle que capturée (`reports/da/partie-*.jpg`) : voyant de tournage + Polaroïd soulevé pour lire le tour, barre film / papier, révélation du salon, revanche en un clic | — | les écrans sont des maquettes indépendantes (`partie.html`, `css/partie.css`) |
