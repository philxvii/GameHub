# GameHub — notes de travail

Site statique servi par GitHub Pages sur **roulia.me**. Pas de build, pas de
`package.json`. Un jeu = un fichier HTML autonome (CSS + JS inline), sauf
Banqueroll, découpé en modules ES natifs sous `banqueroll/`.

**Pousser sur `main` déploie en production.**

---

## Économie de tokens — à lire en premier

Banqueroll est découpé en modules (voir plus bas) : **ouvre le module concerné,
pas tout le dossier**. `grep -n "^export function" banqueroll/js/*.js` donne la
carte en ~200 tokens. Une capture d'écran que tu regardes coûte **~1 900 tokens**.

**Modifie par script ou par Edit ciblé**, avec une assertion `count(old) == 1`
quand tu passes par Python : le correctif échoue bruyamment si le motif a bougé.

**Vérifie par le DOM, regarde seulement pour juger l'esthétique.** `node
tools/test-browser.js` interroge le DOM. Une capture ne sert qu'à trancher une
question visuelle — mise en page, chevauchement, contraste perçu. Le texte ne les
détecte pas : un nom de ville masqué par un pion ou un libellé de roue illisible
n'ont été vus qu'en regardant.

**Le portail statique est quasi gratuit.** `node tools/check-static.js` ne lance
aucun navigateur et importe les modules purs : plateau, règles, Chance, répliques,
Worker IA. Lance-le après chaque modification.

---

## Banqueroll — [banqueroll.html](banqueroll.html) + [banqueroll/](banqueroll/)

Jeu de plateau financier multijoueur, 2 à 8 joueurs, synchronisé par Firebase
Realtime Database sous le nœud `banqueroll/{CODE}`. Architecture
**client-autoritaire** : aucune logique serveur. Le client du joueur actif calcule
et écrit son tour ; **seul l'hôte** arbitre ce qui expire (enchères, échanges,
tours AFK, roue abandonnée), les faillites et la fin de partie.

`banqueroll.html` reste le point d'entrée (l'URL publique ne change pas) et ne
contient que le HTML. Pas de build : modules ES natifs servis tels quels.

| Module | Rôle | Pur ? |
|---|---|---|
| `js/board.js` | 28 cases, groupes, couleurs, grille, contraste, élision (`de`, `que`) | oui |
| `js/rules.js` | loyers, bâtiments, fortune, fin de tour (`planNextTurn`), faillite, victoire | oui |
| `js/chance.js` | cartes, dilemmes, roue : tirage (`drawChance`) puis résolutions | oui |
| `js/lines.js` | répliques locales du présentateur | oui |
| `js/net.js` | Firebase + état de session `S` | — |
| `js/actions.js` | actions des joueurs, arbitrage de l'hôte (`hostArbitrate`) | — |
| `js/render.js` | état → DOM, overlays Chance, fiche de case, victoire | — |
| `js/fx.js` | dé 3D (WAAPI), pions (GSAP), roue SVG, pièces, toasts | — |
| `js/presenter.js` | présentateur : évènements, intensité, mémoire, IA | — |
| `js/main.js` | câblage, délégation des clics `data-act` | — |
| `css/*.css` | base (boutons, lobby), game (mise en page), board, overlays | — |
| `../ai-host/` | Worker Cloudflare → OpenRouter (modèle gratuit) | — |

Les modules purs renvoient des **mises à jour Firebase** (`{ 'players/0/cash': … }`)
sans rien écrire : `actions.js` les commite. Ajoute de la logique de règle dans
`rules.js` ou `chance.js`, pas dans le rendu.

### Intouchable sans accord explicite

- **L'ordre des 28 cases.** Contrainte produit, figée, vérifiée par
  `tools/check-static.js`. Ne la réarrange jamais pour des raisons de design.
- Les règles, les prix, les loyers, le barème des bâtiments, le schéma Firebase,
  le protocole multijoueur.
- La valeur du dé : celle que tire `rollDice` est celle qu'affiche le dé **et**
  celle qui déplace le pion. L'animation ne fait que la mettre en scène.
- **Le hasard est tiré une fois**, par un seul client, puis stocké dans l'état
  (`game.event`, `game.lastRoll`). Les autres clients animent, ne tirent jamais.
- Le présentateur et l'IA n'écrivent que dans `chat/` et `hostMem/`.
- Aucune clé d'IA dans le frontend (vérifié par `check-static`).

### Pièges constatés

- **Le rendu ne réassigne jamais `className`.** Il tourne à chaque mise à jour
  Firebase et effacerait les états transitoires (`just-bought`, `landed`,
  `just-built`). Les cases utilisent `classList.toggle` ; le type est posé une fois
  dans `initBoard`.
- **`runTransaction` démarre avec `current === null`** si le cache local est
  froid, et s'annule. `joinGame` amorce donc le cache avec un `onValue` avant la
  transaction.
- **Les résolutions écrivent dans l'historique**, ce qui relance le rendu avant
  propagation. Sans verrou local (`guards` dans `actions.js`) elles bouclent.
- **Un onglet en arrière-plan voit ses timers bridés.** Les animations sont
  sautées si `document.hidden`.
- **Les onglets d'un même navigateur partagent `localStorage`** : impossible de
  tester deux joueurs distincts après un rechargement. Les tests changent l'URL
  avec `history.replaceState` au lieu de recharger.
- **`#s-game` doit rester `flex:none`.** Avec `flex:1` (base 0 %) sa hauteur
  `100dvh` était ignorée et l'écran grandissait avec le chat.
- **Grille du jeu : rangées explicites** (`grid-row`). Le bandeau joueurs est masqué
  sur desktop ; sans elles, le plateau retombait dans une rangée `auto` et rétrécissait.
- **Tiroir mobile fermé = `display:none`.** Translaté hors écran, il élargissait
  la page à 767 px sur un écran de 390.
- **Le pion se pose à 87 % de la hauteur de la case**, dans une zone basse réservée :
  le nom et les bâtiments restent visibles au-dessus.
- **GSAP vient d'un CDN** et ne sert qu'aux trajets des pions. Sans lui, pions
  posés directement ; dé, roue et effets passent par la Web Animations API.
  Testé par `node tools/test-browser.js --no-gsap`.
- Une position finale peut différer de `départ + dé` : une carte Chance redéplace
  après l'atterrissage. Compare toujours aux cases **annoncées par le moteur**.

### Décisions prises

Arbitrées avec l'utilisateur le 2026-10-06, à partir de `regles_bankroll.md` et
de la capture de référence :

- **Prix et groupes = fichier de règles.** Les anciens prix venaient en partie des
  pastilles de *loyer* de la capture (Berlin 20, Riyadh 35…). Rio = 100 $ (les
  règles indiquaient 10 $, qui est aussi un loyer).
- **Bangkok n'existe pas** : sa place est un Event (disposition imposée). Le groupe
  bleu clair = Madrid + Cairo. Pas d'Electricity non plus.
- **Une couleur par groupe** (Sydney brune, Toronto et Seoul orange, Riyadh vert foncé).
- **Dé unique**, un 6 fait rejouer, sauf si le tour finit en prison ou en faillite.
- **Barème maison des bâtiments** (non fixé par les règles) : un bâtiment coûte
  50 % du prix ; loyer nu 10 % du prix, ×2 avec le groupe complet, ×4 / ×7 / ×10
  avec 1, 2 ou 3 bâtiments. La fortune nette inclut les bâtiments. On construit en
  début de tour, avant le lancer. Une ville bâtie ne s'échange pas.
- Propriétés publiques : 50 $ × nombre possédé (Railway, Airport, Boat).
- Prison : tomber sur Jail = 3 tours ; caution 150 $, et payer **ne fait pas**
  perdre le tour.
- Case Auction = échange de propriétés, +100 $ pour chacun. L'enchère en argent
  reste disponible quand on refuse un achat.
- Vente à 80 % pendant son tour. Faillite si argent < −500 $ ou fortune ≤ 0 : les
  propriétés retournent à la banque.
- Objectif 3 000 / 5 000 / 7 000 $, 30 / 50 manches ou sans limite (34 pour les
  anciennes parties sans `settings`). Ordre tiré au sort ; bonus de retard de
  +25 $ par rang (règle maison).
- Chance : 42 % cartes, 32 % dilemmes, 26 % roue. Les segments de la roue sont
  proportionnels à leur probabilité.
- IA : **100 % gratuite**. Cloudflare Worker + OpenRouter `openrouter/free`, déployé sur
  `https://banqueroll-host.banqueroll-host.workers.dev` (`AI_ENDPOINT` dans `presenter.js`).
  Sur localhost, `?ai=off` coupe l'IA et `?ai=<url>` la redirige : la suite de tests
  tourne en `?ai=off` pour rester reproductible et ne pas consommer le quota.
- Le bandeau coloré des cases reste en **aplat** (contraste ≥ 4.5:1 audité).

### Limites connues

L'arbitrage et le présentateur dépendent de l'onglet de l'hôte : fermé ou
longuement masqué, les enchères expirées et les tours AFK ne sont plus résolus, et
le présentateur se tait. Pas de liste publique des parties disponibles. Les quotas
gratuits d'OpenRouter (50 requêtes par jour sans crédit) limitent l'IA : au-delà,
répliques locales.

---

## Tester

```bash
node tools/check-static.js            # ~2 s, sans navigateur — à lancer toujours
python -m http.server 4173            # puis, dans un autre terminal :
node tools/test-browser.js            # 41 contrôles, Chrome réel, 2 joueurs, IA simulée
node tools/test-browser.js --shots    # + captures dans tools/shots/
node tools/test-browser.js --no-gsap  # repli quand le CDN est coupé
node tools/test-browser.js --preview  # fenêtre visible avec une partie de démo
node tools/ai-mock.js                 # Worker IA local, amont simulé (port 8787)
```

Les suites créent de vraies parties Firebase et **les suppriment** ensuite. Si un
run s'interrompt, vérifie les résidus :

```bash
curl -s "https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll.json?shallow=true"
```

Détails dans [tools/README.md](tools/README.md) et [ai-host/README.md](ai-host/README.md).

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
printf '%s\n' banqueroll.html.backup .hermes/ assets/ test_structural.py .vscode/ tools/shots/ >> .git/info/exclude
```

## Autres jeux

`bataille-navale`, `mini-golf`, `puissance4`, `qui-est-ce`, `roulette`,
`undercover`, `uno`, `wikirace`, listés par `index.html`. Ils partagent le même
projet Firebase mais des nœuds distincts. **N'y touche pas** en travaillant sur
Banqueroll.
