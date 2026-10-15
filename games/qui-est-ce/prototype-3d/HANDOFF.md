# Qui est-ce ? — 3D Prototype Handoff

Passation du prototype 3D du futur « Qui est-ce ? » de GameHub (roulia.me).
À lire en entier avant de toucher au prototype. Écrit pour une session Claude Code
qui n'a pas l'historique de la conversation d'origine.

Branche : `proto/qui-est-ce-3d` (jamais `main` : pousser sur `main` déploie roulia.me).
Dernière mise à jour : 2026-10-14 (fin de la mission cloud). Le travail en cloud suit [CLOUD_PLAN.md](CLOUD_PLAN.md)
et note son avancement dans [CLOUD_LOG.md](CLOUD_LOG.md).

---

## État actuel

> **Mission 3 (2026-10-15, cloud) : refonte « premium ».** Lire d'abord
> [FIN_DE_MISSION_3.md](FIN_DE_MISSION_3.md). En bref : nouvelle direction « studio de suspects »
> (`css/game.css`), nouvel écran de jeu (`board.html`, `js/game/app.js`), 24 **portraits
> pré-rendus** (`portraits/`, `tools/bake_portraits.js`) et **une** carte vivante en 3D
> (`js/game/live.js`, studio commun `js/game/cast.js`) ; `board3d.js` et les prototypes de l'ancienne
> DA « casting » sont supprimés. Visages : Raphaël (validé), Kenji, Damien, Farid (provisoires,
> `tools/casting/`, `data/casting/`), 20 substituts signalés à l'écran. Tests :
> `tools/test-board-pixels.js` (image), `tools/test-board.js` (partie), `tools/test-game-logic.mjs`.


- **Un seul personnage existe : `character-01`.** Humain fictif, tête ICT-FaceKit ajustée à
  5 photos de référence générées (Gemini), buste issu de Hunyuan3D-2mv, rig et 53 expressions.
- **Visage, yeux, paupières, bouche, expressions et comportement : validés** par
  l'utilisateur (2026-10-08).
- **Coiffure : V4.1 « volume bouclé » validée**, puis **optimisée** de 16,4 Mo à 1,83 Mo
  sans différence visible (2026-10-08). C'est la coiffure de référence.
- **Personnage optimisé** (session cloud du 2026-10-14) : `models/character-01-ict-opt.glb`,
  **2,85 Mo** au lieu de 16,5 Mo, sans différence mesurable (SSIM 0,9996, yeux et bouche
  ≥ 0,998). G1 auto-validé en mode autonome : à confirmer à l'œil (`reports/ict-opt/planche.jpg`).
- **Pipeline des 24** (`tools/pipeline/`, `data/roster.json`, `data/prompts/`) : prêt ; seuls
  les gestes du PC manquent (photos Gemini, Hunyuan). Les 23 autres n'existent pas encore.
- **DA retenue** : « casting » + révélation du salon + revanche en un clic, déclinée sur tous
  les écrans (`partie.html`, `reports/da/`).
- **Accessoires** (lot L4, `models/accessories/`) : lunettes acétate et métal noir, barbe,
  moustache, barbe complète (avec expressions), casquette (+ coiffure sous casquette),
  créoles, perles, variante rasée. Planches dans `reports/accessories/`.
- **Jeu jouable** : `board.html` (prototype) et **`games/qui-est-ce/v3d/`** (entrée du jeu,
  générée depuis `board.html`) : partie complète contre un bot, révélation, statistiques
  locales, titres, planche contact PNG, revanche ; 24 cartes vivantes peintes par un seul
  `WebGLRenderer`. En ligne : règles `qec3` et `js/game/net-firebase.js` testés sur
  l'émulateur (342/342), **jamais déployés** ; la partie à deux navigateurs reste à faire sur
  le PC. Les 23 personnages manquants sont des **substituts** (le 01 habillé selon ses
  attributs), marqués temporaires.
