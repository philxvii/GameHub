# Revue visuelle — Gate 2 — Mini Subway

Relecteur indépendant. J'ai lu chacune des 21 captures `docs/captures/gate2-*.png` une fois, à taille native. Le code n'a été lu que pour rédiger des corrections précises (`fit()` dans `js/game.js`). Les annonces de l'implémenteur ont été vérifiées sur les images, sans être prises pour acquises.

## 1. Verdict global : **REFUSÉ**

Le progrès est net. Trains, alerte de surcharge, panneau de ligne, récompense, fiche de départ, eau, ponts et fin de partie sont corrigés et lisibles. Il reste pourtant 5 défauts majeurs sur des écrans essentiels :

- Mobile et tablette : le cadrage coupe encore le réseau.
- Carte dense : stations sous le HUD, alerte tronquée, repères d'alerte affichés à tort.
- Aperçu de tracé : on ne le distingue pas d'une ligne posée et il masque la ligne existante.

Aucun nom d'un autre jeu commercial n'est visible.

## 2. Statut des défauts du gate 1

| id | Statut | Preuve (capture gate2) |
|---|---|---|
| G1-01 | **corrigé** (preuve fournie) | drawing : glisser en cours, stations cibles avec halo ambre, cible accrochée en pointillé (470,287). La qualité de l'aperçu pose un nouveau problème : voir G2-01. |
| G1-02 | **corrigé** | Trains cerclés d'encre, avec glyphes à bord lisibles : network (263,161), drawing (833,318), creative (325,545), coop (690,307). |
| G1-03 | **partiel** | Corrigé sur les cartes normales : étiquette papier, côté libre (network : file sous le triangle (185,195) ; overload : file au-dessus (808,295)), compteurs « +n » dans dense. Reste à faire : dans dense, les étiquettes chevauchent stations et lignes (voir G2-03). Sur mobile, les glyphes font encore environ 6 px (mobile-game (140,290)). |
| G1-04 | **partiel — majeur restant** | Les cartes normales respectent la zone sûre. Dans dense, ce n'est pas le cas : station sous l'horloge (135,65) et son « +13 » sous la carte ; stations sous le dock (800,1000) et (1075,1000) ; « +10 » et « +17 » sous le dock ; file coupée au bord gauche (0–90,1020). |
| G1-05 | **corrigé** | overload : anneau à l'encre, halo rosé, intérieur teinté, pastille HUD « 1 station critique ». L'alerte ne se confond plus avec la ligne rouge. Effet secondaire : voir G2-04. |
| G1-06 | **corrigé** | panel-line : le panneau (926–1244 × 82–370) laisse la ligne 1 entièrement visible, sélection en halo. |
| G1-07 | **corrigé** (réserve mineure) | play-sheet : textes avec marge, vignettes verrouillées de même hauteur (titres à y = 462). Réserve : l'anneau de focus du bouton retour est toujours à environ 4 px du titre « Nouvelle partie ». |
| G1-08 | **non corrigé — majeur** | mobile-game : la ligne rouge sort à gauche (0,345) et à droite (390,370), sans repère. Le cadre du monde s'arrête à y = 640 et laisse une bande vide de 75 px au-dessus des commandes. La dernière ressource du dock est coupée (◉ à x = 375). tablet-game : la ligne rouge sort à gauche (0,500) vers une station hors champ, alors que la zone 700–940 est vide. |
| G1-09 | **corrigé** (réserve mineure) | reward : étapes « 1 · Matériel » et « 2 · Amélioration », sélection en bordure épaisse avec coche, focus en pointillé. Réserve : les titres de la 2e rangée sont décalés de 6 px (« Wagon » à y = 615, « Nouvelle ligne » à y = 609). |
| G1-10 | **partiel** | colorblind : les pastilles 1, 2 et 3 sont lisibles au-dessus des stations. L'extrémité orange côté pôle (372,355) n'a pas de pastille (voir G2-07). |
| G1-11 | **corrigé** | menu et network : confluence propre, plus de losanges. |
| G1-12 | **corrigé** | La bande de droite a disparu (night, colorblind). Dans dense, le bord de carte est encré et l'eau est découpée au cadre. Effet secondaire : voir G2-06. |
| G1-13 | **corrigé** | Extrémités écartées en éventail : game-start (650,270)/(680,335), network (505,265)/(535,265), creative (578,455). Seul le triangle de dense (1035,425) reste chargé. |
| G1-14 | **corrigé** | Bouton × sur l'indice (game-start) ; indice absent après le 1er jour (network, overload, dense). |
| G1-15 | **corrigé** | creative : barre sur une seule rangée, station losange (968,705) visible. Les libellés des formes ne peuvent pas être jugés sur une image fixe. |
| G1-16 | **corrigé** | game-over : station fautive cerclée et centrée (770,385), mention « cerclée sur la carte », chevron de `<details>` stylé, modale décalée pour dégager la station. |
| G1-17 | **corrigé** | Ponts en parapets encrés (menu (985,325), game-start (980,410), network). Lecture cartographique juste. |
| G1-18 | **partiel** | La valeur « 0 % » est affichée. La carte d'état entre en collision avec la colonne de droite (voir G2-02). |
| G1-19 | **partiel** | Parcs de nuit lisibles (1115,635). Le grain papier reste imperceptible en Nuit et les glyphes blancs sont petits (645,128). |
| G1-20 | **corrigé** | mobile-menu : le logo ne chevauche plus la carte décorative. Nouvel effet de bord : voir G2-06. |

