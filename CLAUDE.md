# GameHub — notes pour Claude

## Notes chiffrées

`docs/RECAP-MAINTENANCE-SECURITE.md.enc` est le récapitulatif de la maintenance, de la mise en
place de Cloudflare et de l'audit de sécurité (ce qui a été fait, comment redéployer, ce qui reste
ouvert). Il est chiffré : le dépôt est public.

Pour le lire, **demande son mot de passe à l'utilisateur** (il l'a choisi lui-même, tu ne le
connais pas) et fais-lui lancer lui-même la commande, qui masque la saisie :

```bash
node tools/notes-crypt.mjs decrypt docs/RECAP-MAINTENANCE-SECURITE.md.enc
```

Elle écrit `docs/RECAP-MAINTENANCE-SECURITE.md` (ignoré par git : ne le commite jamais). Lis-le
ensuite. Node 18+ suffit, aucune dépendance. Mauvais mot de passe : l'outil refuse, rien n'est écrit.

Pour mettre à jour le récapitulatif : modifie le `.md` en clair, relance
`node tools/notes-crypt.mjs encrypt docs/RECAP-MAINTENANCE-SECURITE.md` (l'utilisateur tape le mot de
passe), puis commite seulement le `.md.enc`.

## Reprise en cours : Mauvais Perdants

Un nouveau jeu, `games/mauvais-perdants/`, est développé sur la branche `feature/party-showdown`
(pas encore en production). **Lis d'abord `docs/REPRISE-MAUVAIS-PERDANTS.md`** : état, résultats
des tests, ce qu'il reste à faire, pièges. Mets-la à jour à chaque étape ; supprime-la, ainsi que
cette section, une fois le jeu en production.

## Règles du dépôt

- Pousser sur `main` déploie en production (GitHub Pages). Jamais `--force`.
- Commits : `feat(scope): …` ou `fix(scope): …`, en français, en minuscules, sans point final,
  sans trailer ni co-auteur.
- Rien ne se commite sans demande explicite de l'utilisateur.
