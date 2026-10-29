# Charte des jeux de GameHub

**Lecture obligatoire avant tout travail sur le dépôt, pour toute personne et toute IA.**
Si tu es une IA : lis ce fichier en entier, puis enregistre l'essentiel dans ta mémoire
persistante (les huit règles de la section 1, le niveau de référence de la section 2, et
l'obligation de plan de la section 4). Relis-le au début de chaque session. Il y a eu des
reproches : un jeu fait sans cette charte est refusé et refait.

## 0. Ce qu'on construit

GameHub n'est pas un tas de mini-jeux : c'est un site où **chaque jeu est un petit monde**,
avec son lieu, son époque, sa lumière, sa typographie, son logo, son histoire, ses
personnages et son ton. Le site est cohérent par le niveau d'exigence et par l'enveloppe
(hub, affiches, retour, thème, maintenance), **pas parce que tous les jeux se ressemblent**.

Quand on joue, on doit avoir l'impression que le jeu a été fait par une équipe : un
directeur artistique, des graphistes, des développeurs, des testeurs qui ont passé du
temps sur chaque détail. Jamais l'impression d'une page « générée ». Épuré, réfléchi,
fluide. Même la police compte.

## 1. Les huit règles

1. **Un jeu = un univers.** Une phrase suffit pour le dire (« Le zinc d'un bistrot »,
   « Une chaîne de télé de 1978 », « Une salle d'observatoire la nuit »). Si on ne peut pas
   la dire, le jeu n'est pas prêt à être dessiné.
2. **L'immersion est maximale** : décor, matières, objets, lumière, sons, micro-textes,
   transitions, écrans de chargement, d'erreur et de victoire. Tout vit dans l'univers.
   Aucun écran « par défaut » qui sortirait du monde du jeu.
3. **Chaque jeu est fort par son image** : une affiche (`cover.webp`), un logotype dessiné
   qu'on ne voit nulle part ailleurs, un nom, une histoire, des personnages.
4. **Épuré avant tout.** Peu d'éléments, tous justifiés ; une chose à faire par écran ; un
   seul accent de couleur par écran. Ce qui n'aide ni le jeu ni l'ambiance disparaît.
5. **Fluide.** La réponse à un geste en moins de 0,1 s, les mouvements de 200 à 400 ms avec
   une courbe (jamais linéaire), rien qui bloque, rien qui saute. Le mouvement donne du poids
   et du sens, jamais de bruit. `prefers-reduced-motion` respecté.
6. **La typographie est un choix**, pas un réglage par défaut : deux familles au plus,
   chacune justifiée par l'univers (voir section 5).
7. **Ça ne doit pas se voir qu'une IA l'a fait** : voir la liste des signes à bannir
   (section 6).
8. **On planifie avant de générer** : un dossier de direction écrit et validé par
   l'utilisateur avant la moindre ligne d'interface (section 4).

## 2. Le niveau à atteindre : les jeux de référence

À ouvrir et à regarder avant de commencer (en local : `python -m http.server 4173`, puis
`http://localhost:4173/games/<jeu>/`). Leur dossier de direction est à lire aussi.

| Jeu | L'univers | Ce qui le rend excellent | À lire |
| --- | --- | --- | --- |
| **Mini Subway** (la plus belle DA du site) | Une carte de métro imprimée, papier crème, eaux hachurées | Une seule idée tenue partout : tout est tracé comme sur une carte imprimée ; modes Jour, Nuit, Daltonien ; formes et lignes lisibles sans texte ; Bricolage Grotesque + IBM Plex Mono | `games/mini-subway/docs/`, `games/mini-subway/CLAUDE.md` |
| **Banqueroll** | Un jeu de société posé sur une table de banque : feutre vert, plateau et fiches en carton imprimé, laiton | Relief par l'épaisseur du carton et des arêtes d'encre, pas par des halos ; typo de billet (Gloock) + Schibsted Grotesk ; un présentateur IA avec sa personnalité ; des minijeux dans l'univers | `games/banqueroll/css/base.css` (commentaire d'en-tête), `games/banqueroll/ai-host/` |
| **Puissance 4** (en cours, déjà au niveau) | « Conjonction » : un observatoire la nuit, le plateau sur la table d'observation | Vrai décor photographique, vraie 3D, lumière cohérente avec la photo, logotype dessiné, ouverture de 2,5 s, victoire mise en scène (Cinzel + Tenor Sans) | `games/puissance4/DIRECTION.md` |
| **421** | « Le zinc » : le comptoir d'un bistrot | Dés 3D en os verni, jetons de bistrot, enseigne néon qui grésille la nuit, joueurs ordinateur avec des noms et des figures (« les habitués ») | `games/421/DIRECTION.md` |
| **Échecs** | « Le cercle » : un club d'échecs, le soir | Marqueterie de bois dessinée case par case, pièces Staunton en SVG, partie célèbre rejouée à l'accueil | `games/echecs/DIRECTION.md` |
| **Mauvais Perdants** | « Canal 7 » : une chaîne de télé fictive de 1978 | Le décor, c'est l'interface ; la couleur dit la phase du jeu ; ton taquin, fausses publicités, virgule d'antenne | `games/mauvais-perdants/docs/DIRECTION-ARTISTIQUE.md` |
| **Le hub** | Une page claire, des affiches, rien d'autre | Les affiches portent seules la couleur ; distribution des cartes à l'ouverture ; Instrument Sans | `shared/design/README.md` |

Ce que ces jeux ont tous : **un lieu ou un objet concret**, une palette courte venue de
matières réelles, une typographie qui sent l'époque, des détails qu'on découvre en jouant,
un dossier de direction qui explique chaque choix et son pourquoi.

## 3. Ce qui est commun à tous les jeux, ce qui est propre à chacun

**Commun (non négociable)** : la garde de maintenance en tête de page (copier celle d'un jeu
existant), une carte sur le hub avec une affiche `games/<jeu>/cover.webp`, l'entrée dans
`404.html` (`GAMES`), un retour au hub, « Quitter » toujours visible, un thème respectueux
de `prefers-color-scheme` quand l'univers le permet, `prefers-reduced-motion`, et
`node tools/check-links.js` au vert. Pas de nouvelle page publique sans accord de
l'utilisateur.

**Propre à chaque jeu** : tout le reste. Pas de composant « générique du site » collé dans
un jeu : un bouton de 421 n'est pas un bouton de Mini Subway. On réutilise les idées de
construction (rigueur, tokens, états), pas l'apparence.

## 4. Planifier avant de générer (obligatoire)

Aucune interface, aucune image, aucun CSS n'est produit avant que ces étapes soient faites,
dans cet ordre, et que l'utilisateur ait dit oui à l'étape 3.

1. **Regarder** les jeux de référence de la section 2 (au moins deux, avec leur dossier de
   direction) et **chercher** : lieux, objets, époques, typographies, jeux et interfaces
   comparables, ce que les joueurs aiment et détestent. Noter les sources.
2. **Écrire `games/<jeu>/DIRECTION.md`** sur le modèle des autres (voir le gabarit
   ci-dessous) : univers en une phrase, tableau « Élément / Décision / Pourquoi », mouvement,
   recherche, écrans clés, personnages et ton, affiche, sons.
3. **Montrer le plan à l'utilisateur** (texte + au besoin une maquette d'un seul écran,
   en local) et **attendre son accord**.
