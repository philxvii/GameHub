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

## L2 — pipeline et distribution des 24

| Livrable | État |
| --- | --- |
| `data/roster.json` | 24 personnages fictifs : 12 femmes, 12 hommes ; 8 jeunes, 10 adultes, 6 seniors ; origines variées (dans `apparence`, jamais une question de jeu). `character-01` = Raphaël |
| `tools/pipeline/check_roster.py` | OK : chaque réponse concerne 3 à 12 personnages (min. 3 : roux, gris, chauve ; max. 12 : yeux marron, genre) ; aucune paire indiscernable ; **4,67 questions en moyenne** avec la meilleure question à chaque tour (minimum théorique 4,58), 5,38 au hasard parmi les questions utiles. Seule paire proche : Farid / Kenji (2 réponses d'écart) |
| `data/prompts/<id>.md` (24) | générés par `make_prompts.py` : 5 consignes Gemini par personnage sur le modèle de `refs/` (fond gris clair, lumière douce, pull anthracite, bouche fermée, sans accessoire) ; « gauche » = visage tourné vers la gauche de l'image, comme `refs/` |
| `--id` sur `register.py`, `bake.py`, `fit.py`, `build_ict.py`, `gen_cards.py` | via `tools/pipeline/paths.py` ; `characters/<id>/refs/`, `build/<id>/`, `models/<id>/` |
| Non-régression | sans `--id` : `register` + `bake` + `fit` donnent les mêmes 20 fichiers (md5) qu'avant la modification ; `build_ict.py` → `a66f9c28…` (identique au modèle versionné) ; `gen_cards.py hair-curly-v41` → source V4.1 inchangée |
| `tools/pipeline/build_character.py` + `README.md` | testé de bout en bout avec un personnage jetable (photos et forme de `character-01` copiées sous `character-02`, puis supprimées) : arrêts propres aux photos, à Hunyuan et à la coiffure ; `register` → `build_ict` → `gen_cards` → `optimize` passent (3 min 20) |

Constat : `register.py`, `bake.py`, `fit.py` sont déterministes mais ne redonnent pas les
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
de mouvement et de son (Web Audio synthétisé). Captures : `reports/da/` (bureau et 390 px).
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

## Validations de l'utilisateur

| Point | Date | Décision |
| --- | --- | --- |
| G1 personnage optimisé | | |
| G2 distribution des 24 | 2026-10-14 | déléguée par l'utilisateur (« fais ce que tu veux ») : distribution retenue telle quelle |
| G-DA direction artistique | | |
| G3 plateau | | |
| G4 accessoires | | |

## État au retour

À remplir par le lot R : branche, dernier commit, lots terminés, validations en attente,
mesures à refaire sur le PC (GPU), commandes de reprise.
