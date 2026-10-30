# Guide des mini-jeux de GameHub

**À lire en entier avant de créer ou de modifier un jeu ou une épreuve** (après la
[charte des jeux](CHARTE-DES-JEUX.md)). Si tu es une IA : lis ce fichier, puis enregistre-en
l'essentiel dans ta mémoire persistante. Il rassemble (1) ce que le propriétaire du site a demandé,
avec ses mots, (2) la recherche faite sur ce qui rend un mini-jeu compréhensible et qu'on a envie de
rejouer, (3) la recette technique pour ajouter une épreuve, (4) la liste à cocher avant de livrer.
Il a été écrit le 30/10/2026 à partir des conversations de la semaine du 23 au 30/10. Complète-le quand
une nouvelle consigne arrive : c'est la mémoire du projet.

## 1. Ce que le propriétaire demande (ses consignes, regroupées)

### Se comprendre en moins de 30 secondes
- « Faire des cartes animées simples et ludiques qui expliquent le jeu : ce qu'il faut faire, quel est le
  but final. Moins de texte. » Une mini-vidéo animée, très ludique : « il y a plein de gens qui ne
  comprennent pas les règles. » (Mini Subway, Banqueroll, puis toutes les épreuves de Mauvais Perdants.)
- Les points doivent être clairs : savoir jusqu'à combien on peut gagner sur une manche, et « un bilan
  clair » à la fin : qui a gagné quoi, pourquoi. « C'est valable pour tous les jeux. »
- Les résultats de chaque manche doivent être simples à lire (une phrase, pas un code).
- Des petits signes que personne ne comprend (« ces petits points ») sont à remplacer par quelque chose
  de parlant : une pastille verte quand l'adversaire est là, jaune quand il s'éloigne, rouge quand il est
  parti.

### Voir les autres, sans pouvoir les copier
- « Quand quelqu'un perd une épreuve, il doit pouvoir voir le gameplay de ses adversaires. » Pour tous
  les jeux.
- Voir ce que l'autre a mis : son prix, son nombre, son temps. « Ça peut être drôle. » Ajouter la
  progression en pourcentage (la phrase de la Dictée qui se remplit).
- **Mais** : « il y a des jeux où on ne doit pas savoir ce qu'il met en temps réel, comme le Petit Bac. »
  Chaque jeu a sa propre règle : voir ce qui amuse, jamais ce qui permet de recopier.
- Pendant qu'on joue, on doit savoir ce qui se passe chez les autres (« c'est pas très clair, on ne sait
  pas ce qui se passe chez les autres »).

### Équité et triche
- Pas de copier-coller : le nombre affiché ne se copie pas, et rien ne se colle dans la case de réponse.
- Même défi pour tous au même instant, ou chacun son propre défi de même difficulté. Jamais d'avantage
  de position.
- Les épreuves ne se répètent pas d'une partie à l'autre.
- Quand un joueur est parti, ne pas le remplacer en silence par un robot sans le dire.

### Contenu
- Une donnée affichée (un prix, une réponse) dit **d'où elle vient**. Les lots drôles sont acceptés,
  mais marqués « estimation » quand ils ne viennent pas d'un relevé.
- Beaucoup de variété (thèmes, catégories, lots). « Il n'y avait pas assez de catégories. »
- Des emojis seulement s'ils sont de vrais emojis ; sinon un dessin propre au jeu. Pas d'emoji à la place
  d'une illustration (voir la charte).
- Le son n'est pas une priorité.

### Concurrence et envie de rejouer (la demande du 29/10)
> « Fais une étude de marché : regarde sur les forums quelles mécaniques et quels mini-jeux sont adorés,
> ce qui rend addict. Le but est qu'à la fin le joueur ait envie de rejouer, qu'il soit à 100 % dans le
> jeu, qu'il pense qu'à ça et qu'il ait envie de gagner. Implémente cinq nouveaux jeux, et si tu trouves
> des mécaniques plus intéressantes sur les jeux existants, modifie-les : carte blanche. Il faut créer de
> la concurrence entre les joueurs, une interface fluide et belle pour qu'ils aient envie de rester. »

### Interface
- Épurée, « type Apple / iOS » : animations sobres, fluides, jamais « cheap » ni saccadées. La fluidité
  compte plus que la quantité d'effets.
- Tout tient sur une page, sans barre de défilement quand c'est possible ; l'ordinateur est la cible
  première (GameHub se joue sur ordinateur), le téléphone doit rester propre.
- « Il faut que ça ne ressemble pas à un jeu fait par une IA » : une vraie direction artistique, un
  univers (voir la charte). Mauvais Perdants = « Canal 7 », une chaîne de télé de 1978.
