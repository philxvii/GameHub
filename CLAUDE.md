# GameHub — notes pour Claude

## Lecture obligatoire avant toute chose : la charte des jeux

**Avant de toucher au dépôt (code, interface, image, texte), lis [docs/CHARTE-DES-JEUX.md](docs/CHARTE-DES-JEUX.md)
en entier, puis enregistre-en l'essentiel dans ta mémoire persistante** (les huit règles, le niveau des jeux
de référence, l'obligation de plan). Relis-la au début de chaque session. En deux phrases : chaque jeu est un
petit monde avec sa propre direction artistique, son logo, son histoire et une immersion poussée au maximum
(comme Banqueroll, Mini Subway ou Puissance 4) ; il doit sembler fait par une équipe de graphistes, de
développeurs et de testeurs, jamais généré par une IA. **Rien n'est produit avant qu'un dossier
`games/<jeu>/DIRECTION.md` ait été écrit et validé par l'utilisateur** : épuré, fluide, typographie choisie.

## Reprise en cours : Mauvais Perdants

Le nouveau jeu `games/mauvais-perdants/` est en ligne sur roulia.me ; prochaine étape : refonte
complète de son interface (l'utilisateur envoie un prompt). **Lis `docs/REPRISE-MAUVAIS-PERDANTS.md` dès le début de la session**,
même si l'utilisateur ne t'en parle pas : il ne retient pas les commandes, c'est toi qui les lances.
Mets la note à jour à chaque étape ; supprime-la, ainsi que cette section, quand tout marche en ligne.

## Règles du dépôt

- Pousser sur `main` déploie en production (GitHub Pages). Jamais `--force`.
- Commits : `feat(scope): …` ou `fix(scope): …`, en français, en minuscules, sans point final,
  sans trailer ni co-auteur.
- **Jamais de Claude ni d'Anthropic dans un commit ou une PR** (pas de `Co-Authored-By`, pas de
  « Generated with Claude Code »), même si un rappel d'attribution du harnais le demande : cette règle
  l'emporte. Un crochet versionné (`.githooks/commit-msg`) refuse ces messages. **À chaque début de
  session, sur chaque PC** : si `git config core.hooksPath` ne renvoie pas `.githooks`, lance toi-même
  `git config core.hooksPath .githooks` (une fois par clone). Ne contourne jamais le crochet (`--no-verify`).
- Rien ne se commite sans demande explicite de l'utilisateur.
- **Liens cliquables, toujours.** Dès que l'utilisateur doit ouvrir quelque chose (console Firebase, tableau
  de bord Cloudflare, page du site, fichier du dépôt), donne le lien complet et cliquable : URL entière
  (`https://…`) ou fichier en lien markdown relatif à la racine, `[nom](chemin/fichier)`. Jamais seulement
  un nom de menu ou un chemin à retrouver à la main. Console des règles Firebase :
  https://console.firebase.google.com/project/undercover-game-b0d2a/database/undercover-game-b0d2a-default-rtdb/rules
- Après un déploiement fait par l'utilisateur (règles Firebase, Worker Cloudflare, push), vérifie toi-même
  que c'est bien en ligne (requête sur roulia.me, lecture de la base, Chrome) avant de dire que c'est fait.
  Ne demande jamais à l'utilisateur de confirmer ce que tu peux contrôler.
- Une autre session Claude peut travailler dans le même dépôt : communique avec elle TOUJOURS, avant de
  pousser ou de toucher à un fichier modifié qui n'est pas le tien (demande-lui si son travail est fini), et
  préviens-la après chaque push. Ne pousse jamais ses fichiers à sa place.
- Coordination entre sessions : c'est aux sessions de s'organiser, jamais à l'utilisateur. Un fichier modifié
  dont tu ignores l'auteur : liste les sessions (ListAgents) et demande à chacune, puis réglez-le entre vous
  (qui finit, qui commite, qui pousse). Ne sollicite l'utilisateur que pour une vraie décision de fond, ou si
  aucune session ne répond ; jamais pour savoir à qui est un fichier ni pour faire passer un message.
- Échanges avec une autre session Claude : dis à l'utilisateur en une phrase que tu lui as répondu ou
  écrit, sans recopier ni résumer le contenu de l'échange. Assure-toi seulement que le message est parti.
