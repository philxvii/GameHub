# Audience — conception, confidentialité, déploiement

Recherche du 19 octobre 2026. Branche `feature/admin-analytics`. **Rien n'est déployé ni poussé.**

## 1. Constat sur l'architecture réelle

- `roulia.me` passe par Cloudflare (DNS proxifié) et le Worker `roulia-gate` devant GitHub Pages (`edge/`).
- L'admin = Firebase Auth (Google) ; le droit = `admins/<uid> = true` dans la base. Le Worker `roulia-gate`
  valide un jeton en demandant `admins/<uid>?auth=<jeton>` à la base (la base juge, pas le jeton décodé).
- Aucune carte ni lib de graphiques n'existait. Le Worker de l'IA de Banqueroll n'est pas touché.

## 2. Options comparées

| | Cloudflare Web Analytics | Worker dédié + D1 (retenu) |
|---|---|---|
| Dimensions (doc officielle) | pays, hôte, chemin, référent, appareil, navigateur, OS, bots, type de navigation. **Pas de ville ni de « jeu ».** | Celles qu'on choisit : mêmes + jeu, filtrables |
| Dans le panneau GameHub | Non : tableau de bord Cloudflare, ou API GraphQL avec jeton Cloudflare (secret à héberger quelque part) | Oui, via un point d'accès protégé par l'admin Firebase |
| Données stockées | Chez Cloudflare, rétention fixe | Compteurs seulement, rétention paramétrable |
| Coût | Gratuit | Gratuit dans les quotas (D1 : 100 000 lignes écrites/jour, 5 M lues, 5 Go) |
| Maintenance | Aucune | Un Worker + une base à déployer |

**Choix : Worker séparé `roulia-stats` + D1.** Le besoin « carte et jeux dans l'admin » n'est pas couvert par
Web Analytics sans exposer un jeton Cloudflare. Web Analytics reste un bon complément sans code si on veut un
second avis (non activé : un second collecteur doublerait le traitement).

Rejeté : IP ou hash d'IP comme identifiant ; identifiant de navigateur ; Firebase pour les stats (lisible par
les clients) ; tuiles de carte tierces (OpenStreetMap/Leaflet : requêtes tierces depuis le navigateur de
l'admin, politique d'usage des tuiles, dépendance de plus). La carte est un **SVG local** (Natural Earth,
domaine public).

**Carte retenue** : **MapLibre GL 4.7.1** (copie locale `shared/vendor/`, empreinte identique sur unpkg et jsdelivr)
avec les fonds vectoriels **OpenFreeMap** (Positron en clair, Dark en sombre, noms en français) et des **points par
ville**. OpenFreeMap : gratuit, sans clé, sans compte, sans limite de vues, usage commercial permis, attribution
obligatoire (affichée en bas de la carte) ; pas de SLA. Comparés : tuiles OpenStreetMap brutes (politique d'usage
restrictive, rendu raster pixelisé), CARTO (clé et compte obligatoires), Stadia Maps (compte et domaine à
déclarer). Seul le navigateur de l'admin appelle `tiles.openfreemap.org` ; aucun visiteur ne charge la carte.
Si le fond de carte tombe, le tableau « Villes » donne les mêmes chiffres. CSP du Worker `roulia-gate` :
`connect-src` + `https://tiles.openfreemap.org`, `worker-src blob:` (à recoller dans Cloudflare).

## 2 bis. Journal de l'administration

`adminLog/<id>` dans Firebase : `{ ts, cat, msg, target, by }`. Règles (`firebase/build-rules.js`) : lecture admin
seule ; **ajout seulement** (aucune entrée ne se modifie ni ne s'efface, même par l'admin) ; `ts` imposé par le
serveur ; `by` = le compte connecté ; catégories fermées ; textes ≤ 300 caractères sans `<`. Écrit à chaque
connexion admin et à chaque action du panneau (`shared/admin-journal.js`). L'ancien `hub/updateLog`
(20 entrées, **lisible par tous jusqu'ici**, avec des pseudos) n'est plus écrit et devient lisible par l'admin seul.
**Publier les règles AVANT de pousser le site** (`node firebase/build-rules.js`, puis console Firebase → Règles →
coller `database.rules.phase2.json`), sinon le journal reste vide.

## 3. Ce qui est collecté (niveau 1 seulement)

Un chargement de page déclenche `navigator.sendBeacon('/_stats/e', {p: chemin, r?: domaine})`
(`shared/analytics.js`). Le Worker :
1. refuse si origine ≠ roulia.me, `Sec-Fetch-Site` ≠ same-origin, type ≠ text/plain/json, corps > 512 o,
   champ inconnu, chemin hors liste blanche (accueil + 10 jeux ; ni query, ni hash, ni code de partie) ;
2. ignore (204) robots connus, `DNT: 1`, `Sec-GPC: 1` ; limite le débit par adresse (binding `ratelimits`, 20/min) ;
3. déduit pays (`request.cf.country`), appareil/navigateur/OS (catégories), source (domaine du référent) ;
4. incrémente des compteurs `(heure, portée, dimension, valeur)`. **Aucune ligne par visite, aucune IP, aucun
   identifiant, aucune combinaison de dimensions** (pas de « pays × navigateur »). La **ville** (`request.cf.city`) est comptée
   comme une dimension de plus ; son point représentatif (`request.cf.latitude/longitude`) est **arrondi à 0,1°
   (~10 km)** et stocké une fois par ville (table `places`), jamais par visite. Pas de région, pas de code postal.

Seuil d'affichage : toute valeur sous **5** pages vues est regroupée en « Autres » (`K_MIN`, `src/lib.js`). Une ville
sous le seuil n'a pas de point : ses vues restent dans le total de son pays et dans la ligne « Non placées ».

## 4. Indicateurs affichés et limites

| Indicateur | Nature | Limite |
|---|---|---|
| Pages vues | exact (comptées par le serveur) | falsifiables par un script ; robots connus exclus seulement ; opposants (DNT/GPC/case) non comptés ; bloqueurs de pub possibles |
| Arrivées | estimation | déduites du référent ; un rechargement compte comme arrivée |
| Pays | estimation | géolocalisation IP : approximative, VPN/mobile/entreprise faussent ; « Inconnu » = absent |
| Villes (points) | estimation | souvent la ville du fournisseur d'accès ; point à ~10 km ; carte = groupes ≥ 5, jamais une personne |
| Appareil / navigateur / OS | estimation | User-Agent, catégories seulement |
| Jeux, pages, sources | exact / estimation | une navigation interne sans rechargement n'est pas comptée |
| Visiteurs uniques, actifs, retours | **non disponible** | aucun identifiant n'est utilisé (affiché « n/d ») |

Fenêtres : 24 h / 7 j / 30 j glissantes en heures pleines UTC ; les jours des séries sont des jours
calendaires **Europe/Paris** (le premier et le dernier peuvent être partiels).

## 5. Confidentialité (à faire valider)

Sources consultées : CNIL, « solutions pour les outils de mesure d'audience » (finalité limitée à la mesure pour
l'éditeur, données statistiques anonymes, pas de recoupement ni suivi inter-sites ; recommandations : traceur
≤ 13 mois, données ≤ 25 mois, information des personnes).