- Un chat libre dans le jeu, collé à droite, ouvert par défaut mais qu'on peut fermer.
- Des états clairs : qui joue, quand, qui est éliminé (« on ne sait pas qui doit jouer, c'est pas ouf »).

### Façon de travailler
- Tester **vraiment** dans un navigateur, à plusieurs joueurs, cache vidé, avant de dire que c'est fait ;
  ne pas se contenter de tests automatiques.
- Donner des **liens cliquables** à chaque fois que l'utilisateur doit ouvrir quelque chose.
- Ne jamais mentionner Claude ni Anthropic dans un commit ou une PR (règle de `CLAUDE.md`).
- Les sessions se parlent entre elles, jamais l'utilisateur ; on ne pousse pas le travail d'un autre.

## 2. Recherche : ce qui rend un mini-jeu clair et qu'on veut rejouer

Sources lues le 29-30/10/2026. **Ce que j'ai trouvé est mince** : les recherches web ont surtout rendu
des pages marketing et peu d'études ; je note donc ce qui est étayé par une source, et ce qui vient du
raisonnement de conception. Le terrain à approfondir est signalé à la fin.

**Étayé par une source**
- **Un verbe, tout de suite compris.** WarioWare donne une consigne d'un mot (« Pick! », « Eat! ») et
  jette le joueur dans l'action ; la règle de son créateur était que chaque microjeu soit « instantanément
  évident », au point de couper ceux trop obscurs. →
  [entretien Goro Abe](https://www.gamedeveloper.com/design/digging-into-the-creation-of-one-pick-ticular-i-warioware-i-minigame),
  [WarioWare](https://en.wikipedia.org/wiki/WarioWare). *Conséquence : une épreuve = un verbe, un geste.*
- **Manches courtes, enchaînées, variées.** Les jeux de fête (Mario Party, WarioWare) découpent la partie
  en défis de 20 secondes à 2 minutes, et la variété est citée comme raison de ne pas lâcher. →
  [Party video game](https://en.wikipedia.org/wiki/Party_video_game),
  [The condensed form of fun](https://www.gamedeveloper.com/design/the-condensed-form-of-fun).
  *Conséquence : 20 à 90 s par épreuve, jamais deux fois la même d'affilée.*
- **Enjeu léger, plaisir partagé.** Le résultat compte moins que le moment passé ensemble : perdre ne doit
  pas coûter cher, donc rejouer est facile. → [Party video game](https://en.wikipedia.org/wiki/Party_video_game).
  *Conséquence : revanche en un clic, points répartis (le dernier garde 2 points), ton taquin plutôt que dur.*
- **Un même défi pour tous, un résultat comparable.** Wordle : un seul puzzle partagé, un résultat qu'on
  compare sans le gâcher. → [Wordle](https://hackernoon.com/3-reasons-why-wordle-is-so-addicting).
  *Conséquence : mêmes données pour tous (graine commune), résultat résumé en une ligne.*
- **Clair d'abord, quiz compris à huit.** Buzz! est loué pour être compris tout de suite à huit joueurs. →
  [Buzz! The Hollywood Quiz](https://gamesradar.com/buzz-the-hollywood-quiz-review).
  *Conséquence : un quiz à choix multiples à rythme commun marche à 2 comme à 8.*
- **Retour immédiat et défi à la mesure du joueur (le « flow »).** Objectifs clairs, retour immédiat,
  difficulté adaptée. → [Flow](https://en.wikipedia.org/wiki/Flow_(psychology)).
  *Conséquence : chaque geste réagit tout de suite (moins de 0,1 s), la difficulté monte par paliers.*
- **« Juice » : du retour fort, mais pas trop.** Les effets rendent un geste satisfaisant, mais trop
  d'effets masquent ce qui compte ; il faut doser. →
  [Designing Game Feel](https://arxiv.org/pdf/2011.09201),
  [6 mistakes that drain the juice](https://www.gamedeveloper.com/design/6-mistakes-that-ll-drain-the-juice-out-of-your-game).
  *Conséquence : confirme la consigne « fluide, pas cheap » : peu d'effets, tous lisibles.*

**Raisonnement de conception (pas une source)**
- Ce qui fait rejouer : on **comprend pourquoi on a perdu** (bilan clair), on voit **l'écart** avec les
  autres (leur réponse, leur temps), et le jeu suivant démarre sans friction.
- Mélanger les facultés d'une partie : réflexes, mémoire, logique, culture, estimation. Un joueur faible
  dans une famille doit pouvoir gagner une autre manche.
- Le sentiment d'injustice tue l'envie de rejouer : même difficulté pour tous, pas d'avantage de position,
  aucune triche facile.

**À approfondir** : études sur la durée de session et la rétention des jeux occasionnels, avis de joueurs
sur Reddit (aucun fil n'est remonté), analyses de Jackbox (format hôte et public). Les recherches de ce
guide n'ont pas couvert ces points.

## 3. Les épreuves de Mauvais Perdants

| Famille | Épreuves |
| --- | --- |
| Vitesse | Le Gong (réaction), Le Stand de tir (visée), La Dictée (frappe), **La Question** (culture, vite) |
| Espace | Le Chemin, Les Numéros, Le Damier, L'Intrus, **Le Cadenas** (déduction) |
| Mémoire | Le Coffre (élimination par tours), Déjà vu ?, **Les Paires** |
| Mots | Le Petit Bac, Le Mot brouillé, L'Encre |
| Chiffres | Calcul express, Le Nuage, L'Étiquette, Le Chrono caché, Le Métronome, **Le Compte est bon**, **Dans l'ordre** |

En gras : les cinq épreuves ajoutées le 30/10 (voir `games/mauvais-perdants/js/rounds/`). L'univers du jeu est
une chaîne de télé de 1978 : les nouvelles épreuves reprennent des jeux télévisés (Question pour un
champion, Des chiffres et des lettres, Mastermind).

## 4. Recette : ajouter une épreuve à Mauvais Perdants

Une épreuve = deux fichiers + cinq lignes d'enregistrement. Le contrat est dans `js/rounds/contract.js`.

1. `js/rounds/<id>.js` : `id` (jamais renommé), `family`, `title`, `verb`, `rules` (2 ou 3 phrases courtes),
   `playMs` (20 à 90 s, sauf exceptions testées), `params(seed, i, room)` **déterministe** (même graine,
   même contenu), `score(payload, params)` **pur et défensif** (le payload vient d'un client non fiable :
   on rejoue la partie à partir des actions, on ne croit jamais un score déclaré), `ghost()` (score de
   référence de Gonzague en solo), `tieText()`.
2. `js/play/<id>.js` : l'interface, `mount(root, { p, submit, progress, sfx })` ; appeler `progress(n, sub)`
   pour partager l'avancement (voir `liveExtra` dans `main.js`) ; renvoyer `{ partial, destroy }`.
3. Enregistrer dans `js/rounds/index.js`, `js/play/index.js`, et **à la fin** de `PICK_ORDER` dans
   `js/draw.js` (un masque de bits : l'ordre ne change jamais).
4. `js/main.js` : une entrée dans `PROG` (texte d'avancement) ; au besoin `liveExtra` / `spectate` (ce qu'on voit
   de l'adversaire, avec la règle « jamais de quoi recopier »).
5. `js/ui/demos.js` : la carte animée « mode d'emploi » (trois légendes : regarde / agis / gagne) ;
   `js/lines.js` : la réplique d'introduction de l'animateur ; `css/show.css` : l'habillage.
6. Tests Node dans `tests/` (déterminisme, score, cas limites, triche), puis **une partie jouée dans un
   navigateur** (`tests/rounds.cjs`, `tests/multi.cjs`) et un contrôle visuel à deux joueurs.
7. Mettre à jour `docs/REPRISE-MAUVAIS-PERDANTS.md` et le tableau de la section 3.

Un jeu entier (pas une épreuve) suit la [charte](CHARTE-DES-JEUX.md) : dossier `DIRECTION.md` validé avant
la moindre ligne d'interface.

## 5. Liste à cocher avant de livrer une épreuve

- [ ] **Un verbe, un geste** : on comprend en jouant, moins de 30 secondes.
- [ ] Une **carte animée** (trois temps) explique la manche avant qu'elle commence.
- [ ] Les **points** et le **classement** sont clairs ; le résultat tient en une phrase.
- [ ] Chacun reçoit le **même défi** (ou un défi équivalent) ; aucune position n'avantage.
- [ ] On voit **ce qui fait la différence avec l'adversaire**, mais pas ce qui permet de **recopier**.
- [ ] Les **données affichées ont une source** (ou sont marquées « estimation »).
- [ ] **Anti-triche** : copier-coller bloqué, score recalculé côté coordinateur, pas de réponse lisible dans la page
      avant l'heure.
- [ ] Aucun **emoji** en guise d'illustration ; pas d'effets gratuits ; `prefers-reduced-motion` respecté.
- [ ] **Fluide** : réponse au geste en moins de 0,1 s, aucune barre de défilement inutile, mobile propre.
- [ ] Testé **dans un navigateur à plusieurs joueurs** (pas seulement Node), cache vidé, console sans erreur.
- [ ] Ce guide et la note de reprise sont à jour ; commit sans mention de Claude ni d'Anthropic.
