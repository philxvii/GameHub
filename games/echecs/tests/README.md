# Tests des Échecs

```bash
node --test games/echecs/tests/rules.test.mjs   # règles et ordinateur, sans navigateur (< 3 s)
```

`rules.test.mjs` couvre :
- le générateur de coups, sur cinq positions de référence (perft) ;
- le roque (interdit en échec ou à travers une case attaquée), la prise en passant, les promotions
  et la levée d'ambiguïté de la notation ;
- les fins de partie : mat, pat, matériel insuffisant, triple répétition, cinquante coups ;
- la partie partagée : lancement, coups refusés (hors tour, illégal, état dépassé, partie finie),
  points, revanche aux couleurs échangées, nulle proposée et acceptée, pendule (ajout par coup,
  drapeau constaté) ;
- l'ordinateur : mat en un, parade d'une menace de mat, temps de réponse.

Les règles Firebase du nœud `ec` sont testées avec celles des autres jeux (`firebase/tests/`,
`npm test` dans `firebase/`, émulateurs et Java 21).
