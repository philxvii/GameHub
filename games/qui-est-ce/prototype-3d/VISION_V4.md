# Qui est-ce ? — Vision V4 (2026-10-16) : LE POINT DE DÉPART DE LA NOUVELLE SESSION

**Lis ce fichier en premier, puis `HANDOFF.md` (état technique) et `FIN_DE_MISSION_3.md` (ce que le cloud a livré).**
La mission 3 du cloud est **rejetée par l'utilisateur** : le jeu « est horrible », « on dirait un jeu des
années 2010 », « la DA n'est pas claire », « le jeu n'a pas sa propre identité comme Mini Metro ou
Banqueroll ». La mécanique est bonne et testée (à garder) ; **l'habillage, la direction artistique, la mise
en scène et le casting sont à refaire**. Ne pas retoucher l'existant : repartir de la vision ci-dessous.

## La vision, avec les mots de l'utilisateur

> Il faut un truc **original**, avec sa propre énergie, sa propre direction artistique, son propre délire,
> ses propres polices, ses propres animations. J'imagine **un vrai plateau**. Il suffit de regarder l'image
> de la carte dans l'index (`games/qui-est-ce/cover.webp`, carte du jeu sur le hub). Un vrai plateau avec
> des animations, **une caméra qui avance** et parcourt au début de la partie tous les personnages, qui font
> un sourire, des animations, etc. Ensuite **la caméra reste fixe, en vue de dessus à moitié (plongée
> oblique)**, avec **toutes les cartes levées**. Quand on appuie sur un personnage, **la carte se baisse**,
> avec son animation. **Littéralement comme si on jouait au Qui est-ce ? dans la vraie vie, avec un vrai
> plateau.**

Traduction pour le design :
1. **Scène 3D de plateau physique** (Three.js, un seul moteur) : plateau en matière réelle, **24 volets
   levés** (cartes à charnière, comme le vrai jeu), éclairage de table, ombres douces, légère profondeur de champ.
2. **Intro cinématique** : la caméra parcourt les 24 personnages, chacun fait une courte animation (sourire,
   regard, clin d'œil), puis la caméra se pose en vue fixe plongée oblique.
3. **Interaction** : survol = le personnage réagit ; clic = **le volet se rabat** (animation de charnière,
   claquement visuel, ombre qui bouge). Rien d'une interface web générique : l'écran EST la table.
4. **Identité propre** : sa propre palette, ses polices, sa matière, ses animations, son « délire ». Pas
   de « tableau de bord », pas de polaroïds, pas de gris, pas de panneaux noirs (voir `MISSION_3.md`,
   § « Interdictions visuelles », toujours valable). **Banqueroll et le visuel de la carte de l'index
   sont les références de niveau d'identité**, sans les copier.
5. **Le but : rendre les joueurs accros** : ils ne se lassent pas, ils veulent rejouer.

## Règles de travail (pour ne pas gaspiller de jetons)

1. **Jamais de capture « pour voir » sans raison.** On vérifie par des **scripts qui renvoient du texte**
   (DOM, mesures, comparaison de pixels : `tools/test-board.js`, `test-board-pixels.js`, `test-game-logic.mjs`).
   On ne regarde une image **que** pour juger l'esthétique, **réduite** (≤ 1000 px de large), une à la fois.
2. **Navigation web et tests navigateur** : voir `BROWSER_TESTING.md`. Pas de serveur MCP de navigateur
   ouvert en continu sauf besoin ; outils CLI et scripts CDP du dépôt (`tools/cdp.js`).
3. **Recherche avant chaque fonctionnalité de rétention** : notes courtes (≤ 10 lignes) dans
   `RESEARCH.md` : ce qu'on sait (design de jeux de déduction / jeux à parties courtes, boucles de
   rejouabilité, « game feel »), la source, la décision. Pas de manipulation (pas de notifications
   artificielles, pas de récompenses vides) : la rejouabilité vient de la qualité de la partie.
