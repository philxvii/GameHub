# Échecs : direction artistique

## L'univers : « Le cercle »

Un club d'échecs, le soir : un échiquier de marqueterie sur le mur vert sombre du cercle.
Le thème clair est la même salle au matin, murs crème. L'affiche garde la lampe à abat-jour
vert ; la page n'en a plus besoin (sans 3D, elle n'éclairait rien).

| Élément | Décision | Pourquoi |
| --- | --- | --- |
| Décor | Mur vert sombre (nuit) ou crème (matin), vignettage et grain | Sobre : l'échiquier porte l'ambiance |
| Échiquier | 2D vue de dessus, en CSS : placages d'érable et de noyer (chaque case a son morceau de bois), cadre de noyer, filet clair, coordonnées sur le cadre, tournées du côté du joueur | L'objet d'un club, net à toutes les tailles. Une 3D a été essayée : vue de dessus, elle ne se distinguait pas de la 2D et coûtait un rendu WebGL pour rien |
| Pièces | Silhouettes Staunton dessinées en SVG (`board2d.js`), dégradés ivoire et ébène, ombre portée qui s'allonge quand la pièce se soulève | Le modèle de référence des échecs, reconnaissable au premier coup d'œil |
| Typographie | Cormorant Garamond (titres, noms) et Jost (pendules, menus) | Une capitale de livre ancien, une sans-serif géométrique de pendule |
| Couleurs | Laiton (accent), vert du cercle, rouge de l'échec | Les matières de la salle |

## Mouvement

- Sélection : la pièce se soulève sous 0,1 s ; cases jouables en points, prises en anneaux.
- Déplacement : un arc (soulever, glisser, poser, léger tassement), 270 à 560 ms selon la
  distance ; le cavalier saute plus haut. Glisser-déposer : la pièce suit le doigt.
- Prise : la pièce prise bascule sous le choc et s'efface ; elle rejoint les prises du joueur, à côté de son nom.
- Roque : la tour suit le roi. Promotion : le pion s'illumine et s'efface, la nouvelle pièce pousse.
- Échec : un halo rouge pulse sous le roi, puis s'apaise.
- Mat, abandon, temps : le roi vaincu se couche, l'échiquier s'assombrit, un halo doré sous le vainqueur.
  Nulle : les deux rois s'éclairent.
- Retourner l'échiquier, revanche (couleurs échangées) : les pièces glissent vers leur nouvelle place.
- Accueil : une partie célèbre se rejoue seule (Morphy, l'Opéra de Paris, 1858) ; ouverture d'environ
  2 s une fois par visite, les pièces tombent en vague sur l'échiquier.
- Aucun rendu tant que rien ne bouge : les animations passent par l'API Web Animations, sans bibliothèque.
- `prefers-reduced-motion` : aucun déplacement animé, la vitrine reste figée.

## Recherche

Les mêmes sources que Puissance 4 ([DIRECTION.md](../puissance4/DIRECTION.md)) guident les durées
(Nielsen, NN/g), l'accessibilité (WCAG 2.2 : contraste des éléments graphiques, animations
désactivables) et le refus des mécanismes qui retiennent le joueur (revanche en un clic, « Quitter »
toujours visible). Propre aux échecs :

| Source | Ce qu'on en retient | Décision |
| --- | --- | --- |
| FIDE, *Laws of Chess* (art. 5, 6, 9) | Pat, matériel insuffisant, 50 coups, triple répétition ; drapeau tombé sans matériel pour mater en face : nulle | Toutes les fins de partie sont appliquées automatiquement par `rules.js` |
| Chess Programming Wiki, *Perft Results* | Comptages de référence du générateur de coups | Les tests vérifient cinq positions de référence |
| T. Michniewski, *Simplified Evaluation Function* | Valeurs et tables de placement simples, suffisantes pour un adversaire crédible | Évaluation de l'ordinateur (`bot.js`) |

## Apprendre

Pour les nouveaux joueurs, deux étapes (`learn.js`) :

- **Cinq leçons, treize exercices** sur l'échiquier : chaque pièce (ramasser des étoiles), puis le
  roque, la prise en passant, la promotion, l'échec et deux mats en un coup. Un coup faux est
  expliqué, puis l'exercice se remet en place. Indice à la demande ; leçons faites mémorisées.
- **Une partie avec un coach**, contre l'ordinateur débutant : chaque coup est commenté en une phrase
  (prise, menace, roque, développement), les pièces en prise sont cerclées d'orange, « Un conseil ? »
  propose un coup. Si l'on vient de laisser une pièce en prise, l'ordinateur attend : « Annuler mon
  coup » ou « Je garde mon coup ».

Le coach prévient, il ne joue pas à la place du joueur : apprendre passe par l'erreur comprise
(Ryan, Rigby et Przybylski, 2006 : le sentiment de compétence nourrit l'envie de rejouer).
