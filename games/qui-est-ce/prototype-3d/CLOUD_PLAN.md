# Plan de travail de la session cloud (Claude Code sur le web)

Ce fichier est la **feuille de route de la session cloud**. Il complète
[HANDOFF.md](HANDOFF.md) (état, décisions, fichiers, pièges) : lis HANDOFF.md d'abord, en
entier, puis ce plan. Ne relis pas le reste du dépôt : tout ce qu'il faut est dans ces deux
fichiers et dans les scripts qu'ils citent.

Objectif : **faire avancer le plus loin possible le Qui est-ce ? 3D** avec un budget de
crédits limité (environ 100 $), sans jamais rien perdre, puis rendre la main au PC de
l'utilisateur (Windows, GPU Intel Iris Xe) quand le budget s'épuise.

---

## INTENTIONS DE L'UTILISATEUR (2026-10-14) — elles priment sur tout le reste du plan

Réponses explicites de l'utilisateur ; en cas de contradiction avec une phrase plus bas, ce
bloc gagne. C'est ta boussole quand tu dois décider seul.

1. **Priorité si le budget ne suffit pas : LA QUALITÉ DU PERSONNAGE.** Ordre d'importance :
   (1) personnage 01 optimisé sans perte visible (L1) et accessoires / pilosité crédibles (L4),
   (2) identité visuelle (DA), (3) plateau jouable (L3), (4) partie en ligne (L5), (5) dossier PC.
   Ne bâcle jamais L1 ni L4 pour gagner du temps sur L5.
