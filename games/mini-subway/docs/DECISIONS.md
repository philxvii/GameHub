# Mini Subway — décisions

Choix d'implémentation importants, alternatives examinées et raisons. Les valeurs
numériques vivent dans `js/engine/params.js` (défauts) et `js/engine/maps.js` (cartes).

## Architecture

| Décision | Alternatives | Raison |
|---|---|---|
| Modules ES natifs, aucune dépendance côté jeu, rendu Canvas 2D | Pixi/Three, framework UI | Site statique sans build (règle du dépôt) ; le réseau est un dessin vectoriel simple ; Canvas 2D suffit en 60 i/s avec ~60 stations. |
| Moteur pur dans `js/engine/` (aucun accès au DOM), testable sous Node | Simulation dans la boucle de rendu | Exigence du cahier (§17.3) : tests sans navigateur, déterminisme, multijoueur lockstep. |
| Pas fixe : 20 ticks/s ; la vitesse règle le nombre de sous-pas de temps de jeu par tick (0, 1, 2) | Pas variable, `dt` réel | Indépendant du nombre d'images ; le même compteur de ticks sert d'horloge commune en réseau, même en pause. |
| `tick` (horloge lockstep, avance toujours) distinct de `t` (temps de jeu, s'arrête en pause) | Une seule horloge | La pause est une commande comme les autres : tous les clients la voient au même tick. |
| État = objet JSON ; caches (géométrie, routage) hors état dans une `WeakMap` | Classes avec méthodes | Instantané, empreinte et rejeu triviaux ; aucun cache ne peut diverger entre clients. |
| Géométrie sans trigonométrie dans le moteur (+ − × ÷ √ seulement) | `Math.sin/atan2` | Ces fonctions peuvent différer d'un navigateur à l'autre : interdit pour un état partagé. Le rendu, lui, peut les utiliser. |
| Inventaire « possédé − placé » calculé à la volée | Compteurs décrémentés | Le compteur de ponts, trains, wagons, pôles correspond toujours aux ressources réellement posées (§4.8) ; aucun double comptage possible. |
| Tracés octilinéaires (un segment droit + un à 45°), forme indépendante du sens | Lignes droites, courbes | Lecture « plan de métro » ; le train suit exactement le tracé dessiné ; franchissements calculés sur ce même tracé. |
| Franchissement d'eau = nombre d'entrées dans l'eau le long du tracé (échantillonné tous les 5 unités) | Intersection exacte de polygones | Simple, déterministe, gère rivières, îles et lacs ; une ressource par entrée dans l'eau. |

## Règles précisées (le cahier laisse le choix)

- **Destination par forme (§6.4)** : le voyageur suit l'itinéraire de coût minimal vers *n'importe quelle* station de sa forme ; il est livré à la première station compatible rencontrée.
- **Routage (§6.2–6.3)** : graphe quai/arrêt ; coût = trajet + arrêt, correspondance (2 s, 0,5 s en pôle d'échange), attente = demi-intervalle entre deux trains de la ligne (temps d'un aller-retour ÷ trains ÷ 2). Recalcul seulement quand le réseau change (`netVer`).
- **Embarquement** : un voyageur monte si partir maintenant avec ce train coûte au plus l'optimum attendu à quai (attente comprise). Première version : « ligne strictement optimale » — rejetée après mesure : des voyageurs routables laissaient passer des trains vides (voir la mesure ci-dessous).
- **Descente** : arrivé à destination, ou correspondance si descendre coûte strictement moins que rester. Sans plus aucun chemin à bord (ligne modifiée), descente explicite à la station : jamais de disparition.
- **Itinéraire impossible (§6.6)** : le voyageur attend à son origine ; la station n'indique rien de plus (pas de solution révélée).
- **Surcharge (§3.7)** : au-delà de la capacité, l'anneau se remplit en 38 s ; il redescend 1,6 fois plus vite quand la file repasse sous la capacité ; il est **suspendu tant qu'un train est à quai** dans la station (règle `pauseWhileServed`, testée).
- **Station d'échange** : capacité 18, montée/descente 2 ticks au lieu de 3, correspondance 10 ticks au lieu de 40 ; définitive (retirable seulement en Créatif).
- **Nouvelle ligne** : reçoit d'office une locomotive libre si possible (sinon la ligne reste sans train, voyageurs en attente).
- **Modification sous un train (§4.3)** : le train finit son tronçon « fantôme » puis reprend la ligne ; si sa destination disparaît, il fait demi-tour ; sinon il reprend au premier arrêt valide. Les voyageurs restent à bord.
- **Suppression de ligne / retrait de train** : trains et wagons reviennent dans l'inventaire ; les voyageurs à bord descendent à la station de destination du train, en correspondance.
- **Boucles** : les trains d'une boucle circulent dans un sens fixe, alterné d'un train à l'autre ; le routage ne considère que les sens réellement desservis.
- **Mode Extrême (§8.3)** : une ligne ne peut que s'allonger par ses extrémités (pas de raccourcissement, d'insertion, de bouclage ni de suppression) ; trains, wagons et pôles posés ne bougent plus. La pause reste possible (elle ne débloque rien).
- **Mode Infini** : jauge d'efficacité (+1,4 % par livraison, − proportionnel au dépassement des capacités) ; pleine, elle donne locomotive + amélioration au choix, puis repart à 25 %.
- **Créatif** : inventaire 99 de tout, pas de défaite, stations ajoutées/déplacées/supprimées/changées de forme, trafic et croissance réglables, annuler/rétablir (60 pas, instantanés).
- **Récompense** : en solo, le temps attend le choix (comme une pause). En réseau, le temps continue (horloge commune) ; sans choix au bout de 20 s de jeu, la première option est prise d'office.
- **Formes rares** : jamais deux de suite ; une station par forme rare au plus (`maxPerRare`) ; à partir de la semaine 2 (1 sur certaines cartes).
- **Files non uniformes (§3.5)** : jamais trois destinations identiques consécutives dans une station.
- **Station qui change de forme (§3.3)** : modificateur de carte (Delta Sauge, toutes les 3 semaines) ; annoncé par un anneau ambre et un message. Il est appliqué par le moteur et ne peut donc pas attendre la fin d'un geste de l'interface sans casser le déterminisme ; un tracé en cours n'est pas interrompu (il référence des identifiants de station, pas des formes).

