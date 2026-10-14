# Journal de la session cloud

Tenu par la session Claude Code sur le web (voir [CLOUD_PLAN.md](CLOUD_PLAN.md)).
Une entrée par étape terminée, poussée avec son commit.

## Branche et budget

- Branche de travail : `proto/qui-est-ce-3d`
- Point de départ : commit du checkpoint du 2026-10-14 (PC de l'utilisateur)

| Date | Moment | Solde annoncé | Remarque |
| --- | --- | --- | --- |
| 2026-10-14 | démarrage (L0) | 100 $ | `/cost` indisponible dans la session web |
| 2026-10-14 | après DA (choix B) | 84 $ | |
| 2026-10-14 | mode autonome, avant L4 | 78 $ | enveloppes restantes : L4 ≈ 15 $, L3 ≈ 17 $, L5 ≈ 14 $, L6 ≈ 7 $, R ≈ 12 $ |

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

### Étapes mesurées au banc d'images (cloud, SwiftShader, 2026-10-14)

Référence `build/bench/ict-ref` (personnage d'origine + V4.1 optimisée). Rendu déterministe :
deux bancs de la référence sont identiques au pixel. Zones yeux et bouche recalées sur les
yeux et la bouche (le premier calage centrait la « bouche » sur le nez). Écarts : pixels
changés de plus de 8 niveaux (p8) et SSIM ; « pire » = zone ou gros plan le plus touché.

| Étape (cumulée) | Poids | 6 états p8 / SSIM | Yeux (pire) | Bouche (pire) | Gros plans (pire) | Décision |
| --- | --- | --- | --- | --- | --- | --- |
| 1. coques retirées | 15 054 836 o | 0 % / 1,0000 | identique | identique | identique | gardée |
| 2. positions + expressions 16 bits | 11 466 532 o | 0,01 % / 0,9998 | 0,9992 | 0,9986 | 0,9986 | gardée |
| 3. + normales 8 bits, UV 16 bits | 11 119 804 o | 0,01 % / 0,9997 | 0,9991 | 0,9985 | 0,9987 | gardée |
| 4. + textures buste ½ et crâne ½ (JPEG 85) | 10 360 156 o | 0,02 % / 0,9997 | 0,9991 | 0,9985 | 0,9971 (0,4 % px, bouche surprise) | crâne écarté : il couvre aussi le cou |
| **4c. + texture du buste seule ½ (jamais affichée : pull uni)** | — | — | — | — | — | **gardée** |
| **5. + meshopt (`-cc`) = candidat** | **2 849 336 o** | **0,01 % / 0,9996** | **0,9987 (0,09 % px)** | **0,9986** | **0,9984** | **candidat G1** |
| 5 avec crâne ½ | 2 682 308 o | 0,02 % / 0,9996 | 0,9987 | 0,9986 | 0,9978 (0,15 % px) | écartée (−167 Ko seulement) |
| 3b. variante 14 bits | 10 565 404 o (non compressé) | 0,03 % / 0,9995 | 0,9983 | 0,9972 | 0,9974 | écartée (écart double pour un gain faible) |
| 6. variante sans 23 expressions non pilotées | 2 159 268 o | 0,02 % / 0,9996 | 0,9986 | 0,9987 | 0,9978 | **non retenue sans accord** (−0,69 Mo) |

Candidat : `models/character-01-ict-opt.glb` (md5 `1c165146ebb553b7b6557c13e38eee2e`), **−82,7 %**,
reproductible :
`python tools/character-ict/optimize_character.py models/character-01-ict.glb models/character-01-ict-opt.glb --drop-shells --tex body=jpeg:85@0.5 --pack "-vp 16 -vt 16 -cc"`.
Mêmes 214 311 triangles et 31 draw calls par carte (les coques étaient déjà masquées), analyse
du GLB plus rapide en cloud (~155 ms contre ~280 ms). `test-proto.js` sur le candidat : 13/15,
mêmes deux échecs SwiftShader que l'original, 29/29 expressions pilotées. Critères du plan
tenus (≤ 0,35 % et SSIM ≥ 0,995 partout). Planche : `reports/ict-opt/planche.jpg` (original,
optimisé, écart ×4). Comparaison en direct : `compare.html?set=ict-opt`. L'orchestrateur
utilise cette recette.

⛔ **G1** en attente : l'utilisateur juge la planche (et en direct sur le PC). Aucune bascule.

## L2 — pipeline et distribution des 24

| Livrable | État |
| --- | --- |
| `data/roster.json` | 24 personnages fictifs : 12 femmes, 12 hommes ; 8 jeunes, 10 adultes, 6 seniors ; origines variées (dans `apparence`, jamais une question de jeu). `character-01` = Raphaël |
| `tools/pipeline/check_roster.py` | OK : chaque réponse concerne 3 à 12 personnages (min. 3 : roux, gris, chauve ; max. 12 : yeux marron, genre) ; aucune paire indiscernable ; **4,67 questions en moyenne** avec la meilleure question à chaque tour (minimum théorique 4,58), 5,38 au hasard parmi les questions utiles. Seule paire proche : Farid / Kenji (2 réponses d'écart) |
| `data/prompts/<id>.md` (24) | générés par `make_prompts.py` : 5 consignes Gemini par personnage sur le modèle de `refs/` (fond gris clair, lumière douce, pull anthracite, bouche fermée, sans accessoire) ; « gauche » = visage tourné vers la gauche de l'image, comme `refs/` |
| `--id` sur `register.py`, `bake.py`, `fit.py`, `build_ict.py`, `gen_cards.py` | via `tools/pipeline/paths.py` ; `characters/<id>/refs/`, `build/<id>/`, `models/<id>/` |
| Non-régression | sans `--id` : `register` + `bake` + `fit` donnent les mêmes 20 fichiers (md5) qu'avant la modification ; `build_ict.py` → `a66f9c28…` (identique au modèle versionné) ; `gen_cards.py hair-curly-v41` → source V4.1 inchangée |
| `tools/pipeline/build_character.py` + `README.md` | testé de bout en bout avec un personnage jetable (photos et forme de `character-01` copiées sous `character-02`, puis supprimées) : arrêts propres aux photos, à Hunyuan et à la coiffure ; `register` → `build_ict` → `gen_cards` → `optimize` passent (3 min 20) |

### Écart de 6,5° de register / bake / fit : cause (2026-10-14)

**Ce n'est pas du hasard, et il n'y a pas de graine à fixer.** Aucun appel aléatoire dans
les trois scripts ; le k-means interne de `cv2.grabCut` utilise le générateur d'OpenCV à
graine fixe ; deux exécutions cloud donnent les mêmes 20 fichiers à l'octet près.

**C'est l'environnement, amplifié par une recherche mal conditionnée :**

1. Le maillage est identique PC / cloud : les 44 893 sommets du buste de `textured.npz`
   versionné (PC) et cloud coïncident à 0,0 près (remaillage voxel, marching cubes,
   simplification : mêmes résultats). Le décodage JPEG aussi (cv2 / PIL : 0 pixel différent).
2. L'écart naît dans l'analyse des photos : masque `grabCut` (OpenCV) pour la silhouette, et
   repères MediaPipe (XNNPACK) pour les trois-quarts, que `bake.py` recale sur ±35°. Ces deux
   calculs en virgule flottante varient d'une machine à l'autre (jeu d'instructions, build).
   Indice du même ordre : xatlas donne 49 251 sommets d'UV sur le PC, 49 321 dans le cloud,
   pour le même maillage.
3. L'objectif du recalage est plat : avec le masque cloud, ±2° de lacet sur la vue de face
   ne changent l'IoU que de 0,03 % à 0,4 %, et les paramètres du PC y obtiennent même une IoU
   un peu meilleure (0,968) que l'optimum trouvé par la descente cloud (0,964). La descente
   par coordonnées s'arrête donc là où la pousse un écart infime en amont : plusieurs degrés.

Conséquences : `character-01` garde ses intermédiaires versionnés (rien ne change). Pour les
autres personnages, **produire toute la chaîne register → bake → fit → build_ict sur une seule
machine (le PC) et versionner ses intermédiaires**, comme pour `character-01` ; ne jamais
mélanger des étapes faites sur deux machines. Piste d'amélioration (non faite) : rendre le
recalage moins sensible (grille globale fine en lacet avant la descente, ou recalage par
repères sur toutes les vues).

Contrôle à faire sur le PC (localise la première étape qui diverge) : relancer
`register.py` puis comparer à ces empreintes cloud.

| Fichier | md5 cloud |
| --- | --- |
| `build/mesh.npz` | `099b145fcc03351bb3fe27449b9da65a` |
| `build/masks/front.png` | `b1d1c02250f11d58f87d19e49e6f581f` |
| `build/masks/three-quarter-left.png` | `846c1604e928dc78dbc8e65840e9a909` |
| `build/masks/three-quarter-right.png` | `9e33e219cf800ce8a79652b433e95700` |
| `build/masks/profile-left.png` | `df9b47bdf1cca73f268ae08204a4b068` |
| `build/masks/profile-right.png` | `6b03faab488b70a37226e1e0d149cd8a` |

Constat initial : `register.py`, `bake.py`, `fit.py` sont déterministes mais ne redonnent pas les
intermédiaires versionnés de `character-01` (jusqu'à 6,5° de lacet d'écart dans
`registration.json`) ; ceux-ci viennent d'un état antérieur des scripts. Les intermédiaires
versionnés restent la référence de `character-01` ; ils ont été restaurés après les essais.

G2 : décision déléguée par l'utilisateur le 2026-10-14 ; distribution retenue telle quelle.

## Rendu dans le cloud (débloqué le 2026-10-14)

Option choisie par l'utilisateur : servir Three.js depuis npm pour les tests. `tools/local-cdn.js`
intercepte dans le navigateur de test (CDP `Fetch`) les requêtes vers
`cdn.jsdelivr.net/npm/three@0.186.1/` et Google Fonts, et répond avec les mêmes fichiers tirés
de npm (`three@0.186.1`, paquets `@fontsource`, installés dans `build/tools`). Actif seulement
avec `THREE_LOCAL=1` ; les pages ne changent pas, et sur le PC rien n'est intercepté.
`test-proto.js`, `bench_hair.js`, `bench_character.js`, `da_shots.js` l'appellent.

Commandes cloud : serveur `python3 -m http.server 4173` à la racine, puis
`CHROME_PATH=<chrome avec --no-sandbox> THREE_LOCAL=1 node …`. Les bancs prennent `--no-time` :
sous SwiftShader une image coûte ~0,6 s et la boucle de mesure dépassait le délai de 60 s
de `cdp.js` (et ces temps ne valent rien).

`test-proto.js` en SwiftShader : **13/15**. Échecs attendus : « Fluidité ≥ 50 FPS » (2 FPS) et
« Clignements » (à ~600 ms par image, les clignements de 250 ms tombent entre deux images).
Tout le reste est vert : squelette, yeux, 29/29 expressions pilotées, regard puis tête, buste,
respiration, expressions, console propre.

Références cloud : `build/bench/cloud-ref` (coiffure V4.1 optimisée, 31 draw calls,
214 311 triangles) et `build/bench/ict-ref` (personnage d'origine).

## DA — directions artistiques

`da.html` (+ `css/da.css`, `js/da.js`, `js/da-sfx.js`) : trois directions côte à côte, chacune
avec sa carte 3D vivante du personnage 01 (regard vers le curseur, élimination au clic,
victoire), une question, un extrait de plateau de 6 cartes (6 poses rendues), sa palette avec
contrastes WCAG calculés sur la page, ses polices, ses notes de matières, de mise en scène,
de mouvement (les sons ne sont que des intentions : aucun son dans cette mission). Captures : `reports/da/` (bureau et 390 px).
Contrôles : console propre, pas de défilement horizontal à 390 px. `?still` fige le rendu.

| Direction | Métaphore | Polices | Signature |
| --- | --- | --- | --- |
| A · Le dossier | fichier de police des années 60 : question = interrogatoire, élimination = tampon violet « Écarté » | Zilla Slab + Courier Prime | toise au mur, flash dur, fiche anthropométrique |
| B · La séance de casting | Polaroïds scotchés au mur, planche contact ; élimination = croix au crayon gras | Permanent Marker + DM Mono | fond papier, flash au survol, film perforé |
| C · Le salon des portraits | portraits accrochés avec cartel ; élimination = tableau décroché ; victoire = pastille rouge | Cormorant Garamond + Libre Franklin | cimaise rouge, cadre doré en aplats, lampe de tableau |

Recommandation : **C**. C'est la seule des trois qui fait de la 3D la pièce maîtresse (un
portrait éclairé comme une œuvre), et elle ne se confond pas avec Banqueroll. A est la
métaphore de jeu la plus forte, mais ses fiches crème à l'encre rappellent les fiches de
Banqueroll. B est la plus légère. Constat de mise en scène valable pour L3 : le buste Hunyuan
n'est qu'une bande sous le cou au bord déchiré ; le bas du cadre doit rester au-dessus
(`bottom = min.y + 0,095` dans `da.js`).

⛔ **G-DA** en attente : choix (ou mélange) de l'utilisateur.

## DA — déclinaison multijoueur (point 6), direction retenue

Direction retenue par l'utilisateur : B « casting » + révélation finale du salon + revanche
en un clic. `css/tokens.css` porte désormais ses jetons (casting, plus ceux de la révélation).
`partie.html` (+ `css/partie.css`, `js/partie.js`) : les 11 écrans d'une partie à deux —
accueil (créer / rejoindre), salon d'attente avec le code, choix du secret, mon tour (question),
tour de l'adversaire (je réponds oui / non), attente, cartes écartées des deux côtés (ma
planche de Polaroïds, sa planche contact), désignation, désignation ratée, fin (révélation des
deux secrets dans des cadres dorés, lampe qui s'allume, pastille rouge, score des revanches,
« Revanche » en un clic, planche contact partageable), adversaire déconnecté.
Lecture du tour sans texte : voyant de tournage rouge allumé et Polaroïd soulevé pour le joueur
actif, l'autre pâlit ; barre d'action en film noir quand c'est à moi, en papier sinon.
Mobile : barre d'action collée en bas, « mon personnage » en bandeau en haut, plateau en
4 colonnes, Oui / Non en deux grandes cibles. Portraits rendus une fois (6 poses casting,
2 poses salon) puis réutilisés en images : ces maquettes n'animent pas 24 visages.
Captures (`tools/partie_shots.js`) : 22 (bureau page entière, mobile 390 × 844), console
propre, aucun défilement horizontal. `reports/da/partie/` (une par écran) et deux planches
d'ensemble `reports/da/partie-mobile.jpg`, `reports/da/partie-bureau.jpg`, reprises dans
`da.html` (section « Partie à deux »).

⛔ En attente : validation de la déclinaison multijoueur par l'utilisateur, avant le plateau.

## L3 — plateau (en cours, avant la déclinaison multijoueur)

Première version solo, à transformer en partie à deux contre un bot (`net-mock.js`,
`bot.js`) une fois la déclinaison multijoueur de la DA validée : `board.html`, `js/board.js`,
`css/board.css` (écrit avec les jetons du salon : à refaire en casting avec la partie à deux ;
en l'état il s'affiche mal avec les nouveaux jetons), `css/tokens.css`,
`js/staging.js` (mise en scène partagée avec `da.html`), `tools/test-board.js`.
Architecture : un seul `WebGLRenderer` sur un canevas posé sur le plateau (il défile avec la
page), une scène partagée (un mur, une carte d'ombre 1024², seul le personnage peint est
visible), pixels conservés (`preserveDrawingBuffer`) : seules les cartes qui changent sont
repeintes (survol à chaque image, repos ~1 fois par seconde, plein régime pendant un
clignement ou un changement d'expression). Carte écartée : sa dernière image devient une
`<img>` animée en CSS. Cadrage commun calculé sur le personnage habillé (V4.1) sans les
coques : même cadre pour l'original et l'optimisé.
Cloud (SwiftShader) : 24 cartes peintes en 3,2 s ; `test-board.js` 7/8 : chargement,
24 cartes, survol (yeux puis tête), poses de repos, clic, clavier, question du bot ; la
mesure de repeinte dépasse le délai de 60 s de `cdp.js` en rendu logiciel (à refaire sur le PC).
Mémoire GPU : 28 géométries, 235 textures (dont surtout les textures d'os des 24 squelettes),
23 programmes.

## L4 — accessoires et pilosité (en cours)

Outils : `tools/accessories/head.py` (peau skin + scalp, 53 expressions de la peau, yeux,
nez, arête du nez par lancer de rayon, oreilles ; test intérieur / extérieur par parité de
rayons sur 3 directions, vote majoritaire — la distance signée au sommet le plus proche est
fausse près des structures fines comme l'helix), `common.py` (balayage de profil, triangles
réorientés selon leurs normales, GLB PBR + extensions, gltfpack `-vp 16 -vt 14 -cc`),
`sheet.py` (planche sans / avec + rangée « carte 120 px »). `compare.js` : `?acc=a.glb,b.glb`
(rattachés à l'os Head comme la coiffure, avant la création du rig) ; banc :
`bench_character.js … --acc`.

| Élément | Fichier | Poids | Triangles | Dégagement (5 expressions extrêmes) | Décision |
| --- | --- | --- | --- | --- | --- |
| Lunettes acétate écaille | `models/accessories/glasses-acetate.glb` | 158 588 o | 24 760 | 0 sommet dans la tête ; ≥ 0,52 mm de la peau ; ≥ 3,4 mm des cils | auto-validé |
| Lunettes métal fin noir mat | `models/accessories/glasses-metal.glb` | 62 092 o | 14 696 | 0 sommet dans la tête ; ≥ 0,34 mm ; ≥ 2,7 mm des cils | auto-validé |

Ajustement au visage : verres à ~1,2 cm de la cornée, monture cambrée (galbe) et inclinée
(pantoscopique 8-9°), pont posé sur l'arête du nez, découpe nasale (le nez de ce personnage
penche de 3,5 mm à droite), branches à 4 mm de la tempe, par-dessus l'helix puis derrière
l'oreille. Verres antireflet (alpha 0,035, IOR 1,5). Corrections faites en route : branches
qui traversaient l'oreille, coin nasal dans le nez, verres laiteux, monture dorée illisible à
120 px (remplacée par du noir mat), pont vu de l'intérieur (enroulement des triangles).
Planche : `reports/accessories/lunettes.jpg` (sans / acétate / métal, 10 états, taille carte).

Pilosité faciale (`tools/accessories/beard.py`) : cartes de poils enracinées sur la peau ICT
(régions tirées du visage : bouche, lèvres laissées nues avec une ellipse asymétrique, base
du nez, ligne de joue nez → lobe), peignées vers le bas (moustache : vers le bas et
l'extérieur), maintenues à 0,6-1,8 mm de la peau. **Chaque carte suit les expressions** :
deltas de sa racine copiés de la peau (3 sommets les plus proches) pour les expressions
pilotées par le jeu qui déplacent la zone d'au moins 1 mm ; `rig.js` les pilote seul. La
mâchoire suit l'os Head à 100 % (vérifié) : pas de décalage sous le menton.

| Élément | Fichier | Poids | Cartes / triangles | Expressions copiées | Corps des poils dans la peau |
| --- | --- | --- | --- | --- | --- |
| Barbe courte | `models/accessories/beard.glb` | 2 226 160 o | 9 500 / 57 000 | 14 | 0 au neutre ; quelques pointes au sourire et à la surprise extrêmes (≤ 3 points sur un échantillon de 23) |
| Moustache | `models/accessories/moustache.glb` | 723 508 o | 2 600 / 20 800 | 12 | 0 |
| Barbe + moustache | `models/accessories/full.glb` | 2 865 808 o | 12 100 / 77 800 | 14 + 12 | comme la barbe |

Itérations : barre noire (trop dense, trop sombre, bande trop basse) → presque invisible
(trop fin) → densité moyenne brune, lisible en gros plan comme à 120 px. Poids : les
expressions copiées par sommet dominent (positions en 12 bits, 0,03 mm) ; mémoire GPU des
cibles ≈ 20 Mo pour barbe + moustache, chargée une fois et partagée par toutes les cartes qui la
portent. Planche : `reports/accessories/barbe-moustache.jpg`.

Casquette (`tools/accessories/hat.py`) : six panneaux en coton rouge brique (coutures et
surpiqûres dans la texture, reflet de tissu `KHR_materials_sheen`), bandeau roulé, visière
galbée au dessous vert-gris, bouton. Premier essai écarté : une calotte qui suivait
l'enveloppe des boucles donnait un sac bosselé. Retenu : un dôme lisse ajusté au crâne +
1,1 cm de cheveux tassés, et une **coiffure « sous casquette »** dérivée de la V4.1 par la
même chaîne d'optimisation (`optimize_hair.py --keep-mask`, option ajoutée ; sans elle la
V4.1 optimisée reste identique à l'octet, vérifié) : 1 265 cartes sur 8 000 gardées sous le
bandeau, aucune ne traverse la calotte. 0 sommet de la casquette dans la tête pour les
5 expressions. `models/accessories/cap.glb` 90 872 o (12 860 triangles),
`models/accessories/cap-hair-curly-v41.glb` 390 112 o. Banc : `bench_character.js --hair`.
Planche : `reports/accessories/casquette.jpg`.

## Validations de l'utilisateur

| Point | Date | Décision |
| --- | --- | --- |
| G1 personnage optimisé | | |
| G2 distribution des 24 | 2026-10-14 | déléguée par l'utilisateur (« fais ce que tu veux ») : distribution retenue telle quelle |
| G-DA direction artistique | 2026-10-14 | B « casting » + révélation finale de C + revanche en un clic ; déclinaison multijoueur à valider |
| G3 plateau | | |
| G4 accessoires | | |

## État au retour

À remplir par le lot R : branche, dernier commit, lots terminés, validations en attente,
mesures à refaire sur le PC (GPU), commandes de reprise.
