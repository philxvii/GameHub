# Revue visuelle n° 2 : le jeu intégré

Relecteur indépendant. Je me fonde uniquement sur les captures `reports/premium/00-grille-des-24.jpg` et `reports/premium/ecrans/*` (1440×900, 1920×1080, 390×844), comparées à `reports/board/mon-tour.jpg` et `revelation.jpg`.

## 1. Verdict global

**L'interface progresse nettement par rapport à l'ancienne version.** Les cartes Polaroïd, le papier, le scotch, les titres manuscrits, les panneaux noirs et le texte monospace orange ont disparu. Les 24 cartes tiennent sans défilement en 1440×900, à côté d'un panneau de jeu lisible. La palette bleu encre, crème et corail est cohérente et ne ressemble en rien à Banqueroll.

**Verdict : REFUSÉ en l'état.**
- L'interface pourrait passer « avec réserves » une fois corrigés ses quatre bloquants (B2 à B5).
- Le casting reste un défaut majeur qui rend le plateau trompeur (B1). Un « Qui est-ce ? » dont les visages contredisent leurs propres attributs ne peut pas être livré comme un jeu premium.

## 2. Défauts

### BLOQUANTS

**B1. Les portraits contredisent leurs attributs (tous les écrans de plateau, toutes tailles).**
- Les 12 personnages étiquetés « ♀ » (Agathe, Clémence, Diane, Élise, Fatou, Hélène, Inès, Jade, Louise, Mireille, Nadia, Bérénice) sont le même visage masculin : mâchoire, pomme d'Adam, ombre de barbe. Résultat : la question « Femme ? » (12) n'a aucune traduction visuelle.
- « long » et « mi-long » n'apparaissent jamais : tout le monde porte le même casque de boucles courtes. C'est le cas d'Agathe (roux long), Diane (blond long), Jade (noir long), Inès (brun long) et Hélène (gris mi-long).
- « blond » est rendu châtain ou brun (Arthur, Diane, Louise, Mireille). « gris » est rendu brun (Bérénice, Étienne).
- Cyril et Malik sont étiquetés « chauve » mais ont des cheveux. Lucien est étiqueté « chauve » sous une casquette.
- On ne distingue ni « senior » de « jeune », ni la couleur des yeux à la taille du plateau.
- Conséquence : le jeu ne se joue qu'en lisant la légende texte sous chaque carte. L'image ment, et rien n'en avertit le joueur.
- Correction : afficher un bandeau explicite « Visages provisoires : fiez-vous aux légendes ». Au minimum, aligner les attributs sur ce qui est réellement visible (retirer « long », « blond » et « chauve » là où ils sont faux). Sinon, ne pas livrer avant d'avoir de vrais visages (voir §4).

**B2. Mobile : le fond s'arrête à la hauteur de l'écran (`390x844-7b-question-adverse-page.jpg`).**
- En dessous, la page est blanche.
- Les noms de la dernière rangée (Hugo, Kenji, Lucien, Malik) sont blancs sur blanc, donc illisibles.
- L'aide « Observe un visage » est invisible, et Kenji (écarté) se fond dans le fond.
- Une grande zone blanche vide termine la page.
- Correction : appliquer la couleur de fond sur `html` et `body`, avec `min-height: 100%` au lieu d'une hauteur fixée à l'écran.

**B3. Mobile, écran Réponse : grimaces (`390x844-5-reponse.jpg`).**
- Tous les portraits sauf Raphaël affichent une expression ratée : bouche entrouverte, dents visibles, regard fixe. L'effet est franchement dérangeant.
- En desktop, au même moment, les visages restent neutres.
- Correction : ne jamais montrer une image de réaction intermédiaire sur le plateau. Garder l'image neutre, ou limiter l'animation à la carte survolée ou touchée.

**B4. 1440×900, panneau « Ta question » rogné (écrans 3 et 4).**
- La rangée « Ce qu'il porte » (Lunettes, Casquette, Barbe, puis Moustache et Boucles d'oreilles) est à moitié cachée sous la barre d'action fixe « Demander : Lunettes ? ».
- La puce sélectionnée est illisible, et il faut défiler à l'intérieur d'un panneau étroit. Pendant ce temps, la carte « Questions de la manche », vide, occupe environ 100 px juste en dessous.
- Correction : replier « Questions de la manche » tant qu'elle est vide, ou donner la priorité de hauteur à « Ta question ». Ajouter une marge basse égale à la hauteur de la barre d'action. Resserrer les puces.

**B5. Accueil desktop : bouton son déformé (`1440x900-1-accueil`, `1920x1080-1-accueil`).**
- « Son coupé » s'étire sur toute la largeur de la barre (environ 1 200 px), avec une bordure. On dirait un champ de saisie cassé, dès le premier écran.
- Correction : largeur ajustée au contenu et alignement à droite, comme sur les écrans de jeu.

### Secondaires

