# tools/ — vérification de Banqueroll

Harnais de test sans aucune dépendance npm : Node 22+ (WebSocket natif) et
Chrome installé. Le dépôt reste un site statique.

## Les deux commandes

```bash
node tools/check-static.js
```

Portail rapide, sans navigateur ni réseau (~2 s). Vérifie la syntaxe du module,
les 28 cases et **l'ordre exact des villes**, le contrat DOM (les 52 `id` lus par
le JS existent bien), la logique des faces de dés et le contraste WCAG AA des
cases. À lancer après chaque modification.

```bash
python -m http.server 4173     # depuis la racine du dépôt
node tools/test-browser.js
```

21 contrôles de bout en bout : Chrome réel, Firebase réel, deux onglets.
Création, join, démarrage, lancer, correspondance dés ↔ déplacement, synchro
entre clients, achat, échange, victoire, remise à zéro, pions animés, feedback
d'argent, responsive sur 6 largeurs, console propre.

### Options

| Option | Effet |
|---|---|
| `--shots` | écrit aussi des captures dans `tools/shots/` (non versionnées) |
| `--no-gsap` | coupe le CDN et vérifie que le jeu reste jouable sans animation |
| `--preview` | ouvre une **fenêtre visible** avec une partie de démo prête à jouer |

Variables d'environnement : `BQ_URL` (défaut `http://localhost:4173/banqueroll.html`),
`CHROME_PATH`, `CDP_PORT` (défaut 9222).

## Ce que ces tests garantissent

Le contrat central du jeu : **les faces affichées par les dés sont exactement
celles qui déplacent le pion**. La suite lit les points réellement dessinés dans
le DOM, le total affiché, et la ligne d'historique écrite par le moteur, puis
compare les trois.

Attention en écrivant de nouvelles assertions : la position finale d'un joueur
peut différer de `départ + dés`, parce qu'une carte Chance le redéplace après
l'atterrissage. Compare toujours au nombre de cases **annoncé par le moteur**
dans l'historique, jamais à une différence de positions.

## Nettoyage

Les suites créent de vraies parties Firebase et les suppriment à la fin. Si un
run s'interrompt, liste les résidus et efface :

```bash
curl -s "https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll.json?shallow=true"
curl -X DELETE "https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll/CODE.json"
```

Chaque lancement utilise un profil Chrome temporaire distinct, supprimé à la
fermeture : une instance restée ouverte ne bloque pas le run suivant.

## Pourquoi un pilote CDP maison

[`cdp.js`](cdp.js) parle directement au protocole DevTools. C'est volontaire :
aucune dépendance à installer, donc pas de `package.json` dans un dépôt qui n'en
a jamais eu. Si le serveur MCP Playwright est disponible, préfère-le pour
l'exploration — ses instantanés d'accessibilité en texte coûtent bien moins cher
en tokens que des captures d'écran.

## Coût en tokens

Ces suites renvoient une vingtaine de lignes de texte. Une capture d'écran
analysée par un agent coûte environ 1 900 tokens — réserve `--shots` aux
questions réellement visuelles (mise en page, chevauchement, contraste perçu),
que le DOM ne permet pas de trancher.
