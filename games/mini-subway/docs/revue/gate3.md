# Revue visuelle — Gate 3 (final) — Mini Subway

Relecteur indépendant. J'ai lu chacune des 21 captures `docs/captures/gate3-*.png` une fois, à taille native. Pour mesurer les tailles sur mobile, j'ai fait un agrandissement ×4 (plus proche voisin) d'une zone de `gate3-mobile-game.png`. Aucun code n'a été modifié. Les annonces de l'implémenteur ont été vérifiées sur les images.

## 1. Verdict global : **REFUSÉ** (un seul défaut majeur restant)

Sur desktop, tablette et en multijoueur, le jeu est désormais au niveau attendu. La carte dense est lisible et ne passe plus sous le HUD. L'aperçu de tracé est distinct. L'alerte de surcharge est claire. La fin de duel est correcte et l'encart adverse est libellé.

Un défaut majeur bloque encore la validation, sur un écran essentiel : **le jeu sur mobile est à une échelle injouable**.

Aucun nom d'un autre jeu commercial n'est visible.

## 2. Statut des défauts ouverts au gate 2

| id | Statut | Preuve (capture gate3) |
|---|---|---|
| G1-03 (files : tailles) | **partiel** | Sur desktop, les files sont lisibles. Sur mobile, les glyphes mesurent environ 6 px et non ≥ 7 px comme annoncé (agrandissement ×4 de mobile-game : glyphes ▲ ■ de 24 px agrandis, soit 6 px natifs). Le reste est rattaché à G3-01. |
| G1-04 (dense, zone sûre) | **corrigé** | dense : tout le monde est cadré entre l'horloge et la carte d'état (cadre 283–1575 × 160–968). Plus aucune station sous le HUD ni sous le dock (dock à y ≥ 1003). |
| G1-07 (réserve focus retour) | **non corrigé** (mineur) | play-sheet : l'anneau de focus du bouton retour est toujours à environ 4 px du titre « Nouvelle partie ». |
| G1-08 (cadrage mobile et tablette) | **corrigé pour le cadrage, majeur déplacé en G3-01** | tablet-game : réseau entier visible, plus de ligne qui sort de l'écran. mobile-game : réseau entier visible, dock complet (◉ à x = 355–375). Mais l'échelle obtenue rend le jeu injouable (G3-01). |
| G1-09 (réserve alignement) | **non corrigé** (mineur) | reward : « Wagon » à y = 615, « Nouvelle ligne » à y = 609. |
| G1-19 (grain en Nuit) | **corrigé** | night : grain perceptible sur le fond, parcs lisibles. |
| G2-01 (aperçu de tracé) | **corrigé** (réserve mineure) | drawing : tronçon accroché estompé avec halo papier et âme pointillée (600–800, 430–620), fil fin et poignée ronde au curseur (512,348). On le distingue enfin d'une ligne posée. Réserve : le halo papier cache toujours la ligne bleue en dessous, seul son train (728,552) la trahit. |
| G2-02 (HUD dense) | **corrigé** | dense : pastille « 27 critiques » entière (1768–1893,105) ; colonne vitesse sous la carte (y ≥ 140). overload : « 1 critique », colonne à y = 112, sans chevauchement. |
| G2-03 (repères et étiquettes dense) | **corrigé** (réserve mineure) | dense : aucun repère parasite ; les « +n » sont du côté de leur file (« +13 » à gauche en (405,443), « +12 » à droite en (362,163)). Réserve : l'étiquette (870–935,505) et son « +74 » couvrent la ligne bleue ; l'étiquette (1255–1300,925) est coincée entre deux stations, sur la ligne verte. |
| G2-04 (halo sur les lignes) | **corrigé** | overload : la ligne bleue garde sa couleur à travers le halo (820–860,365). |
| G2-05 (trains à quai) | **non corrigé** (mineur) | Des trains se superposent encore aux stations : network, vert sous le pôle (553,335) et bleu sur le triangle (1008,305) ; game-start, rouge sur le cercle (687,314) ; creative, rouge sur l'étoile (315,555). Trains qui se chevauchent : coop (595–620,382). |
| G2-06 (filets du menu) | **corrigé** | menu, mobile-menu : plus de cadre ni de filet. Voir toutefois G3-02 en jeu. |
| G2-07 (pastille daltonien au pôle) | **non corrigé** (mineur) | colorblind : l'extrémité orange (ligne 1) au pôle (390,385) n'a toujours pas de pastille. Seul « 1 » à (369,567) est présent. |
| G2-08 (coop) | **partiel** | coop : badges J1 à J3 à l'encre, il n'y a plus de confusion avec les couleurs de ligne. Toujours aucune présence des coéquipiers sur la carte (curseur, aperçu de tracé) ni d'état de connexion dans le bandeau. |
| G2-09 (encart adverse) | **corrigé** | versus : « RÉSEAU ADVERSE · LECTURE SEULE », Bob, score 0. |
| G2-10 (fin de duel) | **corrigé** | versus-end : modale centrée, « 1 voyageur livré », « Vous 1 · adversaire 0 ». |
| G2-11 (salon) | **partiel** | lobby : étiquette « HÔTE » ambre, distincte de « PRÊT ». Le fond reste un papier nu, sans carte décorative. |