## 3. Nouveaux défauts

| id | Écran / capture | Emplacement précis | Gravité | Impact | Correction conseillée |
|---|---|---|---|---|---|
| G2-01 | drawing | Tronçon d'aperçu vert entre le cercle (557,431) et le carré (812,641) ; extrémité libre (513–535,358–395) | **majeur** | L'aperçu est tracé plein, opaque, à l'épaisseur d'une ligne posée : on ne le distingue pas d'un tracé validé. Il recouvre entièrement la ligne bleue existante, dont le train semble rouler sur le vert (718,547). L'extrémité libre se réduit à 3 points espacés, sans poignée, et l'extrémité bleue (540,395) masque son départ. | `drawPreview` : tracé avec `setLineDash([LINE_W*1.6, LINE_W])`, `globalAlpha` 0,85 et liseré papier de 3 px. Décaler l'aperçu avec `lineOffsets` quand il partage un tronçon existant. Extrémité libre : trait continu fin (LINE_W×0,6) jusqu'au curseur, terminé par un disque de 7 px. Dessiner les extrémités des autres lignes à 35 % d'opacité pendant le glisser (`ui.dimLines`). |
| G2-02 | dense, overload | Carte d'état : pastille « 25 stations critiq… » tronquée à x = 1860 par la colonne vitesse (dense). Dans overload, la carte (bas à y = 98) chevauche la colonne (haut à y = 90). | **majeur** | L'alerte principale du HUD est coupée précisément sur l'écran où elle compte le plus. Le HUD se superpose à lui-même. | Placer `.hud-right` sous la carte d'état mesurée (ResizeObserver sur `.score` → `--score-h`, `top: calc(12px + var(--score-h) + 8px)`) et appeler `measureSafe()` à chaque changement de taille. Pastille : `white-space:nowrap`, texte court (« 25 critiques »), sans `overflow` caché. |
| G2-03 | dense | Repères « hors zone » (cercle rouge avec forme et pointe) en (361,155), (1313,970), (1420,970), (1718,970). Étiquettes de file : (1230–1300,460) à gauche du carré alors que son « +46 » est à droite (1380,480) ; étiquette (850–940,470) posée sur la ligne bleue ; étiquette (1300–1370,305) au-dessus d'une autre station. | **majeur** | Des repères désignent des stations pourtant visibles et ressemblent à des stations supplémentaires : faux signaux d'alerte. Compteurs séparés de leur file, étiquettes qui masquent lignes et stations. La lecture de la carte dense, déjà saturée, se dégrade. | `drawOffscreen` : ne poser un repère que si la station est réellement cachée, c'est-à-dire si son centre ±r tombe sous un rectangle DOM du HUD ou hors du canevas, et pas seulement hors de la zone sûre élargie. Repère en forme de flèche au bord, pas de disque. `drawQueue` : placer « +n » dans la même étiquette que la file. Tester 4 positions (E, O, N, S) et garder celle qui ne coupe ni station ni segment ; au pire, réduire à une rangée + « +n ». |
| G2-04 | overload | Halo d'alerte rosé autour du triangle (808,360) | mineur | Le halo est dessiné par-dessus les lignes : la ligne bleue paraît violette entre 820 et 860. | `drawStations` : dessiner le halo d'alerte dans une passe placée avant `drawLines`, ou le limiter à l'intérieur de la station. |
| G2-05 | tablet-game, coop, network | Trains à quai sur la station : bleus empilés (555,378) et (567,397) sur le triangle (tablet) ; trains rouges qui se chevauchent (660–700,307) (coop) ; train vert sous le cercle (517,315) (network) | mineur | Les trains masquent la forme de la station et se superposent. | `trainGeom` (dwell) : reculer le train de `ST_R + Lc/2 + 3` le long du segment. Pour plusieurs trains à quai sur une même station et une même ligne, les décaler de `Lc + 4`. |
| G2-06 | menu, mobile-menu, mobile-game | Bord de monde encré visible sur le menu : filet en haut (y ≈ 8) et rupture de teinte (x ≈ 213) sur desktop ; filet horizontal à travers « Subway » (y ≈ 437) sur mobile ; filet sous le HUD (y = 72) et bande hors carte (640–715) en jeu mobile | mineur | Lignes parasites qui traversent le logotype et l'écran. | Désactiver le bord encré et le cadre du monde pour le rendu du menu (option `frame:false` du `Renderer`). En jeu, ne pas laisser apparaître le hors-carte quand la place manque : `fit()` doit prolonger le papier ou recentrer. |
| G2-07 | colorblind | Extrémité orange (ligne 1) au pôle (372,355) | mineur | Pas de pastille « 1 » à cette extrémité, alors que les lignes 2 et 3 en ont une. | Vérifier que la passe des pastilles parcourt bien les deux extrémités (`end` 0 et 1) quand la station est un pôle. Écarter cette pastille des pastilles 2 et 3 (éventail). |
| G2-08 | coop | Bandeau des joueurs (12–124 × 80–160) et carte | mineur | Les couleurs des joueurs (Alice rouge, Bob bleu, Carol vert) sont celles des lignes 1 à 3 : cela suggère une propriété des lignes qui n'existe pas. Rien ne montre l'activité des coéquipiers sur la carte : ni curseur, ni dernier tracé, ni état de connexion dans le bandeau. | Couleurs de joueur hors palette des lignes (ou initiales dans une pastille encre). Afficher le curseur et l'aperçu de tracé des coéquipiers, avec une étiquette de nom en Plex Mono. Ajouter un point d'état (connecté / inactif) dans le bandeau. À démontrer par une capture au gate 3. |
| G2-09 | versus | Encart adverse (917–1215 × 89–307) | mineur | Le réseau de Bob est rouge alors que sa couleur de joueur est bleue. L'encart ne porte aucun libellé « Adversaire · lecture seule ». | Dessiner l'encart avec la couleur du joueur, ou retirer la couleur du bandeau. Ajouter un en-tête mono « ADVERSAIRE · LECTURE SEULE » et le nombre en attente à côté du score. |
| G2-10 | versus-end | Modale « Victoire » | mineur | « 1 voyageurs livrés » : faute d'accord. Pas de comparaison visuelle des deux scores, seulement la phrase « 1 contre 1 ». La modale est décalée à droite sans station à montrer et couvre l'encart adverse. | Accorder au singulier et au pluriel (`n > 1 ? 'voyageurs livrés' : 'voyageur livré'`). Deux colonnes « Vous » / « Bob » (score en Plex Mono 40 px, mini-carte). Modale centrée quand il n'y a pas de station fautive. |
| G2-11 | lobby | Fond et liste des joueurs | mineur | Fond papier nu, contrairement au menu (pas de carte décorative). « HÔTE » est dans le même vert que « PRÊT », si bien que l'état de l'hôte n'est pas indiqué. | Reprendre la carte décorative du menu sous le voile. Étiquette hôte en encre ou ambre, état prêt affiché séparément. |

