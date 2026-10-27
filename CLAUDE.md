# GameHub — notes pour Claude

## Reprise en cours : Mauvais Perdants

Le nouveau jeu `games/mauvais-perdants/` est en ligne sur roulia.me ; prochaine étape : refonte
complète de son interface (l'utilisateur envoie un prompt). **Lis `docs/REPRISE-MAUVAIS-PERDANTS.md` dès le début de la session**,
même si l'utilisateur ne t'en parle pas : il ne retient pas les commandes, c'est toi qui les lances.
Mets la note à jour à chaque étape ; supprime-la, ainsi que cette section, quand tout marche en ligne.

## Règles du dépôt

- Pousser sur `main` déploie en production (GitHub Pages). Jamais `--force`.
- Commits : `feat(scope): …` ou `fix(scope): …`, en français, en minuscules, sans point final,
  sans trailer ni co-auteur.
- Rien ne se commite sans demande explicite de l'utilisateur.
- Après un déploiement fait par l'utilisateur (règles Firebase, Worker Cloudflare, push), vérifie toi-même
  que c'est bien en ligne (requête sur roulia.me, lecture de la base, Chrome) avant de dire que c'est fait.
  Ne demande jamais à l'utilisateur de confirmer ce que tu peux contrôler.
- Échanges avec une autre session Claude : dis à l'utilisateur en une phrase que tu lui as répondu ou
  écrit, sans recopier ni résumer le contenu de l'échange. Assure-toi seulement que le message est parti.