## Équilibrage (§18, §22.1)

Mesuré avec le joueur automatique (`js/engine/autoplay.js`, volontairement naïf : il relie
chaque nouvelle station au moins cher, sans stratégie de boucles ni de correspondances),
4 graines × 6 cartes :

| Réglage | Score moyen bot | Semaine de fin | Durée |
|---|---|---|---|
| Valeurs de départ (vitesse 2,5, voyageur / 10,5 s) | ≈ 140 | 2,8 | 4 min |
| + règle d'embarquement corrigée | ≈ 150 | 2,8 | 4 min |
| vitesse 3,4, montée 3 ticks, voyageur / 13,5 s, croissance +18 %/sem., stations 38 s → 12 s | ≈ 300 | 4,3 | 6–7 min |

La dernière ligne est retenue : un joueur humain, qui boucle et répartit ses trains, tient
nettement plus longtemps que le bot. Ces valeurs restent des paramètres à recalibrer sur de
vraies parties (voir QUESTIONS.md).

## Multijoueur (§25)

| Décision | Alternatives | Raison |
|---|---|---|
| Lockstep à journal de commandes : l'hôte date chaque commande d'un tick futur et l'écrit une fois dans `cmds/cNNNNNN` ; tous les clients simulent | État complet publié périodiquement ; serveur arbitre | Le cahier interdit l'état par image ; pas de serveur (site statique, aucun service payant). |
| Tête du journal `head = {tick, n}` publiée ~7 fois/s, avance de 8 ticks (0,4 s) | Avance nulle | Un client n'avance jamais au-delà de `head.tick` et attend d'avoir les `n` commandes : aucune commande ne peut arriver « dans le passé ». |
| Identifiant unique par commande, ensemble des identifiants vus côté hôte | Numéros de séquence clients | Une demande rejouée (double clic, reconnexion) est sans effet ; la dépense de ressource est revalidée par le moteur au moment de l'application, dans l'ordre du journal : jamais deux fois. |
| Édition concurrente d'une ligne : la commande porte la révision `rev` de la ligne ; la seconde est refusée (« modifiée par un autre joueur ») | Fusion | Règle simple, testée avec deux clients. |
| Pause et vitesse : l'hôte seul (Coopération et Versus) | Vote | Plus simple et prévisible ; documenté dans l'aide. |
| Récompense en Coopération : la première personne qui choisit décide pour tous | Vote | Cahier §25.2 (option « premier qui valide »). |
| Versus : deux états, même graine, apparitions indépendantes des réseaux (`indep`) | Placement évitant les lignes | Les deux joueurs voient exactement la même séquence de stations et de voyageurs (testé). La règle « pas de station sur une ligne » est donc désactivée en Versus. |
| Empreinte d'état publiée tous les 100 ticks ; instantané de l'hôte toutes les 600 | Rien | Détection de dérive et resynchronisation. |
| Déconnexion : fenêtre de 45 s ; Coopération : pause automatique puis reprise ; au-delà, départ (la partie continue) ; Versus : la partie continue, au-delà abandon = défaite | — | Cahier §25.4. L'hôte déconnecté gèle la partie (il est l'horloge) jusqu'à son retour ; pas de migration d'hôte dans cette livraison. |
| Reconnexion : rechargement → reprise automatique (code gardé pour l'onglet) → rejeu du journal depuis le début | Instantané | Le rejeu déterministe est exact ; 20 min de partie se rejouent en environ une seconde. |
| Règles Firebase propres à `ms/` (plus strictes que le modèle commun) | Réutiliser `gameRules` | Les membres n'écrivent que leur fiche, leur présence et leurs demandes ; le journal est à écriture unique et réservé à l'hôte ; une commande journalisée porte l'auteur de sa demande ; en Versus elle ne vise que le réseau de son auteur. |
| Handicaps (§25.5) : champ versionné `cfg.handicaps = {v:1}` et `state.handicaps = {v, list: []}`, point d'application `applyHandicaps()` appelé à chaque sous-pas, sans effet | — | Extension future documentée ; aucune interface ni effet dans cette livraison. |

### Limites anti-triche (honnêtes)

Il n'y a pas de serveur de confiance. L'hôte fait foi : il ordonne le journal et règle
l'horloge. Les règles empêchent un invité d'écrire dans le journal ou d'agir sur le réseau
adverse, et empêchent l'hôte de fabriquer une commande au nom d'un invité ; mais un client
modifié peut toujours tricher sur *sa propre* simulation et l'hôte peut refuser de
journaliser des demandes. Aucun résultat multijoueur ni aucun défi n'est présenté comme un
classement vérifié : les records restent locaux.

## Intégration GameHub

- Entrée `games/mini-subway/index.html`, garde de maintenance copiée des autres jeux, carte dans `index.html`, entrée dans la liste `GAMES` de `404.html`.
- Le multijoueur (`js/net.js`, SDK Firebase) n'est chargé qu'à la demande : le solo fonctionne hors ligne une fois la page chargée.
- La liste des jeux de l'administration (index.html, purge des parties) n'a pas été modifiée (périmètre « admin » exclu) : les salons `ms/` ne figurent pas dans l'outil de purge. Les salons sont supprimés par l'hôte en quittant.
- Les règles de transition (`database.rules.transition.json`) n'incluent pas `ms/` : le jeu ne fonctionne en multijoueur qu'avec les règles de phase 2.