4. **Construire en tranches** : l'écran qui donne le ton d'abord (accueil ou partie), le
   valider visuellement, puis le reste.
5. **Vérifier avant de livrer** : captures ordinateur et téléphone, partie complète jouée,
   mouvement réduit, thème clair et sombre si prévu, texte relu à voix haute.

Gabarit de `DIRECTION.md` :

```
# <Jeu> : direction artistique
## L'univers : « <titre> »   (une phrase : où, quand, quoi)
| Élément | Décision | Pourquoi |   (décor, objets, plateau, typographie, logotype,
                                    couleurs, victoire, accueil, personnages)
## Mouvement                       (durées, courbes, réponse au clic, mouvement réduit)
## Recherche                       (sources lues, ce qu'on en retient, décision prise)
## Ton et personnages              (voix du jeu, micro-textes, noms)
```

## 5. Typographie

- Deux familles au plus par jeu : une pour ce qui s'affiche (titres, chiffres, noms), une pour
  ce qui se lit (règles, formulaires). Le hub utilise **Instrument Sans**, seule famille.
- Chaque choix est justifié par l'univers (Cinzel : capitales gravées d'un observatoire ;
  Fraunces : le serif rond des vitrines de bistrot ; Anton : le titrage d'une chaîne de télé).
- Jamais : police système, Inter, Roboto, Arial ou « sans-serif » par défaut comme parti pris.
- Hiérarchie claire (trois tailles suffisent), interlignage soigné, chiffres tabulaires pour
  les scores et les chronos, `font-display: swap`, polices chargées par la page elle-même.
