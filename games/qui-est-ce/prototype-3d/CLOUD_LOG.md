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

## L1 — optimisation du personnage ICT

### Outillage (2026-10-14)

| Outil | Rôle |
| --- | --- |
| `js/compare.js` `?char=<glb>` | personnage chargé (défaut `models/character-01-ict.glb`), aussi avec `?bench=` ; champ `char` possible dans un jeu `compare-<set>.json`. Le cadrage reste calculé sur le personnage de référence (sinon retirer les coques déplacerait la caméra). Banc : yeux fermés forcés, gros plans par `setViewOffset` (même caméra recadrée), zones yeux / bouche en pixels |
| `tools/character-ict/bench_character.js` | 6 états + yeux fermés + 5 gros plans (yeux, yeux fermés, yeux méfiants, bouche sourire, bouche surprise) + 3 vues tournées ; `zones.json`, `stats.json` |
| `tools/hair/diff_shots.py --char` | en plus : yeux fermés, gros plans, zones yeux et bouche par état, pire cas par zone ; planche annotée. Usage cheveux inchangé |
| `tools/character-ict/optimize_character.py` | passe Python (coques, textures, variante sans expressions non pilotées, nettoyage du binaire) puis `gltfpack` 1.3.0 (`-kn -km -ke` imposés) ; contrôle final des noms de nœuds, des os (ordre), des expressions (ordre) et des matériaux |
| `tools/character-ict/geom_error.py` | erreur géométrique après déquantification (repos et chaque expression), en mm |

gltfpack : `npm install --prefix build/tools gltfpack@1.3.0`. Il enveloppe chaque maillage dans
un nœud enfant sans nom qui porte la déquantification ; les nœuds nommés (`head`, `hair`,
`torso`, `Hips`, `Spine2`, `Neck`, `Head`, `eyeLeft`, `eyeRight`) restent, avec leurs
transformations. `rig.js` détecte os, yeux et expressions par nom de nœud et
`morphTargetDictionary` : compatible. gltfpack retire aussi les UV des matériaux sans texture
(bouche, dents, gencives…) et fusionne les sommets en double.

### Étapes mesurées hors navigateur (rendu bloqué, voir L0)

| Étape (cumulée) | Commande `optimize_character.py` | Poids | Erreur géom. max (repos / expressions) |
| --- | --- | --- | --- |
| 0. référence | — | 16 514 692 o | — |
| 1. coques retirées | `--drop-shells` | 15 054 836 o | 0 (données supprimées seulement) |
| 2. + positions et expressions 16 bits | `--pack "-vp 16 -vtf -vnf"` | 11 466 532 o | 0,0052 / 0,0053 mm |
| 3. + normales 8 bits, UV 16 bits | `--pack "-vp 16 -vt 16"` | 11 119 804 o | 0,0052 / 0,0053 mm |
| 3b. variante 14 bits | `--pack "-vp 14 -vt 14"` | 10 565 404 o | 0,021 / 0,026 mm |
| 5. + meshopt | `--pack "-vp 16 -vt 16 -c"` | 3 517 920 o | idem 3 (compression sans perte) |
| 5b. meshopt renforcé | `--pack "-vp 16 -vt 16 -cc"` | 3 441 960 o | idem 3 |

Les étapes 2-3 grossissent par rapport à l'éparse float32 tant qu'elles ne sont pas
compressées : gltfpack écrit les expressions en dense (53 × 26 719 sommets). L'étape 4
(textures) reste à faire ; elles pèsent ~1,9 Mo sur les 3,4 Mo restants. Un pixel du banc
vaut ~0,3 mm : l'erreur de position est ~60 fois plus petite. Les normales 8 bits doivent
encore être jugées au rendu (reflets de la peau). **Aucune étape n'est retenue avant le banc
d'images** (yeux, bouche, 6 états).

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
