# Mission 2 du cloud (2026-10-15) — 50 $ restants

Suite de la mission 1 (`FIN_DE_MISSION.md`). Même cadre que `CLOUD_PLAN.md` : **MODE AUTONOME**
(tu ne t'arrêtes pas pour demander, décisions réversibles dans `DECISIONS.md`, questions dans
`QUESTIONS.md`), **INTENTIONS DE L'UTILISATEUR** (qualité d'abord, PC d'abord, ton complice
et malicieux, option ambitieuse réversible, aucun son), limites dures inchangées (jamais
`main`, aucun déploiement, aucun secret, jeu en production et autres jeux intouchés).
Réserve de retour : ~8 $ pour écrire `FIN_DE_MISSION_2.md` et pousser.

## Ordre d'exécution

### M2-0 — BUG BLOQUANT à corriger en premier (~5 $)

Reproduit par l'utilisateur sur **GPU réel** (Chrome, Intel Iris Xe, 1440 × 900) sur
`prototype-3d/board.html` (et donc sur `v3d/`) : dès qu'une partie contre le bot est lancée,
**le portrait de « mon personnage » (celui du secret) est dessiné très grand, décalé à gauche,
par-dessus 5 à 6 cartes de la grille** ; l'infobulle de survol est aussi coupée par cette
tête. Capture : une grande tête rousse (le personnage secret choisi) recouvre les cartes
des colonnes 1 à 3. Les captures du cloud (SwiftShader) et `test-board.js` (12/12) ne l'ont
pas vu : ils ne comparent pas d'image.

Causes probables : une zone de rendu (viewport / scissor) du portrait ou du snapshot qui n'est
pas recalée sur sa case ; `drawImage` d'un canevas de largeur ou hauteur nulle
(`board3d.js` `snapshot`, erreur console vue sur `v3d/`) ; positions mesurées avant la
mise en page ou après défilement.

À faire :
1. Trouve la cause réelle (ne masque pas le symptôme) et corrige.
2. **Ajoute un test d'image** (`tools/test-board-pixels.js`) : au repos et au survol de chaque
   type de carte, comparer les pixels du plateau : **seule la case concernée peut changer,
   et seulement à l'intérieur de sa case** ; vérifier après défilement et redimensionnement
   (1280 × 720, 1440 × 900, 1920 × 1080). Le test doit **échouer** sur le code actuel puis
   passer après la correction (prouve-le dans `CLOUD_LOG.md`).
3. Refais les captures `reports/board/` après correction, et **regarde-les toi-même** (une
   capture de chaque écran) avant de les déclarer bonnes. Plus aucun « auto-validé » sans
   contrôle visuel de l'image.
4. Note aussi l'erreur `drawImage` ci-dessus et corrige-la.

### M2-1 — 23 visages vraiment différents, sans photos (~22 $)

But : que la grille ne soit plus 24 fois le même visage. **Sans photos Gemini** (elles viendront
plus tard sur le PC de l'utilisateur ; ces visages sont **provisoires mais crédibles**).

- `build-ict/ict.npz` contient les **100 formes d'identité** d'ICT-FaceKit (`ids`), le visage
  neutre (`neutral`) et les 53 expressions (`expr`). `fit.npz` donne les coefficients du
  personnage 01. Fabrique pour chaque personnage du roster (`data/roster.json`) un **visage
  distinct** en mélangeant les identités (coefficients tirés avec une graine par personnage,
  bornés pour rester plausibles, cohérents avec l'âge, le genre et la morphologie du roster).
- **Texture de peau** : dérive-la de la texture du personnage 01 (teint, rougeurs, taches,
  rides légères pour les seniors, barbe peinte absente), avec des **teints variés** crédibles
  (pas un simple filtre de couleur plat : conserve le grain, les pores, les variations de
  chaque zone). Couleur des iris variée (verts, bleus, marron, noisette), sourcils assortis.
- **Mêmes 53 expressions** (deltas ICT recalculés sur le nouveau visage), même squelette, même
  nommage : `rig.js` et le plateau doivent fonctionner **sans rien changer**.
- **Coiffure, accessoires et pilosité du roster** : applique-les par personnage avec les
  générateurs de L4 (couleur, longueur ; barbes et moustaches là où le roster en prévoit), en
  respectant ce qui est dit du roster (âge, gris pour les seniors, etc.). Une coiffure
  « courte lisse » et une « longue » sont à fabriquer si le roster les demande ; réutilise
  `gen_cards.py` (nouveaux styles, V4.1 inchangée pour le personnage 01).
- **Poids** : chaque personnage partage ce qui peut l'être (expressions en deltas communs,
  textures dérivées légères) ; vise ~2 à 3 Mo par personnage optimisé, aucun fichier > 4 Mo.
  Mesure le chargement des 24 sur le plateau.
- Pipeline : `tools/pipeline/make_variant.py <id>` (une commande par personnage, déterministe,
  reproductible à l'octet avec la graine) et `make_roster.py` (les 23). Statut `provisional`
  dans `roster.json` ; le personnage 01 reste le seul `validated`. Le chargement par fiche
  (`person.glb`) de `board3d.js` est branché pour de bon.
- **Contrôles de qualité chiffrés** (pas d'auto-validation à l'aveugle) : (a) aucun personnage
  ne ressemble trop à un autre (distance entre identités et entre rendus de face supérieure à
  un seuil que tu fixes et justifies) ; (b) aucune expression ne produit d'artefact (sommets
  hors de plage, dents qui sortent des lèvres, iris cachés) sur les 6 états ; (c) lecture des
  attributs (âge, genre, cheveux, yeux) à 120 px. Planche de contrôle `reports/roster/` : une
  image de **tous** les 24 en grille, que tu regardes toi-même ; corrige ce qui est laid avant de
  pousser. **Un visage laid ou dérangeant vaut moins qu'un visage commun : retire-le.**
- Si la qualité n'est pas au niveau du personnage 01 pour certains profils, **dis-le franchement**
  dans `FIN_DE_MISSION_2.md` (lesquels, pourquoi) plutôt que de livrer sans le dire.

### M2-2 — Chapeau et coiffures longues (~8 $)

- Chapeau de feutre (en plus de la casquette) : même exigence que les autres accessoires
  (aucun sommet dans la tête sur 5 expressions extrêmes, lisible à 120 px, coiffure dessous).
- Coiffures longues et mi-longues : règle **« dégager le visage »** (raie, mèches rejetées
  derrière l'oreille ou sur l'épaule) pour qu'aucune mèche ne tombe sur les yeux ou la bouche ;
  vérifie sur les 6 états et les gros plans yeux / bouche. Nettoie aussi les arêtes et mèches
  mal raccordées près de l'oreille vues de profil sous la casquette.

### M2-3 — Finitions du jeu (~7 $)

Animation de rabat des cartes soignée (ton complice et malicieux), réactions des personnages
liées aux évènements (jamais au secret), écran de fin et révélation peaufinés, planche contact
partageable, titres et succès, messages du bot. Chaque finition est vérifiée **à l'image**.

## Fin

Commit + push après chaque étape. Écris `FIN_DE_MISSION_2.md` (fait / en autonomie / à faire
sur le PC / cinq points douteux / questions), mets `PC_RUNBOOK.md` à jour, puis un seul message
final court avec le lien et les captures clés (la grille des 24 en premier).