- **Tout ce qui reste à faire sur le PC** : [PC_RUNBOOK.md](PC_RUNBOOK.md). Résumé de la
  mission cloud : [FIN_DE_MISSION.md](FIN_DE_MISSION.md).
- Le jeu en production (`games/qui-est-ce/index.html`, nœud `qec2`) **n'utilise pas** ce
  prototype et n'a pas été modifié.
- Toute la chaîne se **reproduit à l'octet près** depuis la branche (vérifié le 2026-10-14) :
  `build_ict.py` → `character-01-ict.glb`, `gen_cards.py hair-curly-v41` → `hair-curly-v41.glb`,
  `optimize_hair.py` + `meshopt_pack.mjs` → `hair-curly-v41-opt.glb`.

## Objectif produit

Un « Qui est-ce ? » premium, multijoueur, avec **24 personnages humains crédibles en 3D
temps réel** (Three.js, navigateur, gratuit, sans build) :

- **jeu multijoueur à deux en ligne** (salon à code, un secret par joueur, tours alternés,
  comme le jeu en production `qec2/<code>`), mobile compris : le réseau ne transporte que des
  choix, jamais de 3D (voir « Cadre » dans [CLOUD_PLAN.md](CLOUD_PLAN.md)) ;
- plateau de 24 cartes, chaque carte affiche un personnage vivant ;
- **survol** : le personnage regarde le curseur (yeux d'abord, puis la tête, le buste suit
  à peine) ;
- **vie au repos** : respiration, clignements naturels, micro-saccades ;
- **expressions** liées au jeu : neutre, sourire, méfiant, surpris (+ clignement) ;
- carte éliminée : elle se rabat (animation) ;
- **attributs de jeu lisibles** : couleur et longueur des cheveux, lunettes, chapeau,
  barbe, moustache, boucles d'oreilles, etc., via une **bibliothèque d'accessoires 3D**
  et de coiffures en cartes de cheveux ;