2. **Le jeu se joue sur ORDINATEUR.** Le but du site est le jeu sur PC. Conçois, mesure et
   optimise pour le PC (grand écran, souris : le survol et le regard qui suit le curseur sont
   le cœur de l'expérience). Le mobile n'est **pas** une cible de conception : il doit
   seulement ne pas casser (pas de défilement horizontal, partie jouable au toucher), sans
   dégrader la version PC pour lui. Là où le plan parle de « mobile d'abord », lis
   « PC d'abord ». Mesures de performance : PC.
3. **Ton : complice et malicieux.** Clins d'œil, petites piques entre joueurs, humour léger ;
   ni solennel ni enfantin. Vaut pour les textes, les noms de boutons, les messages de
   victoire et de défaite, les bruitages et les animations. Jamais raciste, homophobe,
   sexiste, validiste ni humiliant pour un physique : on se moque de la situation, pas des
   personnes.
4. **En cas d'hésitation : l'option la plus AMBITIEUSE**, à condition qu'elle reste
   réversible (variante à côté de l'original, décision notée dans `DECISIONS.md`). Vise le
   niveau d'un jeu premium, pas d'un prototype : soin des matières, du mouvement, du son, des
   micro-interactions. Une option ambitieuse qui casserait une limite dure (voir MODE
   AUTONOME) reste interdite.
5. **Rendre un travail fini plutôt que large** : mieux vaut un lot de plus abouti que deux
   lots à moitié faits ; en cas de doute, approfondis le lot en cours et note le reste dans
   `QUESTIONS.md`.

6. **Modes de jeu** : **duel classique à deux** et **partie contre un bot** (pour jouer seul).
   Le mode **3 à 6 joueurs est pour plus tard et n'est pas une priorité du tout** : ne rien
   construire pour lui, ne pas contraindre l'architecture (un état de partie par code suffit).
   Pas de « défi du jour » dans cette mission.
7. **Fidélisation à préparer** (tout) : revanche en un clic avec score entre les deux joueurs ;
   **statistiques entre amis** (victoires, nombre moyen de questions, personnage favori) ;
   **planche contact partageable** (image de fin de partie avec les croix rouges, export PNG) ;
   **titres et succès** malicieux (par exemple « Le Sherlock », « Gagné en 4 questions »).
   **Stockage : local au navigateur** (`localStorage`, comme le carnet de Banqueroll), sans
   compte ni Firebase ; interface pensée pour pouvoir passer sur Firebase plus tard.
8. **Personnages très expressifs** : ils sourient, froncent, se méfient, sont surpris et
   suivent le curseur. Garde-fou : les réactions sont liées aux **évènements du jeu** (question
   posée, réponse, carte écartée), jamais à l'identité du personnage secret, pour ne donner
   aucun indice.
9. **Son : AUCUN dans cette mission.** Ne pas produire de bruitages. Les descriptions de sons
   des fiches de la DA restent des intentions ; prévois seulement des points d'accroche
   neutres dans le code (`emit('event')`), sans audio.
10. **Accessoires, tous à faire avec le plus grand soin** (ordre de réalisation) : lunettes,
    barbe et moustache en poils, chapeau ou casquette, boucles d'oreilles et bijoux. Ils servent
    aussi de critères de jeu : ils doivent se lire au premier coup d'œil à la taille d'une carte.
11. **Coiffures supplémentaires : propositions sur planche** (3 à 5 : courte, longue, ondulée,
    rasée…), jamais attachées au personnage 01 ; la V4.1 reste sa coiffure.
12. **Fin de partie : cérémonie de révélation** (le portrait du secret accroché sous la lampe,
    la pastille posée, le perdant voit ce qu'il cherchait), pas un simple écran de résultat.

## MODE AUTONOME (décision de l'utilisateur, 2026-10-14) — LIS CECI EN PREMIER

**L'utilisateur donne carte blanche. Tu ne t'arrêtes pas pour demander.** Ce paragraphe
l'emporte sur tout ce qui suit qui dirait « attends sa réponse », « pose la question » ou
« ⛔ validation » : les points ⛔ (G1, G3, G4, G5, déclinaison multijoueur de la DA) ne sont
**plus bloquants**.

1. **Enchaîne tous les lots sans interruption** : L1 → L2 → DA (déclinaison) → L3 → L5 →
   L4 → L6, puis R. Ne rends la main qu'à la fin, ou quand le budget l'impose (voir §2), ou
   si une limite dure (ci-dessous) l'exige. Pas de message d'étape pour demander « je
   continue ? » : continue.
2. **Quand une décision relève de l'utilisateur, prends la meilleure décision toi-même**
   (la plus réversible, la plus conforme au HANDOFF et à la DA choisie), applique-la, et
   **note-la dans `DECISIONS.md`** : un tableau « date · lot · question · décision prise ·
   alternative écartée · comment revenir en arrière ». Chaque décision doit être réversible
   à faible coût (variante à côté de l'original, jamais d'écrasement d'un fichier validé).
3. **Les validations G1, G3, G4, G5 deviennent des auto-validations** : applique le critère
   chiffré du plan ; si le critère est atteint, retiens le résultat, sinon reviens à la version
   précédente. Dans les deux cas, note-le dans `DECISIONS.md` avec la planche correspondante
   dans `reports/`. L'utilisateur relira **à la fin** et réajustera : rien n'est définitif.
4. **Questions pour la fin** : tout ce qui n'est pas urgent s'accumule dans `QUESTIONS.md`
   (question, ce que tu as fait en attendant, impact). Tu ne poses **jamais** de question en
   cours de route, sauf urgence réelle : une action irréversible ou hors limites, un secret à
   fournir, un blocage total que ni toi ni un contournement honnête ne peuvent lever.
5. **Limites dures qui restent absolues** (aucune autonomie ne les lève) : jamais `main`,
   jamais `--force` ni reset ou rebase destructif, aucun déploiement (site, règles
   Firebase, Cloudflare), aucun secret ni jeton dans git, aucun contournement de
   CAPTCHA / MFA / authentification, ne pas modifier le jeu en production ni les autres jeux,
   ne pas écraser les modèles validés (`character-01-ict.glb`, `hair-curly-v41-opt.glb`), ne
   pas changer la direction artistique choisie (casting + révélation du salon), IA gratuite
   uniquement, pas de génération des 23 autres personnages (les photos viennent de Gemini
   sur le PC de l'utilisateur).
6. **Continuité sans surveillance** : tu travailles tant qu'il reste du budget et du travail.
   Après chaque étape : commit + push + `CLOUD_LOG.md`. Si la session s'arrête (limite de
   contexte, coupure), le prochain « continue » repart de `CLOUD_LOG.md` et du dernier
   commit : garde-le toujours à jour avec la **prochaine action précise**.
7. **À la fin (ou au retour R)** : rédige `FIN_DE_MISSION.md` (ce qui est fait, ce qui est
   en l'état de choix automatique, ce qui reste sur le PC, les 5 décisions les plus
   discutables, la liste de `QUESTIONS.md`). Un seul message final à l'utilisateur, court,
   avec le lien vers ce fichier et les captures clés.

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
7. **Points de validation** (marqués ⛔) : en mode autonome (voir plus haut), ils ne
   bloquent plus : auto-validation par le critère chiffré, décision notée dans
   `DECISIONS.md`, relecture par l'utilisateur à la fin.

## Cadre : c'est un jeu MULTIJOUEUR

Le Qui est-ce ? de GameHub est un jeu **à deux joueurs en ligne** (salon à code, un
personnage secret par joueur, tours alternés : question oui/non, réponse, cartes écartées,
désignation finale). Le jeu en production (`games/qui-est-ce/index.html`, nœud Firebase
`qec2/<code>`) l'est déjà ; la version 3D doit le rester. Tout ce que tu conçois (DA,
plateau, mesures) vaut pour une **partie à deux**, pas pour une maquette solo.

- **Le réseau ne transporte jamais de 3D** : seulement des identifiants et des choix (mon
  secret, mes cartes écartées, la question, la réponse). Chaque appareil rend ses propres
  personnages.
- **Le secret d'un joueur n'est jamais lisible par l'adversaire** avant la fin de partie
  (même principe que `ucSecret` d'Undercover). Toute écriture hors de la partie ou nouveau
  nœud exige d'abord une règle dans `firebase/build-rules.js`.
- **PC d'abord** (décision de l'utilisateur) : le jeu se joue sur ordinateur. Poids, mémoire
  GPU et rendu à la demande restent des contraintes (24 visages 3D), mais la cible est le
  navigateur de bureau ; le mobile ne doit que ne pas casser.
- Chaque page de jeu charge `shared/maintenance.js` en tête (voir `HANDOFF.md`).
- **Aucun branchement à Firebase ni au jeu en production sans accord explicite** de
  l'utilisateur. Jusqu'à ce que la DA et le plateau soient validés, tout se joue contre un
  **adversaire simulé en local** (bot) derrière une interface réseau factice
  (`js/net-mock.js`), conçue pour être remplacée par Firebase sans toucher au reste.

Écrans et états à prévoir partout (DA, plateau, tests) : accueil (créer / rejoindre avec
code), salon d'attente, choix de **mon personnage secret** (visible en permanence ensuite),
mon tour (poser une question), tour de l'adversaire (**répondre** oui / non à sa question),
attente, cartes écartées, désignation finale (bonne ou mauvaise), fin de partie
(vainqueur, révélation des secrets, revanche), déconnexion de l'adversaire.

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
| L2 | Pipeline industrialisé + distribution des 24 personnages | 15 % | ⛔ G2 (distribution) |
| DA | Direction artistique propre au Qui est-ce ? | 9 % | ⛔ G-DA |
| L3 | Plateau 3D de 24 cartes, dans la DA validée | 17 % | ⛔ G3 |
| L4 | Accessoires et pilosité faciale | **15 %** (relevé : qualité d'abord) | ⛔ G4 (par élément) |
| L5 | Jeu complet sur Firebase (émulateur) dans une copie du jeu, sur la branche | **14 %** | ⛔ G5 |
| L6 | Dossier « PC » : tout ce qui exige l'ordinateur de l'utilisateur, en une commande | **7 %** | — |
| R | Retour au PC | réserve ~12 % | — |

Ordre (révisé selon les intentions de l'utilisateur : qualité du personnage d'abord) :
L0 → L1 → L2 → DA (déclinaison) → **L4 → L3** → L5 → L6 → R. Les accessoires (L4) passent
avant le plateau et la partie en ligne. Si G1 n'est pas
donné, L3 et L4 travaillent sur `character-01-ict.glb` d'origine et restent des
prototypes. Si G-DA n'est pas donné, L3 se construit sur des jetons de style (variables
CSS) faciles à rebasculer vers la direction choisie plus tard.

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

## L2 — Pipeline industrialisé et distribution des 24 personnages (≈ 15 %) ⛔ G2

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

## DA — Direction artistique propre au Qui est-ce ? (≈ 9 %) ⛔ G-DA

> **G-DA : DIRECTION CHOISIE par l'utilisateur (2026-10-14) — B « La séance de casting »,
> avec la cérémonie de révélation finale du salon (C).** Ne plus proposer d'alternatives.
>
> - Base : B (Polaroïd scotché, planche contact, crayon gras, Permanent Marker + DM Mono,
>   palette `reports/da/casting.jpg`). La réponse au tour de l'adversaire et l'élimination
>   gardent le crayon gras (croix rouge, crissement) et le flash.
> - Emprunt à C : **la révélation de fin de partie** : le portrait du secret est « accroché »
>   (cadre, lampe qui s'allume, pastille rouge sur le cartel) pour les deux joueurs.
> - **Revanche en un clic** depuis l'écran de fin, sans repasser par le salon.
> - Pensé pour **l'envie de rejouer** : parties courtes (3 à 5 min), gestes d'élimination
>   très gratifiants (son, mouvement), capture de fin de partie partageable (planche
>   contact avec les croix), score entre les deux joueurs sur les revanches successives.
> - Reste à valider : la déclinaison multijoueur (point 6 ci-dessous), puis G3.

**Exigence de l'utilisateur : le jeu doit avoir sa propre identité visuelle, forte et
cohérente, au niveau de Banqueroll — et mieux.** Le but final de GameHub : **chaque jeu a sa
propre identité** ; on doit reconnaître le Qui est-ce ? au premier coup d'œil, sans le
confondre avec un autre jeu du site. Ce n'est pas un habillage générique ni un thème
sombre par défaut : c'est un univers.

Référence de niveau, **à ne pas copier** : la DA de Banqueroll (2026-10-07) est « un jeu de
société sur une table de banque » — feutre vert, fiches en carton crème avec grain, encre
`#1B2420`, laiton pour ce qui compte, polices Gloock (titres, montants) et Schibsted
Grotesk, boutons à contour d'encre et arête pleine, jetons de casino, rosace guillochée
générée en SVG. Ce qui la rend forte : **une métaphore physique unique** d'où découlent
matières, couleurs, typographie, formes des boutons et motifs. Le Qui est-ce ? doit avoir
la sienne, aussi tenue, et aller plus loin (mouvement, son, la 3D comme pièce maîtresse).

Démarche :

1. **Trois directions contrastées**, chacune avec sa métaphore. Pistes à explorer ou à
   dépasser : salle d'interrogatoire / enquête de police rétro (dossiers, polaroïds,
   tampons, lampe) ; studio de casting photo (planche contact, fond papier, flash) ;
   galerie de portraits / musée (cadres, cartels, vernissage) ; trombinoscope d'école
   des années 70. Le jeu original (plateau à volets qui se rabattent) est un ancrage
   possible, pas une obligation.
2. Pour chaque direction : métaphore en une phrase, palette (jetons nommés, contrastes
   AA vérifiés), 2 polices Google Fonts gratuites (titres + texte), matières et motifs
   (générés en CSS / SVG / canvas, pas d'images payantes ni copiées), forme des boutons,
   des cartes et des badges, **mise en scène 3D** (fond, lumière, cadre de carte — sans
   toucher au visage ni à la coiffure validés), mouvement (rabat de carte, survol,
   victoire), et sons possibles (Web Audio, comme `sfx.js` de Banqueroll).
3. Une page **`da.html`** dans le prototype : les trois directions côte à côte, chacune
   avec une vraie carte personnage (le rendu 3D du personnage 01), un extrait de plateau,
   un bouton, une question du jeu. Captures réduites dans `reports/da/`. **Les trois
   directions existent déjà** (lot DA du 2026-10-14) : dossier, casting, salon. Elles ne
   montrent que le plateau d'un joueur : voir « Déclinaison multijoueur » ci-dessous.
4. Interdits hérités du site : halos lumineux, dégradés décoratifs, badges en pilule,
   bordures colorées sur un seul côté, majuscules très espacées. Pas d'esthétique
   « tableau de bord » ni de gabarit d'IA générique.
5. Une fois une direction choisie : `css/tokens.css` (palette, typographie, espacements,
   rayons, ombres, durées), et une proposition de couverture pour la carte du hub
   (`reports/da/cover.jpg`, **sans toucher** à `games/qui-est-ce/cover.webp` sur `main`).

6. **Déclinaison multijoueur de la direction choisie** (seulement après le choix) :
   `da.html` gagne une section « Partie à deux » avec, dans cette DA, les écrans listés
   dans « Cadre : c'est un jeu MULTIJOUEUR » : accueil, salon d'attente avec le code,
   choix du secret, carte « mon personnage » toujours visible, tour de l'adversaire (je
   réponds oui / non), attente, cartes écartées des deux côtés, désignation finale, fin de
   partie, revanche, adversaire déconnecté. Version **bureau** de chacun, plus une capture
   mobile 390 px de contrôle (« ne casse pas ») (captures réduites dans `reports/da/`). Même identité sonore et mouvement pour les deux
   joueurs ; la DA doit aider à lire **à qui c'est le tour** sans texte.

⛔ **G-DA** : l'utilisateur choisit (ou mixe) une direction, puis valide sa déclinaison
multijoueur. Le plateau L3 l'applique.

## L3 — Plateau 3D de 24 cartes (≈ 17 %) ⛔ G3

Prototype de l'architecture du jeu, **dans le dossier du prototype** (`board.html`,
`js/board.js`, `css/board.css`), sans toucher au jeu en production. Personnage 01 placé
24 fois en attendant les autres, avec les noms et attributs de `data/roster.json` si L2 est
fait. **Entièrement dans la DA validée** (`css/tokens.css`) : le plateau doit déjà avoir
l'allure du jeu final, pas d'une maquette technique.

**Partie à deux complète contre un adversaire simulé** : le prototype joue une vraie partie
de bout en bout (salon, choix du secret, tours alternés, réponses, cartes écartées,
désignation, fin, revanche), l'adversaire étant un bot local (`js/bot.js`, qui pose des
questions utiles de `data/roster.json` et répond honnêtement) derrière `js/net-mock.js`
(créer / rejoindre, envoyer une action, recevoir l'état). L'interface réseau a **la forme
du jeu en production** (un état de partie par code, un secret par joueur) pour être
rebranchée sur Firebase sans toucher à l'affichage. Cible : navigateur de bureau ; mobile
390 px sans défilement horizontal (contrôle seulement) ; mémoire GPU et temps d'image mesurés avec 24 cartes à l'écran.

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

## L4 — Accessoires et pilosité faciale (≈ 13 %) ⛔ G4

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

## PRINCIPE DIRECTEUR (décision de l'utilisateur, 2026-10-14) : le cloud fait TOUT ce qui est faisable ici

L'utilisateur veut dépenser le moins possible de jetons sur son PC : **le cloud doit mâcher
tout le travail**, y compris le branchement Firebase et l'intégration au jeu, et ne laisser à
la machine locale que ce qui exige physiquement son PC (photos Gemini dans son navigateur,
GPU réel, mise en ligne). Tout travail faisable dans le cloud **doit** être fait dans le
cloud ; ne laisse jamais « à voir sur le PC » une chose que tu peux tester ou écrire ici.
Conséquence : l'accord pour L5 est **donné** (voir ci-dessous), dans les limites fixées.

## L5 — Jeu complet sur Firebase, contre l'émulateur (≈ 20 %) ⛔ G5

Objectif : une **version du Qui est-ce ? 3D qui se joue vraiment à deux humains**, prête à
être mise en ligne par une seule fusion le jour où l'utilisateur l'aura décidé.

Limites (inchangées) : travail sur la branche `proto/qui-est-ce-3d`, **jamais `main`, jamais
de déploiement** des règles ou du site, aucun secret dans git, tests contre l'**émulateur**
Firebase uniquement (voir `firebase/README.md`, `firebase/tests/use-emulator.cjs`, pages
en `?emu`). Le jeu en production (`games/qui-est-ce/index.html`, nœud `qec2`) **ne change pas**.

1. **Nouvelle copie du jeu** dans `games/qui-est-ce/v3d/` (entrée `index.html`), construite à
   partir du plateau L3 et de la DA validée ; elle charge `shared/maintenance.js` en tête et
   `shared/firebase.js` (compte anonyme, salons) comme les autres jeux. Chemins relatifs
   (`../../shared/`, `../../icons/`) ; `node tools/check-links.js` doit rester vert.
2. **Réseau réel** : remplacer `net-mock.js` par un module Firebase de **même interface**
   (créer / rejoindre un salon à code, état de partie, une action par tour). Nouveau nœud
   `qec3/<code>` (ne touche pas à `qec2`), avec sa règle dans `firebase/build-rules.js` :
   membres, `hostUid`, **secret de chaque joueur illisible par l'adversaire** jusqu'à la fin
   (même principe qu'`ucSecret`), écritures limitées au joueur dont c'est le tour, rien d'autre
   n'est écrit. Mode maintenance respecté (règles comme pages).
3. **Tests** : règles (`cd firebase && npm test`, avec Java : `~/.jdks/openjdk-25.0.2/bin`) ;
   partie complète à deux fenêtres Chrome sur l'émulateur (une fenêtre par joueur, voir
   `tools/cdp.js`) : création, jonction, secrets, tours, réponses, cartes écartées,
   désignation juste et fausse, fin, revanche, déconnexion de l'adversaire, **tentatives de
   triche refusées** (lire le secret adverse, jouer hors de son tour). Journal des résultats
   dans `CLOUD_LOG.md`.
4. **Parties contre un bot** conservées (adversaire local) : un joueur seul peut jouer sans
   attendre.
5. **Roster dynamique** : le jeu lit `data/roster.json` ; tant que seul `character-01` existe,
   les 23 autres affichent un **personnage de substitution** (le 01 avec une teinte ou un
   nom distinct, clairement marqué temporaire dans le code) pour que la partie soit jouable
   de bout en bout ; ajouter un personnage = déposer son GLB et passer son statut à `ready`
   dans `roster.json`, sans toucher au code.
6. **Sobriété de rendu** : 24 cartes en rendu à la demande, textures partagées, mémoire GPU
   mesurée sur PC ; repli à une image fixe (PNG pré-rendu) pour les cartes hors écran.

⛔ **G5** : l'utilisateur teste (ou vérifie sur capture) ; la mise en ligne ne se fait pas
d'ici (voir L6).

## L6 — Dossier « PC » : ce qui ne peut pas se faire dans le cloud (≈ 7 %)

Objectif : que l'utilisateur et la session locale dépensent **le minimum**. Écris
`PC_RUNBOOK.md` et les scripts associés, pour que chaque étape locale soit **une commande ou
un geste**, sans réflexion :

- **Photos Gemini** : une feuille pas à pas (les 23 fiches `data/prompts/<id>.md` déjà
  prêtes, où déposer chaque image, noms de fichiers exacts) et un script de contrôle
  `tools/pipeline/check_refs.py <id>` qui vérifie les 5 vues (nombre, taille, fond uni,
  visage détecté) et dit précisément ce qui manque.
- **Fabrication** : `python tools/pipeline/build_character.py <id>` (ou `--all-ready`) fait
  tout le reste : reconstruction, coiffure, optimisation, banc, planche de validation, mise
  à jour de `roster.json`. Les étapes qui passent par un Space Hugging Face (Hunyuan) sont
  décrites avec leurs commandes exactes et leurs erreurs courantes ; aucun jeton ni secret
  dans le dépôt.
- **Mesures GPU** : `node tools/measure_pc.js` : un seul script qui lance le banc du
  personnage, le plateau 24 cartes et la partie, et écrit un `reports/pc/résumé.md`
  (FPS réels, mémoire GPU, temps de chargement) avec les seuils attendus.
- **Mise en ligne** : la procédure complète, **non exécutée**, pour fusionner `v3d/` dans
  `main` : liste de contrôle, tests à relancer, déploiement des règles Firebase
  (`npx firebase deploy --only database --project undercover-game-b0d2a` depuis `firebase/`,
  **jamais depuis le cloud**), vérification `smoke-prod.cjs`, retour arrière.
- **Un seul fichier de reprise** : `PC_RUNBOOK.md` commence par un tableau « à faire / par qui /
  commande / durée » ; il est mis à jour à chaque lot.

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
