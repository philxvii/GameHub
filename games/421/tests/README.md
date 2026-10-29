# Tests du 421

```bash
node --test games/421/tests/rules.test.mjs   # règles et habitués, sans navigateur (< 1 s)
```

`rules.test.mjs` couvre l'ordre et la valeur des combinaisons, le nombre de lancers fixé par le
premier joueur, les dés gardés, les coups refusés (hors tour, dés invalides, état dépassé), la
charge, la décharge, les égalités, la fin de partie et la revanche, et 40 parties complètes jouées
par les habitués (2 à 7 joueurs) sans qu'un jeton se perde.

Les règles Firebase du nœud `qd` sont testées avec celles des autres jeux (`firebase/tests/`).
