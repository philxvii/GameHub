# Plan de travail de la session cloud (Claude Code sur le web)

Ce fichier est la **feuille de route de la session cloud**. Il complète
[HANDOFF.md](HANDOFF.md) (état, décisions, fichiers, pièges) : lis HANDOFF.md d'abord, en
entier, puis ce plan. Ne relis pas le reste du dépôt : tout ce qu'il faut est dans ces deux
fichiers et dans les scripts qu'ils citent.

Objectif : **faire avancer le plus loin possible le Qui est-ce ? 3D** avec un budget de
crédits limité (environ 100 $), sans jamais rien perdre, puis rendre la main au PC de
l'utilisateur (Windows, GPU Intel Iris Xe) quand le budget s'épuise.

---

## 0. Règles non négociables

1. **Branche `proto/qui-est-ce-3d` uniquement.** Jamais `main` (= production roulia.me),
   jamais de fusion, jamais `--force`, jamais de reset ou de rebase destructif. Si la
   plateforme impose sa propre branche (`claude/...`), crée-la depuis
   `proto/qui-est-ce-3d`, note son nom en tête de `CLOUD_LOG.md` et dis-le à l'utilisateur.
2. **Commit + push après chaque étape terminée** (pas seulement en fin de lot), avec la
   mise à jour de `CLOUD_LOG.md`. Les crédits peuvent s'arrêter à tout moment : le dernier
   push est l'état de reprise.
