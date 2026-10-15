# Mini Subway — traçabilité des exigences

État : ✅ fait et testé · 🟡 fait mais non testé automatiquement, ou partiel · ❌ non fait.
Tests : `E` = tests/engine.test.mjs, `U` = tests/ui.cjs, `M` = tests/multi.cjs,
`R` = firebase/tests/mini-subway.test.js, `C` = captures + revue visuelle.

## Simulation (§1–§7, §24 « Fonctionnement »)

| Exigence | Où | Test | État |
|---|---|---|---|
| Stations selon une graine déterministe, croissance progressive, hors eau/parcs, espacées, sans faux lien visuel | sim.js `spawnStation`, `placeable` | E « graine et croissance » | ✅ |
| Formes communes et spéciales, rares uniques, jamais deux de suite | params.js, sim.js | E « formes spéciales » | ✅ |
| Station qui change de forme (modificateur de carte) | sim.js `shapeChange`, maps.js Delta Sauge | E « station qui change de forme » | ✅ |
| Passagers : destination = forme ; files non uniformes ; pression croissante | sim.js `spawnPassenger` | E « voyageurs » | ✅ |
| Capacité de station par carte/forme, pôle 18 | sim.js `stationCapacity` | E « pôle d'échange » | ✅ |
| Alerte de surcharge (anneau), récupération, suspension pendant le service | sim.js `updateOverload` | E « surcharge et modes » | ✅ |
| Lignes ordonnées, colorées, validées (≥ 2 stations, sans doublon, sans branche) | sim.js `line` | E « création, validations, limites » | ✅ |
| Prolongement, raccourcissement, insertion, suppression, retrait d'une station | sim.js, input.js, game.js | E, U « souris », « panneaux » | ✅ |
| Boucles sans oscillation | sim.js `nextStop`, `loopDirs` | E « boucle », U « boucle » | ✅ |
| Croisement visuel ≠ correspondance | graphe de routage | E « croisement visuel » | ✅ |
| Correspondances avec coût de temps, plus rapides en pôle | sim.js routage + `transferTicks` | E « correspondance » | ✅ |
| Itinéraire impossible puis possible, recalcul au changement de réseau | sim.js `routes` (netVer) | E « itinéraire impossible » | ✅ |
| Aucun passager perdu, dupliqué ni livré deux fois | sim.js `audit` | E « longue partie », « suppression d'une ligne » | ✅ |
| Trains : capacité finie, wagons +6, classes standard/express/tram, max 4 par ligne, réaffectation sans duplication | sim.js | E « capacité », « plusieurs trains », « express » | ✅ |
| Ponts/tunnels nécessaires, compteur = ressources posées, restitution | sim.js `countCrossings`, `inventory` | E « franchissement de l'eau » | ✅ |
| Budget hebdomadaire : locomotive + 2 choix distincts, ligne sous le maximum, exceptions de carte | sim.js `offerReward` | E « récompenses » | ✅ |
| Score = passagers réellement livrés | sim.js `dwell` | E « livraison simple » | ✅ |
| Temps : pas fixe, pause 0×, 1×, 2× pilotés par l'horloge | sim.js `step` | E « pause et vitesse », U « clavier » | ✅ |

## Modes, cartes, progression (§8–§10, §16)

| Exigence | Où | Test | État |
|---|---|---|---|
| Classique / Infini (efficacité) / Extrême (verrouillage) / Créatif (éditeur, illimité, annuler) | params.js `MODES`, sim.js | E « surcharge et modes », U « Créatif » | ✅ |
| Défi du jour, défi de la semaine (modificateurs, objectif), tentative officielle unique, entraînement | progress.js, main.js | E « défis et progression » | ✅ (local seulement) |
| Classement partagé vérifié | — | — | ❌ volontairement : pas de serveur de confiance (QUESTIONS.md) |
| 6 cartes originales, particularités en données, aucune branche par nom de carte | maps.js | E « particularités de cartes » | ✅ |
| Déblocage de cartes par objectifs, conditions affichées | progress.js `isUnlocked` | E, U « accueil » | ✅ |
| Records par carte et mode, historique, succès (11), migration du profil | progress.js, store.js | E, U « fin de partie » | ✅ |
| Fin de partie : station fautive montrée, score, statistiques, graine, rejouer | game.js `showOver` | U « fin de partie » | ✅ |
| Export d'image de la carte (sans interface) | game.js `exportImage` | U « réglages » | ✅ |
| Rejeu par graine + journal d'actions | sim.js (déterministe), LocalSession.log | E « même graine » | 🟡 graine saisissable, pas d'interface de relecture |

