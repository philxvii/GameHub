# Mini Subway

Dessinez le réseau de métro d'une ville qui grandit : reliez des stations de formes
différentes, posez des trains, et acheminez des voyageurs qui veulent rejoindre une forme
de station. Une station qui déborde trop longtemps arrête le service. Seul, en
coopération (2 à 4) ou en duel (2).

## Lancer

Site statique, sans build. À la racine du dépôt :

```bash
python -m http.server 4173
# puis http://localhost:4173/games/mini-subway/
```

Le solo fonctionne hors ligne une fois la page chargée (le module multijoueur n'est
chargé qu'à la demande). En local, `?emu` branche Firebase sur les émulateurs.

## Commandes

| Action | Souris / clavier | Tactile |
|---|---|---|
| Nouvelle ligne | glisser d'une station à l'autre (repasser sur la précédente = retour, revenir à la première = boucle) | idem au doigt |
| Prolonger / raccourcir | glisser la barre d'extrémité | idem |
| Insérer une station | glisser le milieu d'un tronçon jusqu'à elle | idem |
| Locomotive, wagon, pôle d'échange | glisser depuis le dock vers la ligne / le train / la station | toucher la ressource puis la cible |
| Déplacer un train | le glisser sur une autre ligne | idem |
| Détails, retraits, suppression | cliquer une station, une ligne ou un train | toucher |
| Pause / vitesse | `Espace`, `1`, `2` | boutons |
| Menu, recentrer, son, zoom | `Échap`, `F`, `M`, `+` `−`, molette | boutons, pincement |
| Déplacer la carte | glisser dans le vide | idem |
| Créatif : annuler / rétablir | `Ctrl+Z`, `Ctrl+Y` | boutons |

## Modes

- **Classique** : chaque semaine, une locomotive et une amélioration au choix (ligne, wagon, ponts, pôle d'échange).
- **Infini** : pas de défaite ; une jauge d'efficacité pleine donne une récompense.
- **Extrême** : tout placement est définitif ; une ligne ne peut que s'allonger.
- **Créatif** : ressources illimitées, éditeur de stations, trafic et croissance réglables.
- **Défis** : du jour (graine du jour UTC) et de la semaine (deux modificateurs, un objectif) ; une tentative officielle, puis entraînement. Résultats locaux.
- **Coopération** (2–4) : un réseau, un inventaire, un score ; défaite collective.
- **Versus** (2) : même ville et mêmes apparitions, deux réseaux ; le premier saturé perd.

Six villes originales : Val-d'Orme, Baie des Brumes, Delta Sauge (ouvertes d'emblée),
Haut-Plateau, Archipel Corail, Lagune Haute (à débloquer). Chacune a sa géographie et ses
règles (capacités, récompenses, matériel, stations qui changent de forme…).

## Architecture

```
js/engine/   moteur pur et déterministe (testable sous Node, sans DOM)
  params.js    paramètres et modes          maps.js     cartes (données)
  sim.js       simulation, routage, commandes
  rng.js geom.js  aléatoire à graine, géométrie sans trigonométrie
  progress.js  défis, records, succès        autoplay.js joueur automatique (accueil, tests)
js/render.js  rendu Canvas 2D (carte imprimée, Jour / Nuit / Daltonien)
js/input.js   souris, tactile, stylet        js/game.js  boucle, HUD, panneaux, fenêtres
js/audio.js   sons et musique synthétisés    js/store.js sauvegarde locale
js/net.js     multijoueur (Firebase, chargé à la demande)
js/main.js    accueil, menus, réglages
```

Simulation à pas fixe (20 ticks/s), rendu interpolé. Toute action est une commande
validée par le moteur ; en multijoueur, seules les commandes circulent (journal ordonné
par l'hôte, appliqué au même tick par tous les clients). Détails et choix :
[docs/DECISIONS.md](docs/DECISIONS.md).

## Multijoueur

Salon par code (`ms/<code>` dans la base Realtime Database, comptes anonymes). L'hôte
fait foi : il règle l'horloge, la pause et la vitesse, et ordonne les commandes. Il n'y a
pas de serveur arbitre : les scores multijoueurs ne sont pas des classements vérifiés.

## Tests

Voir [tests/README.md](tests/README.md) : moteur (`node --test games/mini-subway/tests/*.test.mjs`),
interface (`tests/ui.cjs`), multijoueur à plusieurs navigateurs (`tests/multi.cjs`),
règles de la base (`firebase/tests/mini-subway.test.js`), captures (`tests/capture.cjs`).
