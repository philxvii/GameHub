# GameHub — notes de travail

Site statique servi par GitHub Pages sur **roulia.me**. Pas de build, pas de
`package.json`. Chaque jeu vit dans `games/<jeu>/`, entrée `index.html`. Un jeu =
un fichier HTML autonome (CSS + JS inline), sauf Banqueroll, découpé en modules ES
natifs.

```
index.html          hub (cartes → games/<jeu>/)
<jeu>.html          pages relais des anciennes URL publiques (une par jeu)
banqueroll/         relais du raccourci historique roulia.me/banqueroll/
games/<jeu>/        tout le jeu : entrée, JS, CSS, assets, tests, annexes
tools/              commun : check-links.js (structure), cdp.js (pilote Chrome)
favicon.svg/.ico    icône du site (dé champagne) + apple-touch-icon.png ; les jeux héritent du .ico
```

Les pages relais renvoient vers `games/<jeu>/` en gardant `?query` et `#hash`.
Ne les supprime pas, n'y mets aucun code de jeu. Un chemin d'un jeu ne sort pas de
son dossier, sauf le retour au hub (`../../index.html`). `shared/` n'existe pas
encore : il n'accueillera que du code réellement commun (candidats : la config
Firebase copiée dans 9 fichiers, le filtre de prénoms `isBannedName` copié dans 5).

**Pousser sur `main` déploie en production.**

---

## Économie de tokens — à lire en premier

Banqueroll est découpé en modules (voir plus bas) : **ouvre le module concerné,
pas tout le dossier**. `grep -n "^export function" games/banqueroll/js/*.js` donne la
carte en ~200 tokens. Une capture d'écran que tu regardes coûte **~1 900 tokens**.

**Modifie par script ou par Edit ciblé**, avec une assertion `count(old) == 1`
quand tu passes par Python : le correctif échoue bruyamment si le motif a bougé.

