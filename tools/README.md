# tools/ — vérification de Banqueroll

Harnais de test sans aucune dépendance npm : Node 22+ (WebSocket et fetch natifs)
et Chrome installé. Le dépôt reste un site statique.

## Les commandes

```bash
node tools/check-static.js
```

Portail rapide, sans navigateur ni réseau (~2 s). Il **importe directement les
modules livrés** (`banqueroll/js/*.js`, `ai-host/src/prompt.js`) et vérifie :

- syntaxe de tous les modules et **ordre exact des villes** ;
- contrat DOM : ids lus par le JS, et chaque `data-act` a son gestionnaire ;
- dé unique et contraste WCAG AA des 28 cases ;
- prix et groupes du fichier de règles ;
- loyers, construction (2/3 refusé, 3/3 autorisé, niveau 4 refusé) ;
- relance sur 6, prison, faillite, victoire ;
- 1 000 tirages de Chance ;
- répliques du présentateur ;
- bornage du Worker IA et absence de secret dans le frontend.

```bash
python -m http.server 4173     # depuis la racine du dépôt
node tools/test-browser.js
```

41 contrôles de bout en bout : Chrome réel, Firebase réel, deux joueurs.

- Création, join, démarrage (ordre tiré, bonus de retard).
- Lancer : le dé affiché égale le moteur **sur les deux clients** ; le pion est posé sur la bonne case.
- 6 → relance ; achat ; groupe 2/3 puis 3/3 ; bâtiments 1, 2, 3 ; niveau 4 refusé ; loyer amélioré.
- Échange, enchère, prison et caution, case Auction.
- Carte, dilemme, roue : même segment chez tous.
- Présentateur : réponse à `@host`, réaction à un évènement, retour d'une pique du chat.
- IA : réponse, contexte reçu, synchronisation, panne → réplique locale et jeu qui continue.
- Faillite, victoire, nouvelle partie.
- Responsive sur 6 tailles.
- Console propre.

### Options

| Option | Effet |
|---|---|
| `--shots` | écrit aussi des captures dans `tools/shots/` (non versionnées) |
| `--no-gsap` | coupe le CDN et vérifie que le jeu reste jouable sans animation de pion |
| `--preview` | ouvre une **fenêtre visible** avec une partie de démo à 4 joueurs |

Variables d'environnement : `BQ_URL` (défaut `http://localhost:4173/banqueroll.html`),
`CHROME_PATH`, `CDP_PORT` (défaut 9222), `AI_MOCK_PORT` (défaut 8787).

```bash
node tools/ai-mock.js
```

Exécute le **vrai** Worker (`ai-host/src/worker.js`) dans Node avec un OpenRouter
simulé. `POST /__mode {"mode":"ok"|"fail"|"slow"}` change le comportement de
l'amont, `GET /__last` renvoie le dernier contexte reçu par le « modèle ». La suite
navigateur le lance et l'arrête toute seule.

## Ce que ces tests garantissent

- Le contrat central du jeu : **la face affichée par le dé est exactement celle qui
  déplace le pion**, sur tous les clients.
- **Le hasard n'est tiré qu'une fois.** Pour rendre un scénario déterministe, la
  suite remplace `Math.random` dans la seule page du joueur qui tire ; les autres
  clients doivent afficher le même résultat sans rien tirer.

Attention en écrivant de nouvelles assertions : la position finale d'un joueur
peut différer de `départ + dé`, parce qu'une carte Chance le redéplace après
l'atterrissage. Compare au nombre de cases **annoncé par le moteur** dans
l'historique, jamais à une différence de positions.

Les deux joueurs partagent un profil Chrome, donc `localStorage` : ne recharge
jamais une page en cours de suite (l'autre joueur serait repris). Change l'URL avec
`history.replaceState` si besoin.

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
l'exploration : ses instantanés d'accessibilité en texte coûtent bien moins cher
en tokens que des captures d'écran.

## Coût en tokens

Ces suites renvoient une quarantaine de lignes de texte. Une capture d'écran
analysée par un agent coûte environ 1 900 tokens : réserve `--shots` aux
questions réellement visuelles (mise en page, chevauchement, contraste perçu),
que le DOM ne permet pas de trancher.
