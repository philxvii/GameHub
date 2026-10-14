# tools/ — outils communs à GameHub

Sans dépendance npm : Node 22+ et, pour les tests navigateur, Chrome installé.

| Fichier | Rôle |
|---|---|
| `check-links.js` | Structure du dépôt, sans navigateur : liens du hub, pages de connexion `__/auth/`, redirection des anciennes URL par `404.html` (exécutée avec de fausses adresses), chemins relatifs (HTML, CSS, imports JS) de chaque `games/<jeu>/`, racine propre. |
| `cdp.js` | Pilote Chrome par le protocole DevTools (une fenêtre par joueur). Utilisé par les tests navigateur des jeux. |
| `auth-helpers.js` | Pages de connexion Google de Firebase copiées dans `__/auth/` (la fenêtre de Google affiche roulia.me) : compare avec la version de Firebase, `--write` les recopie. |

```bash
node tools/check-links.js
```

Les tests propres à un jeu vivent dans son dossier, par exemple
[games/banqueroll/tests/](../games/banqueroll/tests/README.md).
