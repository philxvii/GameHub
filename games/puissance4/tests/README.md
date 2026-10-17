# Tests de Puissance 4

```bash
node --test games/puissance4/tests/rules.test.mjs   # règles, sans navigateur (< 1 s)
node games/puissance4/tests/duo.cjs                 # deux joueurs dans Chrome, contre les émulateurs
node games/puissance4/tests/duo.cjs --shots=<dir>   # + captures (clair, sombre, mobile)
```

`rules.test.mjs` couvre les quatre directions de victoire, les lignes de cinq et les
doubles alignements, le match nul, les coups refusés (hors tour, colonne pleine,
partie finie, adversaire absent, état dépassé), la revanche et le nouveau match.

`duo.cjs` joue de vraies parties à deux comptes distincts, souris, doigt et clavier,
du salon à la revanche, à 1440×900 et 390×844, puis vérifie la mise en page de
360×640 à 1920×1080. Il demande les émulateurs Firebase et le site servi par
`firebase/tests/serve-emulated.js 4174` (même mise en place que
`firebase/tests/smoke-games.cjs`). Les parties créées sont supprimées à la fin.