**Vérifie par le DOM, regarde seulement pour juger l'esthétique.** `node
games/banqueroll/tests/test-browser.js` interroge le DOM. Une capture ne sert qu'à trancher une
question visuelle — mise en page, chevauchement, contraste perçu. Le texte ne les
détecte pas : un nom de ville masqué par un pion ou un libellé de roue illisible
n'ont été vus qu'en regardant.

**Le portail statique est quasi gratuit.** `node games/banqueroll/tests/check-static.js` ne lance
aucun navigateur et importe les modules purs : plateau, règles, Chance, répliques,
Worker IA. Lance-le après chaque modification.

---

## Banqueroll — [games/banqueroll/](games/banqueroll/)

Jeu de plateau financier multijoueur, 2 à 8 joueurs, synchronisé par Firebase
Realtime Database sous le nœud `banqueroll/{CODE}`. Architecture
**client-autoritaire** : aucune logique serveur. Le client du joueur actif calcule
et écrit son tour ; **seul l'hôte** arbitre ce qui expire (enchères, échanges,
tours AFK, roue abandonnée), les faillites et la fin de partie.

`games/banqueroll/index.html` est le point d'entrée et ne contient que le HTML.
L'ancienne URL `banqueroll.html` et le raccourci `/banqueroll/` sont des relais. Pas de build : modules ES natifs servis tels quels.

| Module | Rôle | Pur ? |
|---|---|---|
| `js/board.js` | 28 cases, groupes, couleurs, grille, contraste, élision (`de`, `que`) | oui |
| `js/rules.js` | loyers, bâtiments, fortune, fin de tour (`planNextTurn`), faillite, victoire | oui |
| `js/chance.js` | cartes, dilemmes, roue : tirage (`drawChance`) puis résolutions | oui |
| `js/lines.js` | répliques locales du présentateur | oui |
| `js/net.js` | Firebase + état de session `S` | — |
| `js/actions.js` | actions des joueurs, arbitrage de l'hôte (`hostArbitrate`) | — |
| `js/render.js` | état → DOM, overlays Chance, fiche de case, victoire | — |
| `js/fx.js` | dé 3D (WAAPI), trajets des pions case par case (GSAP, repli WAAPI), roue SVG, pièces, toasts | — |
| `js/presenter.js` | présentateur : évènements, intensité 0–5, chrono, mémoire du chat, IA, badge de source | — |
| `js/bot.js` | bots joués par le client de l'hôte avec les actions des humains (`by`) | — |
| `js/main.js` | câblage, délégation des clics `data-act` | — |
| `css/*.css` | base (boutons, lobby), game (mise en page), board, overlays | — |
| `ai-host/` | Worker Cloudflare gratuit : Gemini → OpenRouter → Workers AI → réplique locale | — |

Les modules purs renvoient des **mises à jour Firebase** (`{ 'players/0/cash': … }`)
sans rien écrire : `actions.js` les commite. Ajoute de la logique de règle dans
`rules.js` ou `chance.js`, pas dans le rendu.

### Intouchable sans accord explicite

- **L'ordre des 28 cases.** Contrainte produit, figée, vérifiée par
  `tests/check-static.js`. Ne la réarrange jamais pour des raisons de design.
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
- **Un pion en route ne doit jamais être reposé.** La ligne d'historique écrite juste
  après le déplacement relance le rendu : avant la map `moving` de `fx.js`, ce rendu
  reposait le pion à destination et l'animation disparaissait (« téléport »).
- **Firebase refuse `undefined`** dans une écriture : un champ facultatif s'ajoute
  par décomposition conditionnelle (`...(x ? { boast: true } : {})`), sinon toute
  l'écriture échoue (la mémoire du présentateur n'était jamais sauvegardée).
- **`renderOverlay` ferme les overlays qu'il ne connaît pas** : un nouveau mode
  (comme `event`) doit être ajouté à sa liste, sinon il se referme aussitôt.
- **Tests : une fenêtre par joueur** (`newWindow` dans `tools/cdp.js`). En onglets,
  Chrome sans fenêtre ne dessine que l'onglet au premier plan et les animations de
  l'autre joueur ne progressent pas.
- **Le pion se pose à 87 % de la hauteur de la case**, dans une zone basse réservée :
  le nom et les bâtiments restent visibles au-dessus.
- **GSAP vient d'un CDN** et ne sert qu'aux trajets des pions. Sans lui, pions
  posés directement ; dé, roue et effets passent par la Web Animations API.
  Testé par `node games/banqueroll/tests/test-browser.js --no-gsap`.
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
- **Départ : 1 000 $** (2026-10-07), plus le bonus de retard de la règle 2 :
  +25 $ par rang de passage (règle maison) → 1 000, 1 025, 1 050…
- Objectif 3 000 / 5 000 / 7 000 $, 30 / 50 manches ou sans limite (34 pour les
  anciennes parties sans `settings`). Ordre tiré au sort.
- **Case EVENT** : mécanique héritée, conservée telle quelle (gain ou perte de
  100 à 160 $, tirée par le joueur actif). Elle a désormais une carte visible.
- Chance : 42 % cartes, 32 % dilemmes, 26 % roue. Les segments de la roue sont
  proportionnels à leur probabilité.
- IA : Worker Cloudflare `https://banqueroll-host.banqueroll-host.workers.dev`
  (`AI_ENDPOINT` dans `presenter.js`). **100 % gratuit** (2026-10-07) : Gemini, puis
  OpenRouter, puis Workers AI (binding `AI`, sans clé, 10 000 neurons/jour, Llama 3.3 70B),
  ordre fixe ; un fournisseur sans clé est sauté, échec / délai / quota → suivant →
  réplique locale. 7 s par fournisseur, le dernier prend le reste des 20 s. Workers AI
  a été ajouté le jour où Gemini (503) et OpenRouter (quota) étaient tombés ensemble.
  OpenAI a été retiré : pas de fournisseur payant. Le Worker retire les émojis.
  Modèles Gemini : `gemini-3.5-flash-lite` (≈ 1 s), puis `gemini-3.1-flash-lite` (≈ 2 s)
  s'il cale plus de 5 s (2026-10-07 : lenteurs passagères de l'offre gratuite). `gemini-2.5-flash` n'est plus ouvert
  aux nouveaux comptes, `gemini-3.8-flash` est saturé sur l'offre gratuite ; Gemini 3
  refuse `thinkingLevel: minimal`, on envoie `low`. Diagnostic : le Worker journalise le
  code et le message d'erreur du fournisseur (jamais la clé).
  Pas de `openrouter/free` : ce routeur tirait des classifieurs (« User Safety: safe »).
- Présentateur : intensité 0–5, délai de 4,5 s entre deux prises de parole, badge LOCAL /
  GEMINI / OPENROUTER sur chaque réplique. IA appelée dès l'intensité 2 et pour chaque
  `@host` (8 s entre deux appels d'évènement, 150 par partie, pause de 45 s après 3 échecs).
  Relances (pique de début de tour, pression du chrono) : au plus une fois tous les 3
  tours pour TOUTE la table, sans retarder les autres commentaires. Le présentateur ne
  dit jamais « joue » (2026-10-07 : limitée par joueur, la relance tombait presque à
  chaque tour à plusieurs).
  Ton (2026-10-07, demande de l'utilisateur) : clash entre potes, insultes pour faire
  rager, argot et actu du moment. Jamais raciste, homophobe, sexiste, validiste ni
  sexuel ; l'actu vise les puissants, jamais les victimes.
  Sur localhost, `?ai=off` coupe l'IA et `?ai=<url>` la redirige : la suite de tests
  tourne en `?ai=off` pour rester reproductible et ne pas consommer le quota.
- **Bots** (2026-10-08, demande de l'utilisateur) : option « Jouer contre des bots » à
  côté de Créer / Rejoindre (partie lancée sans salon), et « + Ajouter un bot » dans le
  salon. Un bot est un joueur `bot: true` ; le client de l'hôte le joue (`bot.js`) en
  appelant les actions avec leur dernier paramètre `by` (par défaut `S.playerId`). Il ne
  tire aucun hasard lui-même et ne joue que si l'onglet de l'hôte est ouvert.
- Le bandeau coloré des cases reste en **aplat** (contraste ≥ 4.5:1 audité).
- **Direction artistique** (2026-10-07) : un jeu de société sur une table de banque.
  Feutre vert, fiches en carton crème avec grain, encre `#1B2420`, laiton pour ce qui
  compte. Polices Gloock (titres, montants) et Schibsted Grotesk. Boutons à contour
  d'encre et arête pleine, jetons de casino, rosace guillochée générée (`guillocheSVG`).
  À éviter : halos lumineux, dégradés décoratifs, badges en pilule, bordures colorées
  sur un seul côté, majuscules très espacées.

### Limites connues

L'arbitrage et le présentateur dépendent de l'onglet de l'hôte : fermé ou
longuement masqué, les enchères expirées et les tours AFK ne sont plus résolus, et
le présentateur se tait. Pas de liste publique des parties disponibles. Les quotas
gratuits (OpenRouter : 50 requêtes par jour sans crédit) limitent l'IA : au-delà,
répliques locales.

---

## Tester

```bash
node tools/check-links.js                              # structure : hub, relais, chemins de chaque jeu
node games/banqueroll/tests/check-static.js            # ~2 s, sans navigateur — à lancer toujours
python -m http.server 4173                             # puis, dans un autre terminal :
node games/banqueroll/tests/test-browser.js            # 50 contrôles, Chrome réel, 2 joueurs + solo contre un bot, IA simulée
node games/banqueroll/tests/test-browser.js --shots    # + captures dans games/banqueroll/tests/shots/
node games/banqueroll/tests/test-browser.js --no-gsap  # repli quand le CDN est coupé
node games/banqueroll/tests/test-browser.js --preview  # fenêtre visible avec une partie de démo
node games/banqueroll/tests/ai-mock.js                 # Worker IA local, Gemini et OpenRouter simulés (port 8787)
```

Les suites créent de vraies parties Firebase et **les suppriment** ensuite. Si un
run s'interrompt, vérifie les résidus :

```bash
curl -s "https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll.json?shallow=true"
```

Détails dans [games/banqueroll/tests/README.md](games/banqueroll/tests/README.md),
[games/banqueroll/ai-host/README.md](games/banqueroll/ai-host/README.md) et [tools/README.md](tools/README.md).

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
printf '%s\n' banqueroll.html.backup .hermes/ assets/ test_structural.py .vscode/ games/banqueroll/tests/shots/ >> .git/info/exclude
```

## Autres jeux

`bataille-navale`, `mini-golf`, `puissance4`, `qui-est-ce`, `roulette`,
`undercover`, `uno`, `wikirace` : un dossier chacun sous `games/`, listés par
`index.html`. Ils partagent le même
projet Firebase mais des nœuds distincts. **N'y touche pas** en travaillant sur
Banqueroll.
