# 421 : direction artistique

## L'univers : « Le zinc »

Le comptoir d'un bistrot : un tapis de feutrine verte, trois dés d'os et des jetons rouges. Le jour, murs crème et comptoir de zinc ; la
nuit, boiseries sombres et l'enseigne « 421 » au néon rouge.

| Élément | Décision | Pourquoi |
| --- | --- | --- |
| Décor | Mur et comptoir de zinc en dégradés CSS, léger vignettage | Le lieu sans alourdir la page |
| Tapis | Simple : feutrine verte aux coins arrondis, liseré clair, ombre douce (CSS). Les versions plus chargées (piste ronde, cuir capitonné, socle de noyer) ont été essayées et abandonnées | La lisibilité d'abord ; les dés portent le relief |
| Table | Chaque joueur a sa place autour de la piste (nom, jetons empilés, dés de la manche) ; la mienne en bas avec mes boutons ; le pot posé sur la piste | Une vraie table de jeu, lisible d’un coup d’œil |
| Dés | Vrais dés 3D (Three.js, `dice3d.js`) vus presque d'en haut : os verni, arêtes arrondies, points creusés, ombre sur le tapis ; rendus seulement pendant un lancer. Repli en cubes CSS sans WebGL | Les cubes CSS faisaient faux ; ici la 3D se voit vraiment (vue de trois quarts, roulis, lumière) |
| Jetons | Rouges, tranche rayée de crème, empilés | Les jetons de bistrot |
| Enseigne | « 421 » en Fraunces très gras : émail rouge le jour, néon qui grésille la nuit | Une enseigne, pas un titre |
| Typographie | Fraunces (titres, noms, combinaisons) et DM Sans (texte) | Le serif rond des vitrines, une sans-serif lisible pour les règles |
| Joueurs ordinateur | « Les habitués » : Gégé, Josiane, Mimile, Le Patron… | Le comptoir a ses figures |

## Mouvement

- Lancer : les dés arrivent du bord de la piste en tournant, rebondissent et se posent (900 ms,
  décalés de 90 ms) ; les dés gardés ne bougent pas, soulevés et cerclés de laiton.
- Fin de manche : les jetons volent du pot (charge) ou du gagnant (décharge) vers le perdant.
- La carte du joueur au trait avance et se cercle de rouge.
- Accueil : les dés de la vitrine roulent de temps en temps, et sortent parfois un 421.
- Thème : fondu de 0,2 s, immédiat. `prefers-reduced-motion` : les dés se posent sans rouler.

## Règles retenues

Charge puis décharge, 21 jetons. Combinaisons : 421 (10 jetons), trois as (7), un dé et deux as
(sa valeur, 6 à 2), brelans (3), suites (2), le reste (1), la nénette 2-2-1 la plus faible. Le premier
de la manche fixe le nombre de lancers des suivants. À égalité, le plus mauvais est le dernier à
avoir joué. En décharge, le gagnant ne donne que les jetons qu'il a. Un joueur qui quitte une
partie en cours est remplacé par un habitué ; l'hôte joue pour un absent au bout de 25 s.
