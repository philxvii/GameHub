# Mini Subway — état de la livraison

Branche `feature/mini-subway`. Rien n'est fusionné dans `main` ni déployé. Les règles
Firebase de `ms/` sont préparées et testées sur l'émulateur, mais ne sont pas en ligne.

## Fait (testé)

- Moteur déterministe : stations, formes communes et rares, station qui change de forme,
  voyageurs, lignes, boucles, correspondances, trains, wagons, express et tram, ponts et
  tunnels, pôles d'échange, surcharge, récompenses, score. 42 tests Node.
- Modes Classique, Infini, Extrême et Créatif. Défis du jour et de la semaine, records,
  succès, déblocages et profil local.
- Six cartes originales, dont les particularités sont décrites en données.
- Interface complète : accueil animé, choix de carte et de mode, HUD, dock de ressources,
  panneaux, pause, récompenses, fin de partie, export d'image, réglages (Jour, Nuit,
  Daltonien, contraste, taille des repères, animations, volumes, vitesse, vibrations), aide.
  13 vérifications dans un navigateur réel (souris, tactile, clavier, zoom, mobile 390 et
  360 px).
- Audio original synthétisé, avec une musique qui s'adapte au réseau.
- Multijoueur Coopération (2 à 4 joueurs) et Versus (2 joueurs) en lockstep, sur un journal
  de commandes. 19 vérifications avec 4 navigateurs distincts sur les émulateurs. 10 tests
  des règles Firebase de `ms/`, plus les tests de phase 2 existants, sans régression
  (125/125).
- Intégration au hub : carte et couverture, redirection depuis `404.html`. check-links
  passe à 15/15.
- Revue visuelle indépendante en trois gates (docs/revue/), captures WebP dans
  docs/captures/.

## Partiel

- Vérification humaine du son, de la pause au changement d'onglet, des vibrations et du
  pincement : implémentés, mais non testés automatiquement.
- Calibrage de la difficulté : fait avec un joueur automatique, à confirmer sur de vraies
  parties (QUESTIONS.md §1).
- Hôte déconnecté en multijoueur : la partie se fige jusqu'à son retour ; pas de
  migration d'hôte.
- Remarques mineures de la revue visuelle encore ouvertes (docs/revue/gate3.md), par
  exemple les étiquettes de file qui se chevauchent sur une carte très dense.

## Non fait (volontairement)

- Classement partagé et vérifié des défis : il faudrait un serveur de confiance
  (QUESTIONS.md §2).
- Déploiement des règles et du jeu : décision du propriétaire.
- Handicaps et pénalités dynamiques : seul le point d'extension versionné est prévu,
  sans effet (§25.5).