## 3. Nouveaux défauts

| id | Écran / capture | Emplacement précis | Gravité | Impact | Correction conseillée |
|---|---|---|---|---|---|
| G3-01 | mobile-game (390×844) | Toute la carte : le monde occupe 390×260 px (y = 248–507), avec 190 px de vide au-dessus et 210 px en dessous | **majeur** | Mesures en natif : stations d'environ 11 px de diamètre, voyageurs d'environ 6 px, traits d'environ 3 px, trains d'environ 10×6 px. Les destinations ne se lisent pas, et tracer d'une station de 11 px à une autre au doigt est irréaliste (cible tactile recommandée : 44 px). Environ 70 % de l'écran est vide. | En portrait, ne plus faire tenir toute la largeur du réseau. `fit()` mobile : fixer un zoom plancher tel que `ST_R * k * z ≥ 11` (rayon de station ≥ 11 px à l'écran, voyageurs ≥ 8 px), centrer sur le barycentre des stations en alerte puis des plus récentes, et signaler les stations hors champ par des repères de bord neutres (encre, pas seulement en alerte). Autre option complémentaire : sur mobile, monter le plafond du facteur de lisibilité `k` de 1,7 à environ 2,6. Vérifier aussi que le pincement pour zoomer et le glisser à deux doigts pour panoramiquer existent et sont signalés dans l'indice mobile. Cibles de toucher des stations : `stationAt(..., slop)` ≥ 22 px écran. |
| G3-02 | colorblind, night, game-over, tablet-game | Bord du monde encré visible en jeu : verticale x ≈ 1397 et horizontale y ≈ 893, avec une bande hors carte sous la colonne vitesse (colorblind, night). game-over : le zoom sur la station fautive expose le coin du monde, avec 318 px de vide à gauche et 360 px en bas. tablet : bandes hors carte de 130 px en haut et 105 px en bas. | mineur | Le monde apparaît comme une carte posée sur un bureau, avec une composition déséquilibrée à la fin de partie. Le filet passe sous les commandes. | Contraindre la caméra (`cam`) pour que le cadre du monde couvre le canevas dès que le zoom le permet ; sinon, centrer le cadre. Pour game-over, décaler la station fautive dans la moitié gauche visible, en gardant cette contrainte. Assumer le filet encré seulement quand tout le monde est affiché (dense, mobile). |

**Décompte des défauts ouverts :** 0 bloquant, **1 majeur** (G3-01), 10 mineurs :

- G1-03 : la partie mobile est comptée dans G3-01.
- G1-07 : focus du bouton retour.
- G1-09 : alignement de la récompense.
- G2-01 : réserve sur l'aperçu de tracé.
- G2-03 : réserve sur les étiquettes de la carte dense.
- G2-05 : trains à quai.
- G2-07 : pastille daltonien au pôle.
- G2-08 : présence des coéquipiers.
- G2-11 : fond du salon.
- G3-02 : bord du monde.

## 4. Notes /10

| Catégorie | Note | Plan de correction (note < 8) |
|---|---|---|
| Direction artistique | 8 | — (G3-02 : bord du monde en jeu) |
| Lisibilité du réseau | 7 | Échelle mobile (G3-01). Trains à quai hors des stations (G2-05). Étiquettes de la carte dense qui ne couvrent aucune ligne (G2-03). Aperçu qui laisse voir la ligne recouverte (G2-01 : halo papier à 50 %, ligne existante redessinée par-dessus en fin de passe à 60 %). |
| Composition | 7 | Mobile (G3-01). Cadrage contraint au monde et fin de partie équilibrée (G3-02). |
| Typographie | 8 | — |
| Animations (états visibles) | 8 | — (états de tracé, sélection, focus et alerte pulsée désormais distincts) |
| Retours d'action | 8 | — (cause de défaite cerclée, alerte HUD, aperçu, indice fermable) |
| Interface de jeu | 8 | — (réserves G1-07, G1-09) |
| Interface multijoueur | 7 | Afficher la présence des coéquipiers en coopération : curseur et aperçu de tracé avec badge J2/J3, point d'état dans le bandeau (G2-08). Carte décorative sous le salon (G2-11). |
| Mobile | 4 | G3-01 : zoom plancher et repères de bord, cibles tactiles de 44 px, glyphes ≥ 8 px. Le menu mobile est bon. |
| Finition générale | 8 | — (mineurs listés en section 3) |

## 5. Points forts à préserver

- Carte dense à 1920×1080 : désormais cadrée, avec HUD dégagé, alerte chiffrée, étiquettes papier et compteurs « +n ».
- Aperçu de tracé : halo papier, âme pointillée, fil vers une poignée ronde. Lecture immédiate.
- Trains cerclés d'encre, ponts en parapets, eau unifiée : vocabulaire cohérent de carte imprimée.
- Alerte de surcharge : anneau encre, intérieur teinté, halo sous les lignes, pastille HUD.
- Multijoueur : salon très identitaire (cartouche du code), badges J1 à J4 à l'encre, encart adverse libellé, fin de duel centrée et chiffrée.
- Menu desktop et mobile : propre, sans artefact.
