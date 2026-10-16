# Sécurité de GameHub — audit et stratégie

Audit du 16 octobre 2026. Recherche web (menaces courantes), relecture ciblée du dépôt,
plan par priorité. Ce n'est pas un audit exhaustif : le balayage du code était ciblé.

## Ce qui menace un site comme celui-ci

| Menace | Pourquoi elle compte ici | Sources |
|---|---|---|
| **Contrôle d'accès défaillant** (n°1 de l'OWASP 2025) | Tout repose sur les règles Firebase : le client parle directement à la base. | [OWASP Top 10 2025](https://owasp.org/Top10/2025/0x00_2025-Introduction), [Radware](https://www.radware.com/cyberpedia/application-security/owasp-top-10/) |
| **Mauvaise configuration** (n°2) | Règles trop permissives laissées après les tests : des milliers de bases Firebase sont lisibles par n'importe qui, des robots les scannent en continu. | [RedHunt Labs](https://redhuntlabs.com/blog/analysing-misconfigured-firebase-apps-a-tale-of-unearthing-data-breaches-wave-10/), [Comparitech](https://comparitech.com/blog/information-security/firebase-misconfiguration-report), [SANS](https://sans.org/blog/firebase-google-cloud-s-evil-twin-condensed) |
| **Chaîne d'approvisionnement logicielle** (nouveau, n°3) | Scripts chargés depuis des CDN (gsap, Firebase, polices) sans empreinte de vérification. | OWASP 2025 |
| **Injection / XSS stocké** | Un texte saisi par un joueur est affiché chez les autres. Cas réel récent sur un jeu de cartes en ligne (chat non filtré) et vol de session via IndexedDB. | [CVE-2026-25144](https://osv.dev/vulnerability/CVE-2026-25144), [Infosec Writeups](https://infosecwriteups.com/stored-xss-to-account-takeover-going-beyond-document-cookie-970e42362f43) |
| **Gestion des cas d'erreur** (nouveau, n°10) | Un système qui « s'ouvre » quand il plante laisse tout passer. | OWASP 2025 |
| **DDoS** | Cloudflare a bloqué 935 attaques de plus de 1 Tbps au premier semestre 2026 ; la plupart des attaques sont courtes (90 % sous 10 min) et les inondations HTTP visent surtout les sites et API. | [Cloudflare H1 2026](https://helpnetsecurity.com/2026/08/13/cloudflare-h1-2026-ddos-trends-report) |

Ce qui fait réellement tomber un petit site : l'épuisement des quotas (connexions simultanées,
téléchargements) de la base, des salons créés en masse, et un compte administrateur compromis.

## Audit du dépôt

**Bon**
- Aucun secret dans le dépôt (la clé web Firebase est publique par conception). Mot de passe admin
  en dur supprimé : connexion Google, droits vérifiés par la base (`admins/<uid>`).
- Règles Firebase fermées par défaut, écritures limitées aux membres d'un salon, pseudos limités à
  30 caractères sans `<`.
- Pas de `eval`, de `new Function` ni de `document.write` dans les pages.
- Maintenance en trois couches : Worker Cloudflare, masquage côté navigateur, règles de la base.

**Corrigé le 16 octobre (non commité)**
- XSS stocké : description d'`undercover`, question de `qui-est-ce` (texte et auteur) affichés par
  `textContent`. Panneau admin : phase et pseudos échappés, codes de partie inattendus ignorés.
  La phase d'une partie (32 caractères max, `<` non interdit) pouvait porter du HTML.
- En-têtes de sécurité ajoutés par le Worker : `nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (6 mois).

**Reste ouvert**
1. Les autres jeux (`roulette`, `uno`, `mini-golf`, `bataille-navale`, `puissance4`) affichent
   `${p.name}` sans échappement. Seule la règle « pas de `<` dans un pseudo » les protège : une
   seule couche. À doubler côté code.
2. Les règles n'interdisent `<` que pour les pseudos et le journal : ni les descriptions ni les
   questions. Voir le plan P1.
3. Aucune politique de contenu (CSP) : les pages ont des scripts en ligne.
4. `gsap` est chargé depuis cdnjs sans `integrity` (SRI).
5. GitHub Pages reste joignable directement par IP : le Worker ne protège que les visiteurs qui
   passent par `roulia.me`. Le dépôt est public.
6. Aucune limite de création de salons ni de comptes anonymes.

## Stratégie, par priorité

### P0 — fait ou à déployer maintenant
- Déployer les correctifs XSS (commit puis `git push origin main`).
- Recoller [edge/src/worker.js](../edge/src/worker.js) dans le Worker Cloudflare (en-têtes).
- Activer la double authentification sur les quatre comptes qui contrôlent le site : Google
  (`philippe.bolv@gmail.com`, c'est la clé admin), GitHub, Cloudflare, Namecheap. Activer aussi le
  verrouillage du domaine chez Namecheap. Un compte volé contourne tout le reste.

### P1 — cette semaine
- **Règles Firebase** : ajouter `!newData.val().contains('<')` et une longueur maximale aux textes
  libres (descriptions `undercover`, questions `qui-est-ce`, messages de chat). Les règles se
  déploient par la console Firebase ou `firebase deploy` ; l'émulateur de tests est dans
  `firebase/tests/`.
- **Quotas** : dans la console Firebase, vérifier l'offre du projet et créer une alerte de
  budget. Sur l'offre gratuite (Spark), le nombre de connexions simultanées et le volume mensuel
  téléchargé sont plafonnés : c'est la cause de panne la plus probable pour un jeu qui plaît.
  Les chiffres exacts sont à relire dans la console.
- **Limiter les abus** dans Cloudflare : une règle de limitation de débit sur `roulia.me/*`
  (l'offre gratuite en permet une) et **Bot Fight Mode**, qu'on avait laissé de côté pour ne pas
  gêner les joueurs : à activer une fois le Worker validé.
- Doubler l'échappement côté code dans les 5 jeux de la liste ci-dessus.

### P2 — ce mois-ci
- **Firebase App Check** (reCAPTCHA) : n'accepte les appels à la base que depuis le vrai site.
  Réduit fortement les comptes anonymes créés par script.
- **SRI** sur `gsap` (`integrity` + `crossorigin`), ou copie locale dans `shared/`.
- **CSP en mode rapport** (`Content-Security-Policy-Report-Only`) posée par le Worker, observée
  quelques jours, puis appliquée. Les scripts en ligne imposent soit des `nonce`, soit de sortir
  le JavaScript des pages.
- Supprimer l'accès direct à GitHub Pages : servir le site depuis Cloudflare (Workers Static
  Assets ou Pages) et passer le dépôt en privé. C'est ce qui ferme le contournement par IP.

### P3 — veille
- Relancer `node tools/check-links.js` et `node --test edge/test/worker.test.mjs` après chaque
  changement du Worker ou des règles.
- Relire les journaux Cloudflare (Analytics → Security) après une période de pic.
- Garder les versions de Firebase (10.12.0) et de gsap à jour : une faille XSS de
  `@firebase/auth` a été corrigée en 1.6.2 ([Snyk](https://security.snyk.io/vuln/SNYK-JS-FIREBASEAUTH-8383231)).

## Si le site est attaqué

1. Activer la maintenance depuis le panneau admin : le Worker répond lui-même, rien ne sort.
2. Dans Cloudflare : *Security → Under Attack Mode*, puis vérifier les journaux.
3. Si un compte admin est suspecté : retirer son uid de `admins/` dans la console Firebase,
   révoquer les sessions Google, changer `COOKIE_SECRET` (les cookies admin cessent de valoir).
4. Si la base est abusée : durcir ou fermer les règles, puis nettoyer les salons parasites.
