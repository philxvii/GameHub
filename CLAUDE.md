# GameHub — notes de travail

Site statique servi par GitHub Pages sur **roulia.me**. Pas de build, pas de
`package.json`. Un jeu = un fichier HTML autonome (CSS + JS inline).

**Pousser sur `main` déploie en production.**

---

## Économie de tokens — à lire en premier

`banqueroll.html` fait ~99 Ko, soit **~25 000 tokens** si tu le lis en entier.
Une capture d'écran que tu regardes coûte **~1 900 tokens**. Ne paie ces coûts
que quand ils sont justifiés.

**Localise avant de lire.** `grep -n "^function renderBoard" banqueroll.html`
coûte ~50 tokens et donne la ligne exacte ; lis ensuite la plage avec
`sed -n '640,660p'`. Ne charge jamais le fichier entier par réflexe.

**Modifie par script, pas par réécriture.** Les correctifs se font avec un petit
script Python en `scratchpad`, qui remplace des chaînes exactes avec une
assertion `count(old) == 1` et échoue bruyamment si le motif a bougé. Le fichier
ne transite jamais par le contexte. Une réécriture complète coûte 25 000 tokens ;
un script de correctif en coûte quelques centaines.

**Vérifie par le DOM, regarde seulement pour juger l'esthétique.** `node
tools/test-browser.js` interroge le DOM et renvoie une vingtaine de lignes de
texte. Une capture ne sert qu'à trancher une question visuelle — mise en page,
chevauchement, contraste perçu. Le texte ne les détecte pas : « MOSCOW » coupé en
« MOSCO / W » et les pions masquant les noms de villes n'ont été vus qu'en
regardant. Si le serveur MCP Playwright est disponible, ses instantanés
d'accessibilité en texte coûtent moins cher que les captures.

**Le portail statique est quasi gratuit.** `node tools/check-static.js` ne lance
aucun navigateur et couvre syntaxe, ordre du plateau, contrat DOM, dés et
contraste. Lance-le après chaque modification.

---

## Banqueroll — [banqueroll.html](banqueroll.html)

Jeu de plateau financier multijoueur, 2 à 8 joueurs, synchronisé par Firebase
Realtime Database sous le nœud `banqueroll/{CODE}`. Architecture
**client-autoritaire** : aucune logique serveur, chaque client calcule, et
**seul l'hôte** arbitre (résolution des enchères, expiration des tours, fin de
partie).

### Intouchable sans accord explicite

- **L'ordre des 28 cases.** Contrainte produit, figée, vérifiée par
  `tools/check-static.js`. Ne la réarrange jamais pour des raisons de design.
- Les règles, les prix, les loyers, le schéma Firebase, le protocole multijoueur.
- La logique de `rollDice` : les valeurs affichées par les dés **doivent** rester
  celles qui déplacent le pion.

### Repères

| Quoi | Où |
|---|---|
| Feuille de style unique | `<style id="banqueroll-ui">` |
| Données du plateau | `const BOARD` — 28 cases, Départ à l'**index 21** |
| Palette par ville | `const SQUARE_COLORS` |
| Disposition sur la grille 8×8 | `BOARD_LAYOUT` |
| Rendu | `renderState` → `renderObjective` / `renderBoard` / `renderAction` / `syncPawns` |
| Pions | `syncPawns`, `movePawn`, `pawnPath`, couche `#pawn-layer` |
| Dés | `DIE_PIPS`, `setDieValue`, `animateDiceRoll` |
| Arbitrage de l'hôte | `hostTick`, `enforceTurnDeadline`, `maybeResolveAuction`, `maybeFinishGame` |

### Pièges constatés

- **`renderBoard` ne doit pas réassigner `className`.** Il tourne à chaque mise à
  jour Firebase et effacerait l'état visuel transitoire (`just-bought`). Utilise
  `classList.toggle`. Le type de case est posé une fois dans `initBoard`.
- **`runTransaction` démarre avec `current === null`** si le cache local est
  froid, et s'annule. `joinGame` amorce donc le cache avec un `onValue` avant la
  transaction.
