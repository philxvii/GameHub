# Mauvais Perdants : recherche et décisions de conception

Cette synthèse a servi à concevoir le tournoi multijoueur de mini-jeux de GameHub. Elle
distingue trois sortes de sources : la **recherche publiée**, les **conseils de studio**,
et les **témoignages de joueurs**. Ces derniers sont des signaux, pas des preuves.

Limite : plusieurs articles n'ont été consultés qu'à travers leur résumé et des
présentations secondaires, car le texte intégral était inaccessible depuis ce poste
(PMC renvoyait une vérification anti-robot, Reddit refusait les requêtes). Les tailles
d'effet n'ont donc pas été vérifiées.

## 1. Ce que dit la recherche publiée

| Source | Ce qu'on en retient | Conséquence pour le jeu |
|---|---|---|
| Moller, Kornfield & Lu, *Competition and Digital Game Design: A Self-Determination Theory Perspective*, Interacting with Computers, 2024 (manuscrit PMC12412733) | La compétition aide la motivation quand elle nourrit le sentiment de compétence et le lien social. Elle nuit quand elle semble contrôlante ou injuste. L'article propose une taxonomie des formes de compétition. | Rien de caché : les règles et le barème sont affichés avant chaque manche. On joue entre amis, en même temps, et le feedback porte sur la performance. |
| Sailer et al., *How gamification motivates*, Computers in Human Behavior 69, 2017 | Badges, classements et graphiques de performance renforcent le sentiment de compétence. Avatars, histoire et coéquipiers renforcent le lien social. La liberté de décision n'a pas été modifiée. | Un classement lisible après chaque manche, avec les points gagnés et les écarts. Des titres de fin seulement s'ils sont **calculés**. Un présentateur incarné pour le lien social. |
| Oliveira & Hamari, *Flow Experience in Gameful Approaches*, IJHCI, 2025 | Revue de la littérature : le flow se mesure surtout par questionnaire. Les conditions classiques sont un objectif clair, un retour immédiat et un défi ajusté au niveau. | Une seule action par manche, des consignes en trois lignes, un retour à chaque geste (✓ / ✕, vies, compteur), et une difficulté qui monte par paliers identiques pour tous. |
| Yip, Schweitzer & Nurmohamed, *Trash-talking*, OBHDP 144, 2018 | Le trash-talk renforce la rivalité et l'effort dans les tâches d'effort. Il nuit aux tâches créatives et peut pousser à tricher. | Le présentateur provoque, mais **sur le jeu** et **après coup**, pas pendant l'action. Le Petit Bac, la manche créative, n'est commenté qu'après correction. Côté triche, les règles de la base refusent les réponses tardives, rejouées ou écrites pour un autre joueur, et le coordinateur recalcule chaque score. |
| Kim et al. / Cognitive behavioral game design (PMC3910127) | Engagement, défi et feedback mènent à la maîtrise. | Les manches de mémoire montent par paliers ; on sait toujours pourquoi la partie s'arrête (erreur, vies, chrono). |
| Arnedo-Moreno et al., *Dark patterns and random reward mechanisms… youth*, Entertainment Computing 57, 2026 | 15 études : une association forte (corrélationnelle) entre récompenses aléatoires, dark patterns et jeu problématique chez les 15-24 ans. | **Rejeté** : récompenses aléatoires, butin, séries quotidiennes, notifications, pénalité de départ, messages culpabilisants. Le hasard ne choisit que **quelles** manches on joue. La fin est nette et on peut fermer la page sans rien perdre. |

## 2. Conseils de studios et d'observateurs

| Source | Ce qu'on en retient | Conséquence |
|---|---|---|
| Built In Chicago, principes de design de Jackbox | Le téléphone sert de manette, sans application. Une action à la fois. On sait toujours ce qu'on attend de nous. Un présentateur qui semble réagir. Une présentation de télévision. | Code de salon, aucun compte, aucune installation. Chaque écran a **une** action principale. La machine à états suit le rythme d'une émission : annonce, compte à rebours, action, verrouillage, révélation, classement. |
| Jackbox, participation du public | Au-delà du nombre maximal de joueurs, le public vote ou joue à part. | Un **écran de scène** (télé, ordinateur) qui ne joue pas mais montre tout : course en direct, résultats, classement. Le vote du Petit Bac est réservé aux joueurs. |
| Critiques des *Pro Rules* de Mario Party Jamboree (The Sixth Axis, God is a Geek) | Les joueurs compétitifs détestent les bonus de fin imprévisibles et la chance qui annule le talent. Les *Pro Rules* **annoncent à l'avance** le bonus de fin. | Aucune étoile bonus ni case chance. Le seul « bonus » est la manche finale **doublée, annoncée dès le salon**, et la fanfaronnade, **choisie par le joueur et annoncée**. |