**Décompte des défauts ouverts :** 0 bloquant, 5 majeurs (G1-04, G1-08, G2-01, G2-02, G2-03), 12 mineurs. Les mineurs sont les réserves et restes de G1-03, G1-07, G1-09 et G1-19, plus G2-04 à G2-11. Les restes de G1-10 et G1-18 sont comptés dans G2-07 et G2-02.

## 4. Notes /10

| Catégorie | Note | Plan de correction (note < 8) |
|---|---|---|
| Direction artistique | 8 | — (retirer les filets parasites du menu, G2-06 ; grain en Nuit, G1-19) |
| Lisibilité du réseau | 6 | Aperçu de tracé distinct (G2-01). Étiquettes et repères de la carte dense (G2-03). Trains à quai (G2-05). Glyphes mobile ≥ 8 px à l'écran (G1-03). |
| Composition | 6 | Cadrage mobile et tablette (G1-08). HUD dense (G1-04, G2-02). Modale de fin de duel centrée (G2-10). |
| Typographie | 8 | — (accord « voyageur(s) », G2-10 ; pastille HUD sans troncature, G2-02) |
| Animations (états visibles) | 6 | États de glisser (G2-01 : aperçu, extrémité libre, atténuation des autres lignes). Halo d'alerte sous les lignes (G2-04). Les états de survol et de focus sont maintenant distincts : à conserver. |
| Retours d'action | 7 | Alerte HUD non tronquée (G2-02). Repères uniquement pour les stations réellement cachées (G2-03). Présence des coéquipiers (G2-08). |
| Interface de jeu | 7 | Collision HUD et colonne (G2-02). Dock mobile complet (G1-08). |
| Interface multijoueur | 6 | Couleurs de joueur distinctes des lignes et présence des coéquipiers (G2-08). Encart adverse libellé et à la bonne couleur (G2-09). Fin de duel comparative (G2-10). Salon habillé (G2-11). |
| Mobile | 4 | `fit()` doit contenir toutes les stations : en ce moment, mobile et tablette coupent le réseau malgré `measureSafe`. Vérifier `autoCam` et l'appel `fit(true)` après le premier rendu et après `resize`. Ajouter un test navigateur qui vérifie que chaque station est dans `R.safe` après le recadrage. Afficher un repère de bord neutre (encre) pour toute station hors champ, pas seulement celles en alerte. Dock sans débordement (G1-08), sans bande hors carte (G2-06). |
| Finition générale | 7 | Réserves de G1-07 et G1-09. G2-04 à G2-06, G2-10. |

## 5. Points forts à préserver

- Trains cerclés d'encre avec glyphes à bord : très bonne lisibilité sur les cartes normales.
- Alerte de surcharge (anneau encre, intérieur teinté, halo, pastille HUD) : enfin distincte des lignes.
- Ponts en parapets encrés et eau unifiée : vrai vocabulaire de carte imprimée.
- Fin de partie qui cadre et cercle la station fautive. Récompense en deux étapes nommées.
- Panneau de ligne qui laisse la ligne visible. Extrémités en éventail. Indice fermable et éphémère.
- Salon : code d'invitation en Plex Mono sur cartouche encre, très identitaire.