## Interface, accessibilité, audio (§11–§15, §24 « Interface »)

| Exigence | Où | Test | État |
|---|---|---|---|
| Souris : tracé, poignées, ressources du dock (glisser), panneaux | input.js, game.js | U | ✅ |
| Tactile : tracé, toucher-toucher pour les ressources, pincement | input.js | U « mobile » | ✅ tracé tactile testé ; 🟡 pincement non testé automatiquement |
| Clavier : Espace, 1, 2, Échap, F, M, +/−, Ctrl+Z/Y ; focus visible | game.js `key`, style.css | U « clavier », « accueil » | ✅ |
| Zoom/pan sans conflit avec le tracé, recadrage automatique, recentrage | input.js, game.js `fit` | U « molette et glisser » | ✅ |
| Menu pause, redémarrage confirmé, quitter | game.js | U « recommencer » | ✅ |
| HUD : horloge (jour, semaine), score, vitesse, inventaire, alertes, carte et mode | index.html, game.js | C | ✅ |
| Jour / Nuit / Daltonien (palette + numéros), contraste renforcé, grands repères | render.js, main.js | U « réglages », C | ✅ |
| Mouvement réduit (système ou réglage) | game.js, style.css | U « réglages » | ✅ |
| Pas de débordement desktop / mobile, cibles tactiles ≥ 24 px | style.css | U « accueil », « mobile » | ✅ |
| Audio original synthétisé, musique adaptative, volumes séparés, coupure, rien avant interaction | audio.js | U « clavier » (coupure) | 🟡 écoute non automatisable |
| Pause au changement d’onglet (option) | game.js | — | 🟡 implémentée, non testée automatiquement |
| Vibrations (option) | game.js | — | 🟡 implémentées, non testées (matériel) |

## Multijoueur (§25)

| Exigence | Où | Test | État |
|---|---|---|---|
| Salon : code, présence, prêt, départ par l'hôte, code inconnu, partie pleine, départ concurrent | net.js `Lobby` | M, R | ✅ |
| Commandes (id unique, auteur, tick, type, paramètres), ordre stable, idempotence | net.js `append`, `applyRec` | M « commande rejouée », R | ✅ |
| Coopération : monde, inventaire, score communs ; dépense atomique ; édition concurrente tranchée | net.js, sim.js `rev` | M | ✅ |
| Temps partagé : pause/vitesse par l'hôte ; récompense au premier qui valide | net.js | M « pause et vitesse » | ✅ |
| Versus : même graine et mêmes apparitions, réseaux indépendants, vue adverse en lecture seule | sim.js `indep`, game.js `drawOpponent` | E, M | ✅ |
| Versus : premier réseau saturé perd, même tick → score, sinon nul | sim.js `duelOutcome` | E « issue du duel » | ✅ |
| Commande sur le réseau adverse impossible | règles `ms/…/cmds/by`, net.js `onReq` | R, M | ✅ |
| Déconnexion : fenêtre de reconnexion, pause (coop) ; reconnexion et rattrapage ; abandon | net.js `hostDuties` | M | ✅ |
| Fin de match commune, revanche avec nouvelle graine | net.js, game.js | M | ✅ |
| Empreintes d'état, resynchronisation | net.js `hashAt`, `resync` | M « empreintes » | ✅ (détection testée ; resynchronisation non provoquée) |
| Hôte déconnecté | — | — | 🟡 la partie se fige jusqu'à son retour, pas de migration d'hôte |
| Point d'extension handicaps versionné, sans effet | sim.js `applyHandicaps`, `cfg.handicaps` | — | ✅ |

## Qualité

| Exigence | Où | Preuve | État |
|---|---|---|---|
| Longues parties, performance (< 15 µs par tick) | sim.js | E « longue partie » | ✅ |
| Revue visuelle indépendante, 3 gates | docs/revue/ | gate1.md, gate2.md, gate3.md | voir rapports |
| Données de carte séparées du moteur | maps.js / params.js | — | ✅ |
| Code, sons, visuels originaux ; nom unique « Mini Subway » | tout le dossier | revue | ✅ |