- poids et performance compatibles avec le Web (24 personnages à l'écran) ;
- **une direction artistique propre au jeu**, aussi forte que celle de Banqueroll et
  meilleure : sur GameHub, **chaque jeu a sa propre identité** (métaphore physique,
  palette, typographie, matières, mouvement, son). Démarche détaillée dans
  [CLOUD_PLAN.md](CLOUD_PLAN.md), lot DA ; à valider avant de construire le plateau.

## Ce qui est VALIDÉ (ne pas remplacer)

| Élément | Où | Remarque |
| --- | --- | --- |
| Visage ICT-FaceKit ajusté aux photos | `models/character-01-ict.glb` | base de tous les futurs personnages |
| Yeux : globe peint + cornée transparente, iris photo | idem | dans ICT : `M_Iris` = globe intérieur peint, `M_Sclera` = cornée transparente |
| Paupières, cils, film lacrymal, bouche, lèvres, dents, gencives, langue | idem | matériaux de bouche dédiés |
| 53 expressions sculptées (ARKit), squelette Spine2 / Neck / Head | idem | 29 pilotées aujourd'hui par `js/expressions.js` |
| Comportement : regard → tête → buste, clignements, respiration | `js/rig.js` | test `tools/test-proto.js` 15/15 |
| Coiffure V4.1 « volume bouclé » (cartes procédurales) | `models/hair/hair-curly-v41.glb` (source) | mate, boucles variées, mèches groupées et rebelles |
| **Coiffure V4.1 optimisée** | `models/hair/hair-curly-v41-opt.glb` | **à utiliser** ; 1,83 Mo |
| Rendu : Three.js r186 (CDN jsdelivr), ACES, RoomEnvironment, ombre PCF | `js/compare.js` | un seul `WebGLRenderer` découpé en cartes (scissor) |
| Distribution des 24 (G2) | `data/roster.json` | déléguée par l'utilisateur |
| DA « casting » + révélation du salon + revanche | `css/tokens.css`, `partie.html`, `js/staging.js` | choisie par l'utilisateur ; déclinaison multijoueur auto-validée |
| Personnage optimisé (G1, auto-validé) | `models/character-01-ict-opt.glb` | à confirmer à l'œil |
| Accessoires, plateau, jeu en ligne (G3, G4, G5 auto-validés) | voir `DECISIONS.md` | à confirmer |

Planches de référence : [reports/hair-v41/](reports/hair-v41/) (`a-contre-b-v41.jpg` :
ancienne #4 contre V4.1 ; `originale-contre-optimisee.jpg` : les 6 états).

## Ce qui est REFUSÉ (ne pas refaire)

- **Tête Hunyuan3D brute** (`character-01.glb`, gardé en local seulement) : jugée uncanny,
  « mannequin » — yeux morts, peau plastique, bouche plate, proportions fausses. Hunyuan
  ne sert plus qu'au **buste** et à la silhouette.
- **Cheveux peints sur le crâne / coques** (les 8 coques `hair` du GLB ICT) : effet casque,
  texture 2D. Elles restent dans le GLB mais sont **masquées** quand une coiffure en cartes
  est attachée. Candidates à la suppression (voir prochaine étape).
- Coiffures #1 courte, #2 ondulée, #3 MakeHuman (`fit_hair.py`, CC0) : moins crédibles que
  la #4. La #4 non retouchée (brillante, uniforme) a été remplacée par la V4.1.
- **Anisotropie** (`KHR_materials_anisotropy`) sur les cheveux : dans Three.js elle donne
  une bande brillante « mouillée ». V4.1 : rugosité 0,85, spéculaire 0,06, sans anisotropie.
- Avatars génériques, têtes low-poly, sprites, images 2D : hors de question.
- Essais image → 3D via Spaces Hugging Face (`tools/hunyuan2.py`, `hunyuan21.py`,
  `trellis1.py`, `trellis2.py`, `sf3d.py`) et Avaturn : ICT-FaceKit ajusté aux photos les
  a dépassés pour le visage. Ne pas y revenir sans raison nouvelle.
- Optimisations de cheveux **refusées** (écart visible ou gain nul) : retrait de cartes au
  hasard (3,7 % de pixels changés), retrait choisi sur les seules vues de face (nuque
  éclaircie de dos), simplification le long des mèches (les boucles ont besoin de tous les
  segments), texture en demi-résolution, positions sur 14 ou 12 bits, UV sur 8 bits (rendu cassé).

## Fichiers importants

Tous les chemins sont relatifs à `games/qui-est-ce/prototype-3d/`.

| Rôle | Fichier |
| --- | --- |
| Page de comparaison et de mesure (référence) | `compare.html` + `js/compare.js` + `css/compare.css` |
| Visionneuse d'un seul modèle (orbite) | `index.html` + `js/main.js` + `css/proto.css` |
| Rig : regard, tête, buste, clignements, respiration, expressions | `js/rig.js`, `js/expressions.js` |
| Personnage validé | `models/character-01-ict.glb` |
| Coiffure validée (à utiliser) | `models/hair/hair-curly-v41-opt.glb` |
| Coiffure source (entrée de l'optimiseur) | `models/hair/hair-curly-v41.glb` |
| Personnage optimisé (par défaut dans le jeu) | `models/character-01-ict-opt.glb` (recette : `tools/character-ict/optimize_character.py`) |
| Jeu 3D : plateau, réseau, bot, statistiques | `board.html`, `js/game/*.js`, `css/board.css` ; entrée `../v3d/index.html` (`tools/make_v3d.py`) |
| Règles et tests en ligne | `../../../firebase/build-rules.js` (`qec3`), `../../../firebase/tests/qec3.test.js` |
| Accessoires (générateurs et modèles) | `tools/accessories/*.py`, `models/accessories/` |
| Pipeline des personnages | `tools/pipeline/` (README), `data/roster.json`, `data/prompts/` |
| Tests et mesures | `tools/test-board.js`, `tools/test-game-logic.mjs`, `tools/measure_pc.js` |
| Journal, décisions, questions, dossier PC | `CLOUD_LOG.md`, `DECISIONS.md`, `QUESTIONS.md`, `PC_RUNBOOK.md` |
| Jeu de comparaison par défaut (V4.1 originale / optimisée) | `models/hair/compare-opt.json` |
| Maillage Hunyuan (entrée du buste) | `models/hunyuan2mv-3views-shape.glb` |
| Photos de référence haute définition | `refs/front.jpg`, `refs/three-quarter-{left,right}.jpg`, `refs/profile-{left,right}.jpg` |
| Mêmes vues réduites (MediaPipe, ajustement ICT) | `refs/mv/*.jpg` |
| Photos utilisées pour les essais Avaturn / Hugging Face | `refs/avaturn/` |
| Intermédiaires versionnés pour reconstruire le visage | `build/registration.json`, `build/landmarks3d.npy`, `build/landmarks2d-front.npy`, `build/textured.npz`, `build/albedo.png`, `build-ict/ict.npz`, `build-ict/fit.npz` |
| Repères faciaux MediaPipe (Apache 2.0) | `tools/models/face_landmarker.task` |
| Visibilité des cartes de la V4.1 (entrée de l'optimiseur) | `tools/hair/data/hair-curly-v41-vis.json` |
| Dépendances Python | `tools/requirements.txt` |
| Provenance des données tierces | [THIRD_PARTY.md](THIRD_PARTY.md) |

Scripts :

| Script | Rôle |
| --- | --- |
| `tools/character/register.py`, `bake.py` | buste Hunyuan : recalage des 5 vues, texture photo → `build/` |
| `tools/character/build_glb.py` | ancien personnage Hunyuan (refusé) |
| `tools/character-ict/prepare.py` | ICT-FaceKit (OBJ bruts) → `build-ict/ict.npz` |
| `tools/character-ict/fit.py` | ajustement ICT aux repères des photos → `build-ict/fit.npz` |
| `tools/character-ict/build_ict.py` | **personnage complet** → `models/character-01-ict.glb` |
| `tools/hair/gen_cards.py` | coiffures en cartes procédurales (`python tools/hair/gen_cards.py hair-curly-v41`) |
| `tools/hair/optimize_hair.py` | retrait de cartes, texture, quantification (sans régénérer les mèches) |
| `tools/hair/meshopt_pack.mjs` | compression `EXT_meshopt_compression` (une primitive) |
| `tools/hair/bench_hair.js` | banc déterministe : 6 états + 3 vues hors jeu, temps d'image, visibilité des cartes |
| `tools/hair/diff_shots.py` | écarts pixel (MAE, % > 8 et > 24 niveaux, PSNR, SSIM) + planches |
| `tools/test-proto.js` | test du rig dans Chrome réel (15 contrôles) |
| `tools/cutout.py`, `tools/hair/fit_hair.py`, `tools/hunyuan*.py`, `trellis*.py`, `sf3d.py` | essais (détourage, MakeHuman, Spaces HF), gardés pour mémoire |

## Pipeline actuel

```text
refs (5 vues Gemini, PC local)
  └─ Hunyuan3D-2mv (Space HF) ─► models/hunyuan2mv-3views-shape.glb
       └─ character/register.py + bake.py ─► build/ (caméras, buste texturé, repères 3D)
ICT-FaceKit (MIT) ─ prepare.py ─► build-ict/ict.npz
  └─ fit.py (MediaPipe sur refs/mv) ─► build-ict/fit.npz
       └─ build_ict.py ─► models/character-01-ict.glb   (tête + yeux + bouche + 53 expr. + squelette + buste)
            └─ hair/gen_cards.py hair-curly-v41 ─► models/hair/hair-curly-v41.glb   (cartes sur la tête)
                 └─ bench_hair.js --vis ─► visibilité de chaque carte
                      └─ optimize_hair.py + meshopt_pack.mjs ─► models/hair/hair-curly-v41-opt.glb
Three.js : compare.js charge le personnage, attache la coiffure à l'os Head, masque les coques,
           pull gris uni sur le buste, rig.js anime ; bench_hair.js + diff_shots.py mesurent.
```

Commande exacte de la coiffure optimisée (reproduit le fichier à l'octet) :

```bash
cd games/qui-est-ce/prototype-3d
python tools/hair/optimize_hair.py models/hair/hair-curly-v41.glb build/opt/hair-curly-v41-q.glb \
  --drop-tangent --cull tools/hair/data/hair-curly-v41-vis.json --cull-least 0.20 --cull-views all \
  --tex-format png-la --quantize
node tools/hair/meshopt_pack.mjs build/opt/hair-curly-v41-q.glb models/hair/hair-curly-v41-opt.glb --v1
```

Les données brutes d'ICT-FaceKit (387 Mo, dépôt GitHub `USC-ICT/ICT-FaceKit`, dossier
`FaceXModel`) ne servent qu'à `prepare.py` ; `build-ict/ict.npz` en est la version compacte
versionnée. Le `git clone` du dépôt ICT avait échoué : télécharger fichier par fichier.

## Performances connues (mesurées, rien d'estimé)

Machine de référence : portable Windows 11, **Intel Iris Xe** (ANGLE D3D11), **sur secteur**
(sur batterie, Chrome plafonne à 30 FPS : ne jamais comparer dans ces conditions).

| Mesure | V4.1 originale | V4.1 optimisée |
| --- | --- | --- |
| Poids de la coiffure | 17 212 648 o (16,4 Mio) | **1 917 876 o (1,83 Mio)** |
| Poids personnage + coiffure | 32,2 Mio | 17,6 Mio |
| Triangles (scène / cheveux) | 252 711 / 192 000 | 214 311 / 153 600 |
| Draw calls par carte (passe d'ombre comprise) | 31 | 31 |
| Coût d'une image, banc 900 × 1200, ombres (médiane, 3 passes alternées) | 14,2 ms | 12,0 ms |
| Analyse du GLB au chargement | 25 ms | 15 ms |
| FPS en direct, une version seule | 60 (plafond vsync) | 60 (plafond vsync) |
| Écart visuel moyen sur les 6 états (pixels > 8 niveaux / SSIM) | — | 0,34 % / 0,995 |

- Deux cartes côte à côte (A/B) : 55-60 FPS (2026-10-08) puis 48 FPS mesurés le soir même
  dans une fenêtre plus grande (DPR 1,5, canevas 1924 × 964).
- Personnage seul : `test-proto.js` mesure 60 FPS, pire image 19 ms.
- Composition de `character-01-ict.glb` (16 514 692 o) mesurée le 2026-10-14 :
  **déformations des expressions 9,79 Mio (63 %, accessoires épars, float32, 424 cibles =
  8 primitives × 53)**, textures JPEG 1,87 Mio (12 %, dont 820 et 752 Ko), indices 0,95 Mio,
  poids de peau 0,66 Mio, positions 0,53, normales 0,53, UV 0,36, articulations 0,33,
  textures PNG 0,31, couleurs 0,18. Tête ICT 26 719 sommets + buste 6 179. Aucune
  extension glTF (ni quantification, ni compression). 13 matériaux, 7 images.

## Mesures cloud (2026-10-14, SwiftShader : poids et comptes valables, temps sans valeur)

| Mesure | Valeur |
| --- | --- |
| `character-01-ict-opt.glb` | 2,85 Mo (16,5 Mo à l'origine), mêmes nœuds, articulations, 53 expressions, matériaux |
| GLB chargés par le plateau (24 cartes, tous les accessoires) | 14,1 Mo |
| Plateau : géométries / textures / programmes | 42 / 256 / 27 |
| Accessoires | lunettes 159 et 62 Ko, barbe 2,23 Mo, moustache 0,72 Mo, barbe complète 2,87 Mo, casquette 91 Ko (+ coiffure dessous 390 Ko), créoles 14 Ko, perles 5 Ko |

**À mesurer sur le PC** (FPS au survol, repeinte des 24, mémoire GPU, chargement) :
`node games/qui-est-ce/prototype-3d/tools/measure_pc.js` → `reports/pc/résumé.md`.

## Prochaine étape

Suivre [PC_RUNBOOK.md](PC_RUNBOOK.md) : mesures GPU, partie en ligne à deux navigateurs,
photos des 23 personnages, fabrication (`build_character.py --all-ready`), puis brancher le
chargement par fiche dans `js/game/board3d.js` dès le deuxième personnage.

### Historique : lot « optimisation ICT » (fait dans le cloud, voir CLOUD_LOG.md)

**Lot « optimisation ICT »** : réduire `character-01-ict.glb` sans dégrader les yeux, les
paupières, les cils, la bouche, les dents, les gencives, la langue, les expressions, la
texture, le rig ni les animations. Pistes, par ordre de gain probable :

1. **Déformations des expressions (63 %)** : quantification 16 bits normalisée
   (`KHR_mesh_quantization`), puis meshopt ; comparer épars contre dense + meshopt.
2. **Données inutilisées** : coques de cheveux peintes (masquées par la V4.1) ; normales,
   tangentes ou UV non utilisés ; expressions jamais pilotées (29 sur 53 aujourd'hui :
   seulement en variante séparée, car de futures expressions peuvent en avoir besoin).
3. **Textures** : qualité JPEG, WebP (`EXT_texture_webp`), résolution des textures
   secondaires (dos du crâne, buste). Ne pas toucher à la netteté du visage ni des iris.
4. **Géométrie** : quantification des positions, normales, UV, poids et articulations.
5. **Compression meshopt v1** (le moteur charge déjà `MeshoptDecoder`).

Méthode obligatoire (celle des cheveux) : banc **avant**, une optimisation à la fois, banc
**après** chaque niveau (poids, triangles, draw calls, temps d'image, FPS), comparaison
visuelle pixel à pixel **et** planche, retour en arrière si une différence se voit. Zones
sensibles à mesurer à part : yeux (ouverts et fermés), bouche (sourire, surprise : dents
et langue visibles). Ne garder qu'une optimisation réellement acceptable. **Ne jamais
écraser** `character-01-ict.glb` : produire `character-01-ict-opt.glb` à côté.

## Règle importante

**Ne pas générer les 23 autres personnages** tant que `character-01` n'est pas jugé
suffisamment convaincant, optimisé et stable **par l'utilisateur**. Ensuite seulement :
architecture du système Qui est-ce ?, bibliothèque d'accessoires, génération des autres
personnages, assemblage des 24, optimisation globale, intégration au jeu complet.
Ne brûler aucune étape. Ne pas changer la direction artistique validée.

## Pièges connus

- `PCFSoftShadowMap` n'existe plus dans r186 : `PCFShadowMap`. `THREE.Clock` est
  déprécié : `THREE.Timer`.
- Le cou ICT descend jusqu'à la clavicule : il est coupé ~7 cm sous le menton.
- La texture Hunyuan des épaules est fausse (peau) : `compare.js` habille le buste d'un
  pull gris uni.
- Un onglet ou une fenêtre Chrome masqués suspendent l'animation : FPS = 0. Les mesures
  passent par une fenêtre lancée par `tools/cdp.js`, pas par un onglet de l'utilisateur.
- Avertissement D3D `X4122` dans la console sous Windows : connu, sans effet.
- Sans vrai GPU (machine cloud), le rendu passe par SwiftShader : images déterministes et
  comparables **entre elles**, mais les temps et FPS ne valent rien. Refaire les mesures de
  performance sur le PC de référence.
- Python sous Git Bash : écrire les correctifs dans des fichiers UTF-8 (les heredocs
  cassent les accents et les guillemets).

## Règles du dépôt (rappel, le fichier de notes local n'est pas versionné)

- Site statique sur GitHub Pages, **pousser sur `main` = mise en production**. Ce prototype
  vit sur `proto/qui-est-ce-3d`. Ne jamais fusionner dans `main` sans demande explicite.
- Ne toucher à aucun autre jeu, ni à Firebase, ni à Cloudflare.
- Commits : identité locale `git config user.name "philxvii"` et
  `git config user.email "116272977+philxvii@users.noreply.github.com"` ; message
  `feat(qui-est-ce): …` en français, minuscules, sans point final ; **aucun trailer, aucun
  co-auteur, aucun lien de session** (vérifier `git log -1 --format='%an <%ae>%n%B'`).
  Jamais `--force`, jamais de reset ou de rebase destructif.
- Jamais de secret, jeton, clé ou cookie dans git. Les fonctions d'IA doivent rester gratuites.
- `build/` et `build-ict/` sont ignorés sauf les intermédiaires listés plus haut. Les
  planches de validation vont dans `reports/<lot>/` (JPEG de moins de 600 Ko).

## Reprendre sur une nouvelle machine

Prérequis : Git, Python 3.11, Node 20+ (testé avec Node 24), Google Chrome.

```bash
# 1. Cloner la branche du prototype
git clone -b proto/qui-est-ce-3d https://github.com/philxvii/GameHub.git
cd GameHub
git config user.name "philxvii"
git config user.email "116272977+philxvii@users.noreply.github.com"

# 2. Dépendances du prototype
pip install -r games/qui-est-ce/prototype-3d/tools/requirements.txt
npm install --prefix games/qui-est-ce/prototype-3d/build/tools meshoptimizer

# 3. Lancer le prototype (laisser tourner), depuis la racine du dépôt
python -m http.server 4173
#   http://localhost:4173/games/qui-est-ce/prototype-3d/compare.html          (V4.1 originale / optimisée)
#   compare.html?set=<nom> lit models/hair/compare-<nom>.json (liste de coiffures à comparer)
#   http://localhost:4173/games/qui-est-ce/prototype-3d/                      (visionneuse, orbite)

# 4. Tests et bancs (autre terminal, depuis games/qui-est-ce/prototype-3d)
cd games/qui-est-ce/prototype-3d
node tools/test-proto.js                                   # rig : 15/15 attendu (60 FPS sur GPU)
node tools/hair/bench_hair.js models/hair/hair-curly-v41-opt.glb build/bench/opt
node tools/hair/bench_hair.js models/hair/hair-curly-v41.glb build/bench/orig
python tools/hair/diff_shots.py build/bench/orig build/bench/opt --sheet build/bench/opt-vs-orig.jpg
#   attendu : ~0,34 % de pixels > 8 niveaux, SSIM ~0,995 (machine avec GPU)

# 5. Vérifier les modèles (reconstruction à l'octet près)
python tools/character-ict/build_ict.py build/ict-check.glb       # ~30 s
python tools/hair/gen_cards.py hair-curly-v41                      # réécrit la source V4.1, à l'identique
md5sum build/ict-check.glb models/character-01-ict.glb             # identiques
git status --short                                                 # aucun modèle modifié

# 6. Continuer : lire CLOUD_LOG.md (où en est le cloud), puis le lot en cours de CLOUD_PLAN.md
```

Variables utiles : `CHROME_PATH` (chemin de Chrome si introuvable), `PROTO_ORIGIN` (serveur
du prototype, défaut `http://localhost:4173`), `CDP_PORT` (port de débogage, défaut 9222).
Sous Windows, les commandes ci-dessus tournent dans Git Bash.

Ce qui ne voyage **pas** avec git (à recopier à la main si besoin) : le fichier de notes
local `.claude/CLAUDE.md`, la mémoire de Claude Code, les données brutes ICT-FaceKit, les
essais écartés (`models/character-01.glb`, anciennes coiffures), `build/` (captures, bancs).
