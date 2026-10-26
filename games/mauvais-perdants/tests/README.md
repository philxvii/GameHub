# Tests de Mauvais Perdants

| Fichier | Quoi | Prérequis |
|---|---|---|
| `logic.test.mjs` | les 11 manches (succès, échec, égalité, bornes, entrées absurdes, déterminisme), barème, tirage, machine à états, Petit Bac (contrôles, correction, vote, barème), présentateur, texte joueur | Node 22+ |
| `ai.test.mjs` | Worker (correcteur, présentateur) : bascules, budgets, schéma, origine, taille, injection ; client IA ; absence de clé dans le code servi | Node 22+ |
| `sim.mjs` | simulation du barème (finale ×1 / ×2), aussi appelée par `logic.test.mjs` | Node |
| `../../../firebase/tests/mauvais-perdants.test.js` | règles de la base `mp/` (13 cas) | émulateur |
| `multi.cjs` | **4 Chrome réels** (3 joueurs, dont un mobile, + 1 écran de scène), 3 tournois : salon, mauvais code, tirage commun, 5 manches jouées par l'interface, Petit Bac avec IA simulée et vote, rechargement d'un joueur, podium identique, revanche avec IA en panne (jury), retour au salon, relève de l'hôte | émulateurs + site + IA simulée |
| `rounds.cjs` | 3 Chrome, 2 tournois choisis pour jouer par l'interface les manches que `multi.cjs` ne tire pas | émulateurs + site |
| `solo.cjs` | 1 Chrome mobile : « Jouer seul », 5 manches contre Gonzague, podium, revanche | émulateurs + site |
| `bot.js` | joueur automatique injecté par les deux précédents : il joue par les vrais éléments de l'interface | — |
| `ai-mock.mjs` | le vrai Worker exécuté dans Node, fournisseurs simulés (`/mode?m=ok\|slow\|bad\|down\|quota`) | — |
| `cover.cjs` | génère `cover.webp` (affiche du hub) | Chrome |

```bash
node --test games/mauvais-perdants/tests/*.test.mjs

# navigateur : trois terminaux, puis le test
cd firebase && npx firebase emulators:start --only database,auth --project demo-gamehub   # Java 21+
node firebase/tests/serve-emulated.js 4174
node games/mauvais-perdants/tests/ai-mock.mjs 8787
node games/mauvais-perdants/tests/multi.cjs
node games/mauvais-perdants/tests/rounds.cjs
```

Les captures sont écrites dans `../docs/captures/`.