- **Les résolutions écrivent dans l'historique**, ce qui relance `renderState`
  avant propagation. Sans verrou local (`resolvedAuctionKey`, `finishedKey`…)
  elles bouclent et inondent l'historique.
- **Un onglet en arrière-plan voit ses timers bridés.** `animateDiceRoll` saute
  l'animation si `document.hidden`, sinon le verrou anti double-clic bloquait le
  lancer pendant des minutes.
- **Les onglets d'un même navigateur partagent `localStorage`** : impossible de
  tester deux joueurs distincts après un rechargement, le dernier écrase l'autre.
- **`handleBank()` est du code mort** depuis que la case Bank est devenue Dubai.
  Conservé pour que la décision reste réversible.
- **GSAP vient d'un CDN.** Tout est gardé par `hasGsap()` : sans lui le jeu reste
  jouable, sans animation. Testé par `node tools/test-browser.js --no-gsap`.
- Une position finale peut différer de `départ + dés` : une carte Chance
  redéplace après l'atterrissage. Compare toujours aux cases **annoncées par le
  moteur** dans l'historique.

### Décisions prises

- Départ = index 21, pas 0. La prime de 200 se calcule par franchissement
  (`crossesStart`), pas par dépassement de `BOARD.length`.
- Payer la caution ne fait **plus** perdre le tour (le texte promet « sortir
  immédiatement »).
- Chance → **Sydney**, Bank → **Dubai**, placeholder → **New York**, pour coller
  à la maquette de référence. Arbitré avec l'utilisateur.
- Victoire : 3 000 de valeur nette, ou meilleure fortune après 34 manches.
- Le bandeau coloré des cases reste en **aplat** : un dégradé ferait dériver le
  contraste, audité à 4.59:1 minimum.
- Le pion se pose à 80 % de la hauteur de la case, sous le nom de la ville.

### Limites connues

Pas de faillite (l'argent plancher à 0, le joueur continue). L'arbitrage dépend
de l'onglet de l'hôte : fermé ou longuement masqué, les enchères expirées et les
tours AFK ne sont plus résolus. Pas de liste publique des parties disponibles —
elle obligerait chaque visiteur à télécharger l'état et le chat de toutes les
parties.

---

## Tester

```bash
node tools/check-static.js            # ~2 s, sans navigateur — à lancer toujours
python -m http.server 4173            # puis, dans un autre terminal :
node tools/test-browser.js            # 21 contrôles, Chrome réel, 2 onglets
node tools/test-browser.js --shots    # + captures dans tools/shots/
node tools/test-browser.js --no-gsap  # repli quand le CDN est coupé
node tools/test-browser.js --preview  # fenêtre visible avec une partie de démo
```

Les suites créent de vraies parties Firebase et **les suppriment** ensuite. Si un
run s'interrompt, vérifie les résidus :

```bash
curl -s "https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll.json?shallow=true"
```

Détails dans [tools/README.md](tools/README.md).

---

## Convention de commit

- Identité en config **locale** du dépôt, jamais globale :
  `git config user.name "philxvii"` et
  `git config user.email "116272977+philxvii@users.noreply.github.com"`.
- Format `feat(scope): …` ou `fix(scope): …`, **en français, en minuscules, sans
  point final**. Corps en paragraphes courts.
- **Aucun trailer, aucun co-auteur, aucun lien de session.** Vérifie avec
  `git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'` avant de pousser.
- `git push origin main` normal. **Jamais `--force`** : l'historique a été
  réécrit, le repousser casserait tout.
- Ne commite rien sans demande explicite.

Sur une machine neuve, remets les exclusions locales — elles ne voyagent pas
avec git et évitent de salir le dépôt :

```bash
printf '%s\n' banqueroll.html.backup .hermes/ assets/ test_structural.py .vscode/ >> .git/info/exclude
```

## Autres jeux

`bataille-navale`, `mini-golf`, `puissance4`, `qui-est-ce`, `roulette`,
`undercover`, `uno`, `wikirace`, listés par `index.html`. Ils partagent le même
projet Firebase mais des nœuds distincts. **N'y touche pas** en travaillant sur
Banqueroll.
