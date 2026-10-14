# Journal de la session cloud

Tenu par la session Claude Code sur le web (voir [CLOUD_PLAN.md](CLOUD_PLAN.md)).
Une entrée par étape terminée, poussée avec son commit.

## Branche et budget

- Branche de travail : `proto/qui-est-ce-3d`
- Point de départ : commit du checkpoint du 2026-10-14 (PC de l'utilisateur)

| Date | Moment | Solde annoncé | Remarque |
| --- | --- | --- | --- |
| 2026-10-14 | démarrage (L0) | 100 $ | `/cost` indisponible dans la session web |

## Environnement cloud (L0)

Relevé le 2026-10-14.

| Élément | Valeur |
| --- | --- |
| Système | Ubuntu 24.04.5, 4 cœurs, 15 Go de RAM, pas de GPU |
| Python | 3.11.17 dans un venv `uv` (le Python système est 3.13 : `pillow==10.3.0` ne s'y installe pas) |
| Bibliothèques | exactement `tools/requirements.txt` (numpy 2.4.6, scipy 1.17.0, opencv 5.0.0, pillow 10.3.0, mediapipe 1.1.0, trimesh 5.1.1) |
| Paquets système ajoutés | `libegl1 libgles2 libgl1` (mediapipe ne se charge pas sans `libEGL.so.1`) |
| Node | 22.22.0 ; `meshoptimizer` 1.3.0 dans `build/tools` |
| Chrome | Chromium Playwright 1194 (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), lancé via un script qui ajoute `--no-sandbox` (session root) |

**Parité : identique à l'octet près.**

| Contrôle | md5 | Résultat |
| --- | --- | --- |
| `build_ict.py build/ict-check.glb` contre `models/character-01-ict.glb` | `a66f9c281d41fca95273831efc1c6f19` | identique (22 s) |
| `gen_cards.py hair-curly-v41` | — | `git status` propre : source V4.1 identique |
| `optimize_hair.py` + `meshopt_pack.mjs --v1` contre `hair-curly-v41-opt.glb` | `ae96633dbff2c2e6ee44930aaf8a5b43` | identique |

**Rendu navigateur : bloqué.** La politique réseau de l'environnement cloud refuse
`cdn.jsdelivr.net` (403 du proxy), d'où les pages chargent Three.js r186 par `importmap`.
`test-proto.js` : 0/2 (« modèle non chargé »), et `bench_hair.js` ne peut pas tourner.
Remède : ajouter `cdn.jsdelivr.net` aux domaines autorisés de l'environnement (réglages
de l'environnement cloud, Accès réseau). Les références cloud (`build/bench/cloud-ref`)
et `test-proto.js` seront relancés dès que l'hôte est autorisé.

## Avancement

| Lot | Étape | Commit | Résultat | Décision |
| --- | --- | --- | --- | --- |
| L0 | dépendances, parité md5 | — | personnage et coiffure identiques à l'octet | environnement validé pour les scripts Python et Node |
| L0 | rendu (test-proto, banc de référence) | — | bloqué : `cdn.jsdelivr.net` refusé par le réseau | en attente de l'autorisation de l'hôte |

## Validations de l'utilisateur

| Point | Date | Décision |
| --- | --- | --- |
| G1 personnage optimisé | | |
| G2 distribution des 24 | | |
| G-DA direction artistique | | |
| G3 plateau | | |
| G4 accessoires | | |

## État au retour

À remplir par le lot R : branche, dernier commit, lots terminés, validations en attente,
mesures à refaire sur le PC (GPU), commandes de reprise.