## 3. Témoignages de joueurs (non vérifiés)

Les fils Reddit cités dans la mission n'ont pas pu être lus (accès refusé depuis l'outil).
On s'appuie donc sur ce qu'en disent la mission et les articles ci-dessus, sans les
présenter comme établis : de la variété, des règles comprises en quelques secondes, peu
de temps mort, pas de reconfiguration entre deux parties, et une frustration
« comique » plutôt que de l'injustice.

Ce qu'on en a tiré :
- une revanche en un clic, avec un nouveau tirage et les mêmes joueurs ;
- pas d'élimination : tout le monde joue chaque manche ;
- des manches de 20 à 70 secondes, qui s'arrêtent dès que tout le monde a fini.

## 4. Décisions

**Retenues**
- **Cinq familles, une manche par famille** : vitesse, espace, mémoire, mots, chiffres.
  Cinq tâches réellement différentes, jamais la même manche deux fois.
- **Points selon la place** (10 au premier, 2 au dernier, répartis régulièrement de 2 à
  8 joueurs). On n'additionne jamais des ms avec des niveaux.
- **5e manche à points doublés.** La simulation (`games/mauvais-perdants/tests/sim.mjs`,
  4 000 tournois par cas) a tranché :

  | Joueurs | Le plus fort gagne, ×1 → ×2 | Vainqueur acquis avant la 5e manche, ×1 → ×2 |
  |---|---|---|
  | 2 | 84 % → 82 % | 80 % → 41 % |
  | 4 | 72 % → 71 % | 38 % → 6 % |
  | 8 | 65 % → 64 % | 9 % → 0 % |

  Le doublement coûte 1 à 2 points de justesse et supprime la plupart des fins
  jouées d'avance. On le retient donc, et on l'annonce partout.
- **Fanfaronnade** : un bouton « Facile. » avant chaque manche. +3 si on gagne la
  manche, −3 en entier si on finit dans la moitié basse (pas de plancher : sinon, à deux
  ou trois joueurs, fanfaronner deviendrait automatique). C'est un vrai pari, visible de tous,
  et le présentateur s'en sert. Il remplace le « joueur qui se vantait » qu'on ne
  pourrait pas mesurer autrement.
- **Le présentateur ne juge que des faits mesurés** : place, résultat affiché, faux
  départs, tirs ratés, réponses refusées, chute au classement. Deux intensités, plus
  une option de grossièretés à cocher.
- **Le Petit Bac à correcteur IA** : le code vérifie la lettre, les doublons et les
  délais. L'IA ne juge que l'appartenance à la catégorie, par lot, sans pseudo. Le
  code applique le barème. Une réponse douteuse est acceptée sauf si au moins deux
  autres joueurs, et la majorité, la refusent : un joueur seul ne peut pas faire tomber
  la réponse d'un autre, sauf en duel, où il est le seul juge possible. Si l'IA est indisponible, tous les joueurs deviennent
  le jury. Le Petit Bac ne tombe jamais en finale ×2.

**Rejetées**
- Coefficients cachés, rattrapage automatique (« carapace bleue »), difficulté ajustée
  au score : cela fausserait le résultat.
- L'élimination en cours de tournoi : des joueurs attendraient sans jouer.
- Le score « mots par minute » brut sur des textes différents : tout le monde tape la
  même phrase, et la Dictée est retirée si les claviers sont mélangés. Le Gong aussi :
  l'écart de latence entre écran tactile et souris dépasse les écarts entre joueurs.
- Un signal sonore au Gong : la latence audio varie selon l'appareil.
- Les catégories du Petit Bac trop contestables (célébrités, marques, films, couleurs).
- Les questions de culture générale (« Vrai ou bluff », estimation de faits) : il
  faudrait des faits vérifiés et datés. On a préféré deux manches dont la réponse est
  **générée par le code**, donc toujours juste : Calcul express et Le Nuage.
