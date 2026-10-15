# Note de direction artistique (mission 3)

**Sources.** Les dix liens de la mission ont été tentés une fois chacun depuis le cloud : tous
refusés par le réseau (code 000, aucun contournement). La colonne « observé » vient donc de ce que
je sais de ces jeux et de ces textes, pas d'une lecture faite ici : à vérifier sur le PC si un point
compte.

| Source | Observé | Principe retenu |
| --- | --- | --- |
| Returnal (Housemarque, blog PlayStation) | L'interface parle la langue du monde du jeu, sans décor gratuit ; le HUD s'efface au profit de l'action ; un code couleur strict où une couleur signifie un état ; des transitions très courtes ; chaque retour visuel important a son retour sonore. | **Une couleur = un état** (à toi, à l'autre, oui, non, écarté). Transitions de 120 à 250 ms. Aucun ornement sans fonction. |
| Assassin's Creed Valhalla, accessibilité | Taille de texte réglable, fonds derrière les sous-titres, icônes agrandies, contrastes forts, pensée pour qui découvre l'interface. | Corps de texte ≥ 15 px, contraste AA partout, libellés en mots plutôt qu'en icônes seules. |
| Black Flag Resynced, HUD | Chaque élément du HUD a une raison d'être ; affichage contextuel ; préréglages « immersif » contre « complet ». | **Afficher au moment utile** : les questions quand c'est ton tour, la réponse quand elle arrive, rien d'autre en permanence. |
| Spider-Verse (Sony) | Une identité vient de règles propres (trait, trame, cadence), appliquées partout et outillées, pas d'un filtre posé à la fin. Silhouettes et expressions d'abord. | Des **règles écrites** (tokens, composants, mouvement) appliquées à tous les écrans ; personnages lisibles à la silhouette. |
| Red Dead Redemption 2 (Rockstar, GDC) | La crédibilité vient de détails de comportement : regard, micro-mouvements, réactions plausibles aux évènements, jamais de boucle mécanique visible. | Vie au repos **rare et variée** ; réactions liées aux évènements de la partie ; pas d'oscillation permanente. |
| Game feel (GDC, « Why your death animation sucks ») | Un retour réussi dit ce qui s'est passé, vite, avec anticipation, impact et suite ; son et image ensemble ; l'effet est proportionné à l'importance de l'action. | **Proportion** : une croix est un geste court, une question un échange, la révélation une scène. |
| MDN `prefers-reduced-motion`, WCAG 2.2 « Focus Appearance » | Réduire ou supprimer le mouvement non essentiel ; indicateur de focus épais, contrasté, jamais masqué. | Mode réduit complet (images fixes, fondus seulement) ; focus de 3 px contrasté sur tout élément actif. |

## Choix propres à Qui est-ce ?

- Le jeu est une **séance d'identification** : on regarde des visages, on écarte, on désigne. Les
  portraits sont les héros ; l'interface est la salle autour d'eux.
- Les cartes sont des **portraits de studio** : chaque personnage a son fond coloré (papier de studio
  de couleur, lumière douce), pas un gris uniforme ni un Polaroïd.
- Le **tour** se lit sans texte : une couleur et un emplacement (bandeau d'état unique).
- Le panneau latéral est **le carnet du joueur** : mon secret, la question en cours, les réponses de
  la manche. La planche adverse devient un compteur utile (« il lui reste N suspects »).
- Trois pistes ont été comparées sur le vrai écran ; voir `DECISIONS.md` pour le choix et ses raisons.

## Ce qu'on n'imite pas

- Le HUD d'action (barres, réticules, icônes militaires) : un jeu de déduction n'a pas d'urgence.
- L'esthétique Spider-Verse (trames, aberrations) : seulement sa discipline de règles.
- Le photoréalisme sombre de RDR2 : notre lumière est franche et chaleureuse.
- Banqueroll (tapis vert, papier, laiton, Gloock) : même niveau de finition, autre univers.
- Le Polaroïd, le scotch, le crayon gras, les polices manuscrites, l'orange mono sur noir : abandonnés.
