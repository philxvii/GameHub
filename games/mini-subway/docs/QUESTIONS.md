# Mini Subway — questions ouvertes et blocages

Aucun blocage n'a empêché d'avancer ; chaque point ci-dessous a une hypothèse retenue.

1. **Calibrage sur de vraies parties (§18.3, §22.1).** Les valeurs actuelles sont calibrées
   avec un joueur automatique naïf (≈ 6–7 min, semaine 4–5). Il faut des parties humaines
   pour fixer la durée cible (proposition : 12–20 min pour un joueur moyen) et ajuster
   `passengers.intervalTicks`, `growth.*`, `overload.graceTicks`. Le tableau de mesures est
   dans DECISIONS.md.
2. **Classement partagé des défis.** Non fait volontairement : sans vérification côté
   serveur (graine et partie rejouées par une fonction de confiance), un classement serait
   falsifiable. Proposition future : stocker graine + journal de commandes, rejouer la
   partie côté serveur (le moteur est déterministe et exécutable sous Node) avant
   d'inscrire le score. Hors périmètre : service serveur et coûts associés.
3. **Hôte déconnecté en multijoueur.** La partie se fige jusqu'à son retour (il est
   l'horloge). Une migration d'hôte (le plus ancien invité présent reprend l'horloge, via
   une transaction sur un champ `coord`) est possible mais n'est pas livrée.
4. **Mise en ligne des règles.** Les règles `ms/` sont dans `database.rules.phase2.json`
   (générées par `build-rules.js`, testées sur l'émulateur) mais **non déployées**. Les
   règles de transition n'incluent pas `ms/` : à publier seulement quand la phase 2 est en
   ligne. Le déploiement reste une décision du propriétaire.
5. **Purge des salons par l'administration.** L'outil d'administration du hub ne liste
   pas `ms/` (périmètre admin non modifié). Un salon abandonné sans fermeture par son hôte
   reste dans la base ; ajouter `{ id: 'minisubway', db: 'ms' }` à la liste `GAMES` de
   l'admin permettrait de le purger.
6. **Environnement de test.** Le proxy de l'environnement cloud bloque le CDN gstatic et le
   chargement des règles par `firebase emulators:exec` : les tests navigateur servent le
   SDK officiel 10.12.0 en local (`MS_FIREBASE_SDK`) et les règles sont chargées dans
   l'émulateur par `curl`. Sur une machine normale, `npm test` et le CDN fonctionnent tels
   quels.
