# Puissance 4 — direction artistique

## L'univers : « Conjonction »

En astronomie, quand des astres s'alignent, on parle de *conjonction*. C'est exactement le
but du jeu. Puissance 4 se joue donc la nuit, dans un observatoire : le plateau est posé sur
la table d'observation, sous la coupole ouverte. La lune éclaire la partie, les bougies
réchauffent la pièce. Le thème clair est la même salle, à l'aube.

| Élément | Décision | Pourquoi |
| --- | --- | --- |
| Décor | Photo de la table d'observation, nuit et aube, recadrée par le code pour que le plateau se pose sur la table à toutes les tailles d'écran | Un lieu, pas un fond ; la paire nuit/aube garde la même scène dans les deux thèmes |
| Plateau | Vraie 3D (Three.js) : noyer verni, ouvertures cerclées d'acier noirci, deux pieds d'acier | Un objet qui appartient à la salle ; les colonnes cliquables restent des boutons HTML |
| Lumière | Celle de la photo : lune en haut à gauche, bougies basses de part et d'autre ; la photo sert aussi de carte d'environnement (reflets) | Le plateau doit être éclairé par la pièce où il se trouve |
| Pions | Émaux au choix (rouge et bleu par défaut), marqués d'un point (hôte) ou d'un croissant (invité) | La marque distingue les joueurs même sans les couleurs |
| Typographie | Cinzel (logotype, titres, noms) et Tenor Sans (tour, scores, menus) | Capitales gravées de l'architecture classique, capitales de générique de film |
| Logotype | « PUISSANCE » en capitales romaines, un « 4 » dessiné qui porte un pion dans son creux | Un titre qu'on ne voit nulle part ailleurs |
| Victoire | Les quatre pions s'avancent, un anneau de lune les cercle, un fil de lumière les relie ; le reste passe dans l'ombre | La conjonction, littéralement ; le plateau reste lisible |
| Accueil | Ouverture d'environ 2,5 s : la salle sort du noir, quatre pions tombent en diagonale, le fil les relie | Une entrée en scène, une fois par visite, interrompue au premier clic |

## Mouvement

- Retour au clic sous 0,1 s : le pion « en main » s'enfonce dès l'envoi du coup, avant la
  réponse du serveur.
- Chute : accélération, contact, un seul rebond court, le plateau encaisse d'un pixel.
  Entre 220 et 470 ms selon la hauteur.
- Coup impossible : un hochement de 170 ms, sans alerte.
- Revanche : les pions glissent vers le bas, colonne par colonne, comme quand on ouvre la
  trappe d'un vrai plateau.
- `prefers-reduced-motion` : aucun déplacement, l'état final s'affiche tout de suite.

## Recherche

La recherche a guidé les arbitrages. Elle ne remplace pas les essais. « Résumé seul »
signifie qu'on n'a pas pu lire la source en entier.

| Source | Ce qu'on en retient | Décision |
| --- | --- | --- |
| Nielsen, *Response Times: The 3 Important Limits* — <https://www.nngroup.com/articles/response-times-3-important-limits/> | Sous 0,1 s, l'action paraît instantanée | Le pion réagit au clic avant la réponse du serveur |
| Laubheimer (NN/g), *Animation duration* — <https://www.nngroup.com/articles/animation-duration/> | Retour simple vers 100 ms, changements de 200 à 400 ms, jamais linéaire | Durées et courbes de la chute, du survol et des transitions |
| W3C, WCAG 2.2, 1.4.11 *Non-text Contrast* — <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html> | 3:1 pour les éléments graphiques ; ne pas compter sur la couleur seule | Marques point et croissant ; fond sombre dans les cavités |
| W3C, WCAG 2.2, 2.3.3 *Animation from Interactions* — <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html> | Pouvoir se passer des animations déclenchées | Mode mouvement réduit sur toute la page, ouverture comprise |
| Wikipédia, *Connect Four* — <https://en.wikipedia.org/wiki/Connect_Four> (renvoie à Allis et Allen, 1988) | Le premier joueur a l'avantage théorique, surtout en ouvrant au centre | Le premier joueur alterne à chaque manche |
| Zagal, Björk et Lewis, *Dark Patterns in the Design of Games* (FDG 2013) — <https://www.deceptive.design/articles/dark-patterns-in-the-design-of-games> (résumé seul) | Les mécanismes qui retiennent le joueur contre son intérêt | Revanche en un clic, sans minuterie ni récompense factice ; « Quitter » toujours visible |
| Ryan, Rigby et Przybylski (2006), *The motivational pull of video games*, Motivation and Emotion 30(4) (résumé seul) | L'autonomie et le sentiment de compétence prédisent le plaisir et l'envie de rejouer | Le choix des couleurs ; l'aperçu de chute pour jouer juste ; le score du match visible |
| Jonasson et Purho, *Juice it or lose it* (2012) — <https://www.youtube.com/watch?v=Fy0aCDmgnxg> (résumé seul) | Le retour d'impact donne du poids aux actions | Contact et rebond de la chute, dosés bien en dessous d'un jeu d'action |