4. **Une session courte par objectif** ; jamais continuer une session de plus de ~2 h. Les décisions vont
   dans `DECISIONS.md`, pas dans la conversation. Pas de sous-agent « fork » (il copie tout le contexte).
5. **Rien sur `main`, aucun déploiement, aucun secret.** Branche `proto/qui-est-ce-3d` ; commits courts en
   français, sans trailer.

## Ce qui reste utile (à réutiliser, pas à refaire)

- **Mécanique** : `js/game/*` (partie à deux contre un bot, secret caché, tours, élimination, désignation,
  révélation, revanche, statistiques, titres), testée : logique 5/5, partie complète 11/12 (le 12e est
  l'avertissement D3D `X4122` de Windows, inoffensif). Règles Firebase `qec3` : 342/342 (émulateur).
- **Personnage 01** (ICT, validé), coiffure V4.1 optimisée, accessoires (lunettes, barbe, moustache,
  casquette, boucles d'oreilles), chaîne d'optimisation, bancs et tests d'image.
- **Chaîne de fabrication des personnages** : `tools/pipeline/build_character.py`, fiches photo
  `data/prompts/<id>.md`, roster `data/roster.json` (24 personnages, attributs équilibrés).
- **Rendu portraits** : `js/game/cast.js`, `live.js`, `tools/bake_portraits.js`.

## Ce qui est à refaire

- **Toute la DA et la mise en scène** (voir la vision) : scène de plateau 3D, caméra d'intro, volets à
  charnière, matières, lumière, typographie, UI intégrée à la table (peu d'éléments, tous dans l'univers).
- **Le casting** : 4 visages réels sur 24 ; les 20 autres sont le visage de Raphaël grimé ; **les 12
  femmes ont un visage masculin**, aucun cheveu long. Seule voie : **photos Gemini** (voir ci-dessous).

## Photos Gemini (PLUS TARD, pas maintenant)

Un **gros prompt unique** pour obtenir toutes les photos d'un coup est à préparer **après** la DA et la
vision plateau. Gemini risque de bloquer (quota, refus) : prévoir un **plan d'action par paliers** :
(1) 3 personnages pilotes (une femme à cheveux longs, un senior, un jeune), validés à l'œil ; (2) les
autres par lots de 4 ; (3) repli si blocage : générer via un autre outil gratuit, ou vues partielles
seulement (face + deux profils). Les fiches `data/prompts/` existent déjà par personnage. L'utilisateur
exécute Gemini dans son navigateur ; **ne jamais contourner une protection** (CAPTCHA, quota, etc.).

## Prompt de démarrage conseillé pour la nouvelle session

> Lis `games/qui-est-ce/prototype-3d/team/TEAM.md` (méthode économe : commandes `check-all` et `shoot`, session courte, seulement 3 sous-agents : reviewer visuel, reviewer de code, chercheur web) ; lance `bash games/qui-est-ce/prototype-3d/team/install.sh` si `.claude/agents/` est vide. Lis `games/qui-est-ce/prototype-3d/VISION_V4.md` puis `HANDOFF.md`. Branche `proto/qui-est-ce-3d`
> (worktree `C:\Java\GameHub-proto`). On refait la DA et la mise en scène du Qui est-ce ? selon la vision
> V4 : un vrai plateau en 3D, caméra d'intro, volets qui se rabattent. Commence par une **recherche courte**
> (références visuelles du plateau, jeux de déduction, game feel) dans `RESEARCH.md`, puis propose
> **trois directions** en maquette rapide dans le navigateur, une à la fois, avec mes retours entre chaque.
> Économise les jetons : `check-all` après chaque lot, `shoot` seulement pour juger l'esthétique.
>
> **Point à traiter d'abord** : sur GPU réel, `check-all` montre `test-board-pixels` à 39/60 : le personnage vivant est décalé de ~3 px (dy = 3, dw = 0,4) par rapport à sa photo au survol (le cloud, en rendu logiciel, avait 60/60) : saut visible à la transition ; vérifier si c'est le test ou le rendu.