- Un logotype dessiné ou composé avec soin (pas le nom du jeu en gras dans la police du texte).

## 6. Signes qui trahissent une IA : à bannir

- Dégradés bleu-violet, effets de verre flou, ombres douces et floues partout, néons « tech ».
- Cartes blanches à coins arrondis posées sur un fond uni, grilles de cartes identiques.
- Emojis utilisés comme illustrations ou icônes (un emoji n'est pas un dessin).
- Polices par défaut, titres « Bienvenue sur… », textes creux (« Une expérience unique »),
  placeholders, lorem ipsum, boutons « Commencer » sans voix.
- Symétrie sans parti pris, tout centré, tout au même poids, aucun détail qui surprend.
- Animations gratuites (rebonds partout, pulsations), transitions identiques pour tout.
- Écrans d'erreur, de chargement et de victoire génériques, hors de l'univers du jeu.
- Couleurs trop nombreuses : une palette courte, issue de matières, avec un seul accent.

À la place : un parti pris fort, de la matière (bois, papier, feutre, métal, verre), une
lumière, des objets, des textes écrits par quelqu'un qui connaît le jeu, des détails cachés,
un ton.

## 7. Fluidité, simplicité, lisibilité

- **Règle en une phrase** : on comprend le jeu en moins de 30 secondes, en jouant plutôt
  qu'en lisant. Une démonstration vaut mieux qu'un paragraphe.
- **Un geste, un écran** : une seule chose à faire à la fois, toujours claire.
- **Retour immédiat** : l'action réagit avant la réponse du réseau.
- **Mobile d'abord** : cibles de 44 px au moins, aucun défilement horizontal, gouttières de 16 px.
- **Contraste** : texte 4,5:1, éléments graphiques 3:1, jamais la couleur seule pour dire quelque chose.
- **Honnête** : pas de minuterie qui presse, pas de récompense factice, « Revanche » en un clic,
  « Quitter » toujours visible.
- **Équité** : l'adresse décide, pas le hasard pur ; tout le monde reçoit le même défi.
- **Le hasard se voit** : si un résultat dépend d'un tirage, le dire.

## 8. Identité d'un jeu : la liste à cocher

- [ ] un nom propre à lui, jamais celui d'un autre jeu ni d'une marque
- [ ] une phrase d'univers, un lieu ou un objet central
- [ ] un logotype dessiné, une affiche 720 × 960 (3:4, WebP, 30 à 70 Ko) dans le style des
      autres affiches (voir `shared/design/README.md`)
- [ ] une typographie justifiée, une palette courte, un seul accent
- [ ] des personnages ou une voix (animateur, habitués, présentateur) avec un ton constant
- [ ] au moins un moment de mise en scène (ouverture, victoire, défaite)
- [ ] des états vides, d'attente et d'erreur dans l'univers
- [ ] les textes relus : phrases courtes, concrètes, drôles ou justes, jamais génériques
- [ ] le dossier `DIRECTION.md` à jour avec ce qui a vraiment été fait

## 9. En cas de doute

Demander à l'utilisateur plutôt que d'inventer. Proposer deux pistes courtes plutôt qu'une
seule longue. Et toujours se demander : *« Est-ce qu'une équipe de graphistes aurait signé
ça ? »* Si la réponse est non, on recommence.
