# Mini Subway — consignes de travail

Jeu de gestion de réseau de métro abstrait, dans GameHub (site statique GitHub Pages,
sans build ni `package.json`, modules ES natifs). Spécification : [docs/CAHIER_DE_CONCEPTION.md](docs/CAHIER_DE_CONCEPTION.md).
Nom unique : **Mini Subway** (jamais le nom d'un autre jeu, nulle part).

## Périmètre et Git

- Travail uniquement sur la branche `feature/mini-subway`. **Jamais de commit, merge ni push sur `main`. Aucun déploiement.** Pousser sans `--force`.
- Ne modifier ni les autres jeux, ni le présentateur IA, ni l'admin, ni le design du hub, sauf l'intégration indispensable.
- Commits : `feat(mini-subway): …` / `fix(mini-subway): …`, en français, minuscules, sans point final, **titre seul** (une ligne de corps au plus). Dire ce qui change, pas la démarche. Aucun trailer, aucun co-auteur, aucun lien de session. Le dépôt est public : rien d'exploitable dans un message.
- Identité locale : `git config user.name "philxvii"` et `git config user.email "116272977+philxvii@users.noreply.github.com"`.

## Intégration au site

- Entrée `games/mini-subway/index.html` ; le jeu ne référence que son dossier, plus `../../index.html`, `../../icons/` et `../../shared/`.
- Ajouter `mini-subway` à la liste `GAMES` de `404.html` et une carte dans `index.html`. `node tools/check-links.js` échoue tant que ces trois éléments manquent : c'est normal au départ, il doit passer à la livraison.
- **Garde de maintenance** : chaque page commence par le bloc de garde déjà présent dans les autres jeux (`<style id="mx-guard">` puis `shared/maintenance.js` avec son `onerror`). Copier le motif d'un jeu existant (par ex. `games/uno/index.html`), ne pas l'inventer.
- Avec `shared/firebase.js` : compte anonyme, salons `<préfixe>/<code>`, `hostUid`, `members/<uid>`. Lire ce fichier et `firebase/README.md` avant toute écriture réseau.

## Firebase

- Tout nouveau nœud exige d'abord une règle dans `firebase/build-rules.js` (le reste est refusé par défaut) ; ne pas élargir une règle existante ; ne pas éditer à la main les `database.rules*.json` générés.
- Tester **uniquement sur l'émulateur** : `cd firebase && npm install && npm test` (Java 11+ requis), pages ouvertes en `?emu`. **Ne jamais toucher à la production** : pas de `firebase deploy`, pas de `database:set`, pas de test contre la vraie base.

## Documentation publique

Les README du dépôt restent factuels sur le jeu (lancer, commandes, architecture, modes, tests). Ils ne décrivent ni limites de sécurité détaillées, ni procédures de déploiement, ni quotas, ni commandes visant la production. Les notes de travail (`DECISIONS.md`, `QUESTIONS.md`, traçabilité, rapport de revue visuelle) vont dans `games/mini-subway/docs/`.

## Tests

Sans dépendance npm côté jeu. Tests du moteur exécutables avec `node` (modules purs, sans navigateur). Tests navigateur : `tools/cdp.js` (Chrome via DevTools, **une fenêtre par joueur**). Servir en local avec `python -m http.server 4173`.
