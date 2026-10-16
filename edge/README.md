# edge — portier de roulia.me

Un Cloudflare Worker placé **devant GitHub Pages**. GitHub continue de publier le site à chaque
`git push origin main` ; le Worker décide seulement si le visiteur a le droit de le recevoir.

```
visiteur ──▶ Cloudflare (Worker) ──┬─ site ouvert ───────▶ GitHub Pages (page normale)
                                   ├─ maintenance ───────▶ écran de maintenance, rien demandé à GitHub
                                   └─ cookie admin valide ▶ GitHub Pages
```

L'adresse reste `roulia.me`. Offre gratuite : environ 100 000 requêtes par jour.

## Ce que ça protège

En maintenance, **aucun fichier du site ne sort** (HTML, CSS, images, scripts) : tout reçoit
un 503 avec l'écran de maintenance. Se superpose à `shared/maintenance.js` (masquage côté
navigateur) et aux règles de la base (aucune lecture ni écriture hors admin) : trois couches.

Reste public quoi qu'il arrive : le dépôt GitHub, s'il est public.

## Fonctionnement

- L'interrupteur est `hub/settings/maintenance` (Firebase), lu au plus toutes les 3 s. Absent,
  illisible ou base injoignable → fermé (sauf si le site était ouvert il y a moins de 60 s).
- Admin : l'écran de maintenance propose la connexion Google. Le Worker envoie le jeton à la
  base (`admins/<uid>?auth=…`), qui le valide elle-même ; si l'uid y vaut `true`, il pose un
  cookie signé (HMAC, HttpOnly, Secure, 1 h). Le cookie laisse passer vers GitHub Pages.
- `/__/auth/*` (pages de connexion de Firebase) reste servi : la connexion Google y revient.

## Mise en place (une fois)

1. **Cloudflare** : compte gratuit, puis *Add a site* → `roulia.me` (plan Free). Cloudflare
   affiche deux serveurs de noms.
2. **Registrar** : remplace les serveurs de noms de `roulia.me` par ces deux-là. La propagation
   prend de quelques minutes à quelques heures ; le site reste en ligne.
3. **DNS dans Cloudflare** (onglet DNS), enregistrements **proxifiés** (nuage orange) :
   `A roulia.me → 185.199.108.153`, `.109.153`, `.110.153`, `.111.153` (quatre enregistrements)
   et `CNAME www → philxvii.github.io`. Ce sont les adresses actuelles de GitHub Pages.
4. **SSL/TLS** : mode *Full* (pas *Flexible*, qui boucle avec GitHub Pages).
5. **Déployer** :
   ```bash
   cd edge
   npx wrangler login
   npx wrangler secret put COOKIE_SECRET      # colle une longue chaîne aléatoire
   npx wrangler deploy
   ```
6. **Vérifier** : `curl -sI https://roulia.me` doit montrer `server: cloudflare`. Active la
   maintenance, puis `curl -s -o /dev/null -w '%{http_code}' https://roulia.me/games/uno/index.html`
   doit répondre `503`.

**Retour en arrière** : remets les serveurs de noms d'origine chez le registrar (ou passe
les enregistrements en nuage gris). Le site redevient servi directement par GitHub Pages.

## Tester

```bash
node --test edge/test/worker.test.mjs    # ~35 s (le Worker garde l'interrupteur 3 s), sans réseau
```