1. **Bulles de Basile posées sur les cartes** (écrans 7 et 8, toutes tailles ; très gênant en mobile, où trois lignes cachent Agathe et Bérénice pendant la désignation). Les placer dans la barre d'état ou en bas du panneau, jamais sur le plateau. En écran 7, la question apparaît deux fois (bulle et panneau).
2. **Mobile, « Ta question » (`390x844-3`).** La feuille du bas couvre environ 55 % de l'écran, il ne reste que deux rangées visibles. La puce présélectionnée (Lunettes) est hors champ alors que le bouton dit « Demander : Lunettes ? ». Feuille repliable ou limitée à environ 40 %, et aucune présélection invisible.
3. **Mobile : « Ton suspect » relégué tout en bas de la page.** Le secret n'est jamais visible d'un coup d'œil. Ajouter une vignette du secret dans la barre du haut, à côté du score.
4. **Sélection corail sur un fond corail** (écran 8, Raphaël ; écran 2). Le cadre de sélection se confond avec le fond de la carte. Utiliser un anneau crème épais avec une légère surélévation, différent de toutes les couleurs de fond.
5. **Écran 5 « Réponse : non ».** Le plateau ne montre pas lesquels des 7 suspects « ne collent pas ». Les pré-marquer (bordure pointillée) avant « Écarter les 7 ».
6. **Écran 6.** La pastille d'état dit encore « Écarte les suspects » alors que le panneau dit « Tout est déjà écarté ». Passer à « Termine ton tour ».
7. **Le survol en 3D vivante (écran 4) est presque imperceptible** : une très légère mise à l'échelle, sans halo, sans surélévation ni bordure. Ajouter un état de survol visible.
8. **La légende du bas reste figée sur le dernier visage survolé** (écrans 5 à 8 : « Inès », pourtant écartée). La réinitialiser quand le survol se termine.
9. **Révélation (toutes tailles).**
   - Le score s'affiche « Toi 0  1 Basile » sans séparateur.
   - « Le Kamikaze » et sa description se suivent sans ponctuation : écrire « Le Kamikaze — perdre… ».
   - En grand format, le portrait d'Arthur est grotesque (sourire étiré, visage déformé). La révélation est le pire endroit pour un visage provisoire.
10. **Légendes tronquées** (« noir mi-lo… », « blond mi-l… » en 1440 ; presque toutes en mobile). Abréger (« mi-l. ») ou passer sur deux lignes.
11. **Faute** dans l'aide de l'écran 7 : « yeux bleu » doit devenir « yeux bleus ».
12. **1920×1080 : l'écran est sous-exploité.** Le plateau garde la même taille qu'en 1440, avec environ 250 px de marge vide de chaque côté. Agrandir les cartes.
13. **Une touche « SaaS » dans la colonne droite** : pile de cartes crème, titres en petites capitales (« TON SUSPECT ») et barre de progression bleue. C'est acceptable, mais à adoucir (moins de cartes séparées, pas de barre de progression).
14. **Fonds pastel attribués au hasard.** Ils ne codent rien, et le corail entre en conflit avec l'accent « à toi ». Les retirer de la palette d'état, ou rendre l'accent d'état distinct.

## 3. Ce qui est réussi

- Une identité cohérente : bleu encre, panneaux crème, titres à empattements avec du caractère et texte sans empattement lisible. Rien de manuscrit, plus de Polaroïd.
- Une barre du haut claire : pastille d'état colorée selon le joueur attendu, score Toi/Basile coloré, « Manche 1 », code de salon copiable. Pas de compteur redondant.
- Les 24 cartes tiennent sur un écran 1440×900 sans défilement, avec les noms toujours visibles.
- L'état « écarté » est excellent : désaturation, trait rouge, nom barré.
- Le compte « combien répondraient oui » sur chaque puce est une vraie aide au jeu.
- Oui/Non en vert/rouge, et l'aide « Ton suspect, Arthur : … » sous la question adverse.
- L'historique des questions est lisible.
- L'écran Révélation est sobre et met les deux portraits en face à face.

## 4. Le casting dans le plateau, franchement

C'est le défaut majeur, et l'interface ne le cache pas : elle le souligne. Les cartes colorées et la mise en scène soignée attirent l'œil sur 23 clones du même homme, distingués par une coupe de cheveux (toujours le même casque bouclé, teint autrement), une casquette ou une paire de lunettes. On ne repère au premier regard que Raphaël, Bastien, Cyril, Farid, Malik et, à la rigueur, Étienne.

Plusieurs paires sont indiscernables sans lire le nom : Agathe et Nadia, Diane et Louise, Élise et Mireille, Bérénice et Inès, Clémence, Jade et Hélène.

Le plus grave, c'est que les légendes affirment « ♀ », « long », « blond », « gris » ou « chauve » à côté d'images qui montrent autre chose. Le joueur apprend vite à ignorer les visages. C'est l'inverse de ce que demande un « Qui est-ce ? ».

La présentation n'est pas honnête : aucun écran n'indique que les visages sont provisoires. Le jeu reste jouable, mais uniquement comme un jeu de lecture d'étiquettes.

Tant qu'il n'y a pas au moins des femmes visibles, des longueurs de cheveux réelles et des chauves sans cheveux, le casting bloque la livraison.

## Résumé

- **Verdict : REFUSÉ en l'état.** L'interface et la direction artistique progressent nettement par rapport à l'ancienne version, et seraient « acceptées avec réserves » une fois B2 à B5 corrigés.
- **B1.** Les visages contredisent leurs attributs : 12 « femmes » au visage masculin, aucun cheveu long, des « blonds » bruns, des « chauves » avec des cheveux. Le jeu ne se joue que via les légendes, sans aucune mention « provisoire ».
- **B2.** Mobile : le fond s'arrête à la hauteur de l'écran, la page devient blanche, la dernière rangée et son aide sont illisibles.
- **B3.** Mobile, écran Réponse : tous les portraits grimacent (bouche ouverte, dents, regard fixe).
- **B4.** 1440×900 : les puces « Ce qu'il porte » sont cachées sous la barre « Demander », avec un défilement interne.
- **B5.** Accueil desktop : le bouton « Son coupé » s'étire sur toute la largeur, comme un champ cassé.
- **Secondaires principaux :** bulles de Basile posées sur les cartes, feuille mobile trop haute, secret absent du haut de l'écran en mobile, sélection corail sur fond corail, portrait d'Arthur grotesque à la révélation.