- Aucun traceur n'est lu ni écrit pour la mesure (pas de cookie, pas de stockage). Seule la case d'opposition
  écrit `gh-stats-optout` : c'est l'enregistrement d'un choix, pas une mesure.
- Rétention : compteurs 395 jours (13 mois), purge quotidienne (cron). Variable `RETENTION_DAYS`.
- Information : `confidentialite.html` (lien dans le pied du hub) ; opposition : DNT, GPC, case.
- **Points à valider juridiquement** (je ne qualifie pas le site « conforme ») : (a) si le traitement transitoire
  de l'IP pour déduire le pays tient bien l'exemption (la page CNIL consultée ne détaille pas ce point) ;
  (a bis) le niveau ville rend l'argument « statistiques anonymes » plus fragile qu'au niveau pays sur un petit site : seuil
  de 5 et absence de croisement de dimensions le limitent, sans l'annuler ;
  (b) Cloudflare comme sous-traitant (transferts hors UE, contrat) ; (c) mention dans une politique de
  confidentialité plus complète (le site n'en avait pas).
- Niveau 2 (visiteurs récurrents) : **non implémenté**. Il exigerait un identifiant aléatoire stocké dans le
  navigateur, donc un consentement préalable (aucun envoi avant accord), des statistiques séparées et une
  rétention propre. À ne faire que si le besoin est avéré.

## 6. Sécurité

- Lecture `GET /_stats/summary` : jeton Firebase `Authorization: Bearer`, validé auprès de la base (`admins/<uid>`),
  fournisseur `google.com`, audience du projet, non expiré ; résultat mis en cache 60 s par instance ;
  `Cache-Control: no-store`. Aucun secret dans le navigateur ; le script public ne contient ni jeton ni clé.
- Pas de journaux : `observability` désactivé, aucune écriture de payload ni d'IP ; l'IP n'est que la clé du limiteur.
- Limites assumées : l'ingestion est publique, donc falsifiable (plafonnée par le limiteur et le quota D1) ; la
  cardinalité du champ « référent » n'est pas bornée (une rafale de faux domaines gonfle la table, purgée à 13 mois).
- Quota D1 : ~7 à 12 lignes écrites par page vue → environ **8 000 pages vues/jour** sur l'offre gratuite. Au-delà,
  les écritures échouent en silence (le site n'est pas affecté) ; passer à l'offre payante ou réduire les dimensions.

## 7. Déploiement (non fait — autorisation requise)

```bash
cd edge-stats
npx wrangler d1 create roulia-stats          # copier database_id dans wrangler.toml
npx wrangler d1 execute roulia-stats --remote --file=schema.sql
npx wrangler deploy                           # route roulia.me/_stats/* (plus précise que celle de roulia-gate)
```

PC pro : `wrangler` est bloqué ; coller `src/*.js` dans l'éditeur du tableau de bord Cloudflare, créer la base D1 et
les liaisons `DB` (D1) et `LIMITER` (limitation de débit) à la main, déclencheur cron `17 3 * * *`, variables
`RETENTION_DAYS` et `ALLOWED_ORIGINS`. Puis : fusionner/pousser la branche (déploie le site), et ajouter une règle
de limitation Cloudflare sur `/_stats/e` si besoin. Le CSP du Worker `roulia-gate` autorise déjà `connect-src 'self'`.

Tests : `node --test edge-stats/test/stats.test.mjs` (SQLite en mémoire à la place de D1).
Aperçu local **synthétique** du panneau admin :
1. `java -jar firebase-database-emulator-v4.11.2.jar --port 9000` (jar officiel de firebase-tools, SHA-256 vérifié ;
   le CLI `firebase` est bloqué sur le PC pro) puis `node edge-stats/dev-seed-firebase.mjs` ;
2. `node edge-stats/dev-server.mjs` (statistiques synthétiques) et `node edge-stats/dev-preview.mjs` ;
3. ouvrir `http://localhost:4175/home`. Rien ne part vers la base de production.

Tests des règles (même émulateur lancé) : `cd firebase && node --test --test-concurrency=1 tests/phase2.test.js`.