3. Identité et format des commits (le fichier de notes local n'est pas sur GitHub) :
   `git config user.name "philxvii"`,
   `git config user.email "116272977+philxvii@users.noreply.github.com"`, message
   `feat(qui-est-ce): …` en français, minuscules, sans point final, corps court.
   **Aucun trailer, aucun `Co-Authored-By`, aucun lien de session** : vérifie avec
   `git log -1 --format='%an <%ae>%n%B'` avant chaque push.
4. **Ne pas remplacer** le visage ICT, ni la coiffure V4.1 optimisée, ni changer la direction
   artistique. Ne jamais écraser un modèle validé : écrire les variantes à côté (`-opt`, `-vN`).
5. **Ne pas générer les 23 autres personnages.** De toute façon impossible ici : les photos
   de référence se génèrent avec Gemini dans le navigateur de l'utilisateur.
6. Ne toucher à aucun autre jeu, ni à `games/qui-est-ce/index.html` (jeu en production), ni
   à Firebase, ni à Cloudflare. Aucun secret dans git. IA gratuite uniquement.
7. **Points de validation** (marqués ⛔) : l'utilisateur juge sur une planche. Pose la
   question, puis continue les tâches qui ne dépendent pas de sa réponse ; ne valide jamais
   à sa place.

## 1. Économie de crédits

- Décide sur des **chiffres** (poids, écarts de pixels, SSIM), pas en regardant des images.
  Une image regardée coûte ~2 000 tokens : seulement pour une planche de validation, réduite
  (moins de 1 600 px de large).
- Filtre les sorties longues (`| tail -20`, `| head`) ; ne relis pas un fichier déjà lu.
- Modifie par script Python avec `assert s.count(old) == 1`, ou par édition ciblée.
- Un lot à la fois, dans l'ordre. Pas d'exploration hors du prototype.
- Planches et captures : JPEG dans `reports/<lot>/`, moins de 600 Ko chacune. Les PNG du
  banc restent dans `build/` (ignoré).

## 2. Suivi du budget et retour au PC

La session ne voit sans doute pas le solde de crédits. Procédure :

1. **Au démarrage**, demande à l'utilisateur le solde restant ; note-le dans `CLOUD_LOG.md`.
   Si `/cost` ou un équivalent existe, relève-le aussi.
2. **À la fin de chaque lot** (et au plus tard toutes les ~2 h de travail), commit + push,
   puis demande le solde, note-le et compare-le à l'enveloppe du lot.
3. **Seuil de retour : il reste environ 12 $** (ou l'utilisateur écrit « RETOUR ») → ne
   commence plus rien ; exécute le **lot R** (ci-dessous) puis arrête-toi.
4. Si un lot dépasse son enveloppe de plus de 50 %, arrête-le proprement (commit de ce qui
   tient), note pourquoi, passe au suivant ou au lot R.

Enveloppes indicatives (sur ~100 $) :

| Lot | Contenu | Enveloppe | Validation |
| --- | --- | --- | --- |
| L0 | Environnement et mesures de référence | 4 % | — |
| L1 | Optimisation du personnage ICT | 30 % | ⛔ G1 |
| L2 | Pipeline industrialisé + distribution des 24 personnages | 18 % | ⛔ G2 (distribution) |
| L3 | Plateau 3D de 24 cartes (architecture du jeu) | 20 % | ⛔ G3 |
| L4 | Accessoires et pilosité faciale | 16 % | ⛔ G4 (par élément) |
| R | Retour au PC | réserve ~12 % | — |

Ordre : L0 → L1 → (pendant l'attente de G1 : L2) → L3 → L4 → R. Si G1 n'est pas donné,
L3 et L4 travaillent sur `character-01-ict.glb` d'origine et restent des prototypes.

---

## L0 — Environnement et mesures de référence (≈ 4 %)

1. Dépendances :
   ```bash
   cd games/qui-est-ce/prototype-3d
   pip install -r tools/requirements.txt
   npm install --prefix build/tools meshoptimizer
   ```
2. Chrome sans affichage : utilise celui de la machine s'il existe, sinon
   `npx playwright install chromium` (ou `apt-get install chromium`). Exporte
   `CHROME_PATH=<chemin>`. Hors Windows, `bench_hair.js` et `test-proto.js` passent tout
   seuls en rendu logiciel SwiftShader.
3. Serveur : `python -m http.server 4173 &` depuis la **racine du dépôt**.
4. Contrôles de parité (prouvent que l'environnement reproduit le PC) :
   - `python tools/character-ict/build_ict.py build/ict-check.glb` puis
     `md5sum build/ict-check.glb models/character-01-ict.glb` → identiques ;
   - la commande de la coiffure optimisée de HANDOFF.md → `hair-curly-v41-opt.glb` identique.
   Si une version de bibliothèque diffère et casse l'égalité, note-le : ce n'est pas
   bloquant, mais toute comparaison se fera alors entre rendus du cloud.
5. `node tools/test-proto.js` : en SwiftShader le contrôle « Fluidité ≥ 50 FPS » peut
   échouer, c'est attendu ; tout le reste doit passer. Note le résultat.
6. Mesures de référence **cloud** :
   `node tools/hair/bench_hair.js models/hair/hair-curly-v41-opt.glb build/bench/cloud-ref`.
   Toute comparaison d'images se fait **entre rendus du cloud**, jamais contre des captures
   du PC.
7. Commit (`CLOUD_LOG.md` : environnement, versions, parité, références) + push.

## L1 — Optimisation du personnage ICT (≈ 30 %) ⛔ G1

But : `models/character-01-ict-opt.glb`, le plus léger possible **sans différence visible**,
avec un rig et des expressions identiques. Point de départ (mesuré, HANDOFF.md) : 16,5 Mo,
dont 63 % de déformations d'expressions en float32 éparses, 12 % de textures JPEG, aucune
compression.

**Outillage à construire d'abord**

1. `compare.js` : paramètre `?char=<glb>` (personnage chargé, défaut
   `models/character-01-ict.glb`) utilisable avec `?bench=`. Rien d'autre ne change.
2. `tools/character-ict/bench_character.js` (sur le modèle de `bench_hair.js`, avec la
   coiffure `hair-curly-v41-opt.glb` attachée) : les 6 états de jeu (neutre, sourire,
   méfiant, surpris, tête à gauche, tête à droite) + **yeux fermés** (forcer le
   clignement à l'arrêt) + **gros plans** (la caméra du banc recadrée sur les yeux, puis sur
   la bouche en sourire et en surprise). Mêmes poses à l'identique pour chaque fichier.
   Poids, triangles, draw calls, temps d'image, temps d'analyse du GLB.
3. `diff_shots.py` : zones séparées **yeux** et **bouche** en plus de la tête entière
   (paramètre de zone, sans casser l'usage actuel pour les cheveux).
4. Un optimiseur `tools/character-ict/optimize_character.py` (ou une généralisation de
   `optimize_hair.py`) et un `meshopt_pack.mjs` étendu : **plusieurs primitives, cibles de
   déformation (morph targets), accesseurs épars, peau (JOINTS/WEIGHTS)**. Vérifier que
   le GLB produit garde les mêmes noms de nœuds, d'os et de cibles (`rig.js` les détecte par
   nom) et le même ordre de cibles (`morphTargetDictionary`).

**Étapes à tester une par une** (cumulées, banc et écarts après chacune ; si un écart se
voit, revenir à l'étape précédente et le noter) :

| Étape | Idée |
| --- | --- |
| 1. Données inutilisées | coques de cheveux peintes (`hair`, masquées par la V4.1) ; attributs jamais lus (tangentes, COLOR_0 s'il ne sert pas, UV secondaires) |
| 2. Cibles d'expression | quantification 16 bits normalisée (`KHR_mesh_quantization`) ; épars contre dense + meshopt ; seuil des deltas négligeables |
| 3. Géométrie de base | positions 16 bits, normales 8 bits, UV 16 bits, poids 8 bits normalisés, articulations 8 bits |
| 4. Textures | qualité JPEG, WebP (`EXT_texture_webp`), résolution des textures secondaires (dos du crâne, buste) ; **visage et iris intacts** |
| 5. Compression | meshopt v1 (`EXT_meshopt_compression`, décodé par `MeshoptDecoder` déjà chargé) |
| 6. Variante séparée | sans les expressions jamais pilotées (29 / 53 aujourd'hui) : gain noté à part, **non retenue sans accord** |

Critère d'acceptation (le même que pour les cheveux, plus sévère sur les zones sensibles) :
moyenne des 6 états ≤ 0,35 % de pixels changés de plus de 8 niveaux et SSIM ≥ 0,995 ;
zones yeux et bouche : SSIM ≥ 0,995 et aucun défaut visible sur la planche. `test-proto.js`
doit donner les mêmes contrôles verts avec le fichier optimisé.

**Livrables** : `models/character-01-ict-opt.glb` ; les outils ; un tableau étape par étape
dans `CLOUD_LOG.md` (poids, triangles, draw calls, temps, écarts, décision) ;
`reports/ict-opt/planche.jpg` (original à gauche, optimisé à droite, 6 états + gros plans) ;
`models/hair/compare-ict-opt.json` et le mode de `compare.html` pour comparer les deux
personnages côte à côte.

⛔ **G1** : l'utilisateur valide le personnage optimisé sur la planche. Pas de bascule sans
son accord (il pourra aussi juger en direct sur son PC au retour).

## L2 — Pipeline industrialisé et distribution des 24 personnages (≈ 18 %) ⛔ G2

Aucun personnage n'est généré ici : on prépare tout pour que, de retour sur le PC, produire
un personnage soit une suite de commandes.

1. **Distribution des 24** : `data/roster.json`. 24 humains **fictifs**, variés en âge,
   genre et origines, avec une grille d'attributs pensée pour le jeu : chaque attribut
   binaire (lunettes, chapeau, barbe, moustache, chauve, cheveux longs, boucles d'oreilles,
   etc.) et chaque couleur (cheveux, yeux) coupe la grille en parts utiles (de 3 à 12
   personnages sur 24, aucun attribut sur un seul). Script de contrôle
   `tools/pipeline/check_roster.py` : équilibre, qu'aucune paire de personnages ne soit
   indiscernable, nombre moyen de questions pour isoler un personnage.
2. **Consignes photo** : `data/prompts/<id>.md` pour chaque personnage, sur le modèle des
   5 vues de `refs/` (face, 3/4 gauche, 3/4 droite, profils, même éclairage studio, fond
   uni, cadrage identique), à coller dans Gemini par l'utilisateur. Rédige-les à partir de
   ce que montrent les photos de `refs/mv/` (une seule image à regarder).
3. **Paramétrage par personnage** sans casser `character-01` : un argument `--id`
   (défaut `character-01`) pour `register.py`, `bake.py`, `fit.py`, `build_ict.py`,
   `gen_cards.py` ; arborescence `characters/<id>/refs/`, `build/<id>/`, `models/<id>/`.
   **Test de non-régression obligatoire** : sans argument, les sorties de `character-01`
   restent identiques à l'octet (md5).
4. **Orchestrateur** `tools/pipeline/build_character.py <id>` : enchaîne les étapes
   disponibles, s'arrête proprement à celles qui demandent le PC (photos, Space Hugging Face),
   puis bench + planche. Documente-le dans `tools/pipeline/README.md`.

⛔ **G2** : l'utilisateur valide la distribution des 24 (attributs, diversité) avant tout usage.

## L3 — Plateau 3D de 24 cartes (≈ 20 %) ⛔ G3

Prototype de l'architecture du jeu, **dans le dossier du prototype** (`board.html`,
`js/board.js`, `css/board.css`), sans toucher au jeu en production. Personnage 01 placé
24 fois en attendant les autres, avec les noms et attributs de `data/roster.json` si L2 est
fait.

- **Un seul `WebGLRenderer`**, une zone par carte (scissor), comme `compare.js`.
- GLB chargé une fois, cloné (`SkeletonUtils.clone`), géométries et textures partagées.
- **Rendu à la demande** : une carte au repos est rendue une fois puis rafraîchie
  rarement (respiration et clignement à basse fréquence, décalés d'une carte à l'autre) ;
  la carte survolée est animée à plein régime (regard, tête, expression).
- Interactions : survol = regard et tête vers le curseur ; clic = carte rabattue (animation)
  et personnage éliminé ; réactions aux évènements du jeu (question posée → méfiant, bonne
  réponse → sourire, fin → surpris) ; `prefers-reduced-motion` respecté ; clavier.
- Mise en page bureau (6 × 4) et mobile (pas de défilement horizontal à 390 px).
- Mesures : temps d'image avec 24 cartes, mémoire GPU (textures, géométries), temps de
  chargement. Test `tools/test-board.js` : chargement, 24 cartes, survol, rabat, console propre.
- Note pour le retour sur PC : les FPS réels se mesureront là-bas (SwiftShader ici).

⛔ **G3** : capture du plateau dans `reports/board/`, avis de l'utilisateur.

## L4 — Accessoires et pilosité faciale (≈ 16 %) ⛔ G4

Bibliothèque d'éléments attachés à l'os `Head`, au même niveau de réalisme que la V4.1,
chacun optimisé (meshopt) et mesuré :

- lunettes (2 montures : fine métal, épaisse acétate ; verres avec réfraction légère) ;
- casquette ou chapeau ;
- barbe courte et moustache en cartes de poils (méthode de `gen_cards.py`, zone menton et
  lèvre supérieure, racines sur le visage ICT) ;
- boucles d'oreilles simples.

Pour chacun : générateur dans `tools/accessories/`, GLB dans `models/accessories/`, planche
dans `reports/accessories/` (personnage 01 dans les 6 états, avec et sans l'élément).
Vérifier qu'aucun élément ne traverse le visage pendant les expressions (sourcils levés,
bouche ouverte). **Nouvelles coiffures : seulement des propositions sur planche**, jamais
attachées par défaut, et la V4.1 reste la coiffure du personnage 01.

⛔ **G4** : validation élément par élément. Un élément refusé reste dans le dépôt, marqué
refusé dans `CLOUD_LOG.md`.

## R — Retour au PC (réserve ≈ 12 %)

Déclenché par le seuil de budget ou le mot « RETOUR ».

1. Termine ou annule proprement l'étape en cours (aucun fichier à moitié modifié).
2. Mets à jour **HANDOFF.md** : « État actuel », « Ce qui est validé / refusé »,
   « Fichiers importants », « Performances connues » (en séparant mesures cloud et mesures
   PC), « Prochaine étape ».
3. Remplis la section « État au retour » de `CLOUD_LOG.md` : branche et dernier commit,
   lots terminés, validations obtenues et en attente, ce qui reste à mesurer sur le PC
   (FPS GPU, rendu réel), commandes exactes pour reprendre.
4. Commit `feat(qui-est-ce): passation du travail cloud` + push, vérifie
   `git status` (propre) et `git log -3 --oneline`, donne le hash à l'utilisateur.
5. Arrête-toi.

Au retour sur le PC, la session locale fera : `git fetch && git switch proto/qui-est-ce-3d
&& git pull`, lecture de `CLOUD_LOG.md`, mesures GPU (`test-proto.js`, bancs) sur l'Iris Xe,
validation en direct dans Chrome.
