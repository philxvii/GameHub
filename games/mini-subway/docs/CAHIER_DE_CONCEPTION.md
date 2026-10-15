# MINI SUBWAY — Cahier de conception exhaustif

> **Nom du projet : Mini Subway.** Ce document spécifie un jeu web de gestion et de construction d'un réseau de métro abstrait, avec des lignes colorées, des stations de formes, des passagers à acheminer, une ville qui grandit progressivement et des ressources d'infrastructure limitées. Il est destiné à servir de base d'implémentation pour GameHub.
>
> **Consigne de vocabulaire :** dans le code, les interfaces, les fichiers, les commits, les commentaires, les captures et les communications du projet, utiliser exclusivement le nom **Mini Subway**. Ne pas employer le nom de la référence commerciale étudiée. Le projet doit avoir son propre nom, son identité, ses cartes originales, ses ressources graphiques, ses sons et son code.
>
> **Portée du document :** les règles ci-dessous distinguent les mécaniques confirmées par les sources publiques, les variantes documentées selon la carte ou la plateforme, et les recommandations d'implémentation pour Mini Subway. Les chiffres signalés comme variables doivent être configurables ; ils ne doivent pas être codés en dur comme s'ils étaient universels.

---

## 0. Principes de lecture et niveaux de certitude

Chaque règle appartient à l'une des catégories suivantes :

- **Confirmé :** explicitement décrit dans les pages officielles ou corroboré par plusieurs guides de jeu.
- **Variable :** dépend d'une carte, d'une version, d'une plateforme ou d'un mode. Implémenter un paramètre.
- **Recommandation Mini Subway :** choix de conception proposé pour reproduire la logique de jeu dans une application web, sans prétendre qu'il s'agit d'un détail universel de la référence.
- **À mesurer :** valeur numérique difficile à établir avec certitude depuis les sources publiques. La mesurer en observant plusieurs parties plutôt que l'inventer.

Les mécaniques générales sont assez stables, mais les règles précises de croissance, les capacités, les récompenses et les caractéristiques des cartes varient. Les guides communautaires anciens peuvent également décrire une version précédente. Pour Mini Subway, la bonne méthode est donc d'exposer les paramètres dans des fichiers de données par carte, puis d'enregistrer les règles effectivement testées.

### Principes de conception à conserver

1. **Règle comprise au premier regard.** Les formes et les couleurs transmettent l'information sans longs tutoriels.
2. **Complexité émergente.** Peu de règles individuelles, mais des interactions de réseau de plus en plus difficiles à maîtriser.
3. **Croissance non entièrement prévisible.** Une stratégie optimale à un instant donné ne garantit pas la réussite plus tard.
4. **Choix sous contrainte.** Les nouvelles ressources sont utiles, mais le joueur ne peut pas tout obtenir.
5. **Carte = création du joueur.** Le réseau final doit être une composition lisible et partageable.
6. **Défaite compréhensible.** La surcharge d'une station est l'aboutissement visible d'un problème de réseau, pas un échec aléatoire sans explication.
7. **Minimalisme lisible.** Chaque couleur, symbole, son et animation doit communiquer quelque chose.

---

# 1. Concept, objectif et boucle principale

## 1.1 Fantaisie de jeu

Le joueur organise le réseau de transport d'une ville abstraite en expansion. Il relie des stations avec des lignes de métro de différentes couleurs, place des trains, augmente leur capacité et leur permet de traverser des cours d'eau. Des passagers apparaissent dans les stations et souhaitent rejoindre une station correspondant à une forme de destination.

La ville s'étend au fil du temps : de nouvelles stations apparaissent, les flux de voyageurs augmentent et des axes auparavant efficaces deviennent saturés. Le joueur doit surveiller le réseau, réorganiser ses lignes lorsque le mode le permet et choisir comment utiliser ses ressources limitées.

La tension essentielle se situe entre deux sensations :

- une construction calme, lisible et presque méditative d'un réseau élégant ;
- la pression croissante d'une ville qui génère plus de trafic que le réseau ne peut en absorber.

## 1.2 Objectif du mode standard

Acheminer autant de passagers que possible avant qu'une station ne reste en surcharge assez longtemps pour provoquer la fin de partie.

Le score principal est le nombre total de passagers livrés. Des métriques secondaires permettent de comprendre la performance : durée de fonctionnement, semaine atteinte, nombre de passagers restants, lignes utilisées, station la plus saturée et ressources finales.

Il n'existe pas de « fin de niveau » classique dans le mode standard : la partie continue jusqu'à ce que le réseau ne puisse plus absorber la demande.

## 1.3 Boucle principale

1. Observer la carte, les stations et les flux.
2. Relier les stations en dessinant une ligne.
3. Affecter un train à la ligne.
4. Laisser le temps avancer et observer la circulation.
5. Vérifier quels passagers sont livrés et quelles stations accumulent une file.
6. À chaque nouvelle période de budget, obtenir une locomotive et choisir une ressource supplémentaire.
7. Réorganiser le réseau ou affecter les ressources pour prévenir les saturations.
8. Débloquer de nouvelles stations, cartes, défis ou objectifs selon la progression.
9. Après l'échec, analyser le score et relancer une partie avec une autre stratégie.

## 1.4 Ce qui fait la profondeur stratégique

- Les stations d'une même forme partagent le même type de destination ; certaines formes spéciales sont rares.
- Une ligne courte est rapide à desservir, mais peut manquer de couverture.
- Une ligne longue peut transporter un grand nombre de passagers, mais les temps de trajet s'allongent.
- Un point d'intersection facilite les correspondances, mais peut concentrer dangereusement les voyageurs.
- Les trains, les voitures supplémentaires et les passages sur l'eau sont des ressources limitées.
- La géographie contraint les tracés et la distance entre stations.
- L'apparition aléatoire de nouvelles stations oblige à s'adapter.
- Les récompenses périodiques proposent un choix plutôt qu'un accès illimité à toutes les améliorations.

---

# 2. Carte et représentation du monde

## 2.1 Vue d'ensemble

La carte est une surface 2D vue du dessus, épurée, sans perspective 3D nécessaire. Elle contient :

- la zone terrestre ;
- des zones d'eau ou d'autres obstacles ;
- des stations de formes variées ;
- les lignes de métro ;
- les locomotives et leurs wagons ;
- les passagers en attente ;
- un compteur de temps et un score ;
- une zone de ressources et de récompenses ;
- des alertes de saturation.

La carte doit rester lisible même lorsque plusieurs lignes se superposent. Les lignes sont les éléments dominants ; le terrain sert de contexte visuel discret.

## 2.2 Géographie

Chaque carte définit une géométrie particulière :

- position initiale des stations ;
- zones de terre et d'eau ;
- obstacles et corridors ;
- espaces disponibles pour les futures stations ;
- palette de fond et de cours d'eau ;
- lignes disponibles au départ ;
- fréquence d'apparition des stations ;
- règles de capacité et de récompense éventuellement spécifiques.

**Recommandation Mini Subway :** créer d'abord un moteur de carte générique et au moins trois cartes originales, puis ajouter un catalogue plus vaste en utilisant des données séparées. Ne pas copier les compositions géographiques, graphismes ou cartes de la référence. Le gameplay doit fonctionner avec des géométries conçues pour Mini Subway.

## 2.3 Zoom et déplacement de la carte

Les écrans denses nécessitent une navigation confortable :

- zoom avec la molette de souris ou les contrôles tactiles habituels ;
- déplacement de la carte par glisser-déposer lorsqu'on commence sur une zone vide ;
- retour rapide à la vue d'ensemble ;
- cadrage automatique lorsque le réseau s'étend ;
- aucune perte de sélection d'une ligne pendant un zoom ;
- gestes distincts pour créer une ligne et déplacer la caméra.

Éviter que le glisser de carte et le dessin d'une ligne entrent en conflit. Sur écran tactile, les contrôles doivent être suffisamment grands et l'interaction doit rester possible sans précision extrême.

## 2.4 Croissance de la ville

La ville démarre avec un petit groupe de stations, puis s'étend. Les nouvelles stations apparaissent à des positions admissibles, souvent proches du bord ou dans une zone encore libre.

Chaque carte doit fournir des paramètres de croissance :

- délai avant la première station supplémentaire ;
- distribution du délai entre apparitions ;
- nombre maximal de stations actives, si applicable ;
- probabilité de chaque forme ;
- probabilité d'apparition d'une forme rare ;
- distances minimales entre stations ;
- contraintes géographiques ;
- plafonds ou accélérations spécifiques au mode.

La progression doit commencer doucement pour laisser au joueur le temps de comprendre. Le rythme augmente ensuite graduellement, sans que chaque apparition entraîne automatiquement une surcharge.

### Croissance procédurale recommandée

La génération doit être déterministe à partir d'une graine enregistrée pour permettre les replays et défis comparables. L'aléatoire peut déterminer les délais, la sélection de la zone admissible et le type de la nouvelle station, mais la graine doit permettre de reproduire exactement une partie.

Il faut éviter :

- les stations superposées à une station existante ;
- les apparitions en pleine eau si aucune règle de carte ne le permet ;
- les stations hors écran impossibles à atteindre ;
- une succession de stations spéciales rendant la carte immédiatement insoluble ;
- les placements qui créent un faux lien visuel avec une ligne existante.

---

# 3. Stations : formes, passagers et capacités

## 3.1 Formes ordinaires

Les formes ordinaires principales sont :

| Forme | Rôle | Fréquence de conception de départ |
|---|---|---|
| Cercle | Destination commune | Très fréquente |
| Triangle | Destination commune | Fréquente |
| Carré | Destination commune | Moins fréquente que le cercle, généralement moins fréquente que le triangle |

Les fréquences doivent être configurables par carte. Les probabilités exactes ne sont pas universelles et ne doivent pas être supposées identiques sur toutes les cartes.

## 3.2 Formes spéciales

Les formes rares documentées dans les ressources communautaires comprennent notamment :

- étoile ;
- losange ;
- pentagone ;
- croix ;
- ovale ou forme d'œuf ;
- gemme ;
- chevron ou coin.

Toutes les cartes ne doivent pas nécessairement employer toutes ces formes. Une forme spéciale doit avoir une silhouette visiblement différente des formes communes et être identifiable à petite taille.

La rareté crée une difficulté : un passager à destination d'une forme ordinaire peut être livré à une station quelconque de cette forme, tandis qu'une destination spéciale peut n'avoir qu'une seule station compatible. Cela rend les stations rares stratégiquement importantes.

## 3.3 Station qui change de forme

Des guides décrivent des cartes où une station de forme ordinaire peut évoluer vers une autre forme, y compris une forme spéciale. Cette évolution force le joueur à revoir son réseau.

**Recommandation Mini Subway :** supporter cette règle comme un modificateur de carte facultatif. L'événement doit être annoncé visuellement et sonorement, mais sans interrompre abusivement le jeu. La station ne doit pas changer de forme pendant une animation de sélection ou de déplacement de ligne.

## 3.4 Passagers

Un passager est un élément visuel simple portant le symbole de sa destination. Son origine est la station sur laquelle il apparaît. Sa destination est une classe de forme, pas nécessairement un arrêt unique pour les formes communes.

Exemples :

- un passager portant un cercle cherche une station de forme cercle ;
- un passager portant un triangle cherche une station triangle ;
- un passager portant une étoile cherche la station de forme étoile si cette forme est unique sur la carte.

La destination doit pouvoir être lue lorsque plusieurs passagers sont regroupés. Utiliser de petites icônes à fort contraste, avec une taille qui ne dépend pas uniquement de la couleur.

## 3.5 Apparition des passagers

Les passagers apparaissent au fil du temps dans les stations. La fréquence augmente avec la progression, avec des différences par carte et par mode.

Le moteur doit définir :

- un délai ou un taux d'apparition par station ;
- un poids de destination par forme ;
- une règle pour empêcher les files d'être entièrement uniformes ;
- un comportement déterministe via la graine de partie ;
- un mécanisme de pression globale qui augmente au fil du temps.

Les formes de destination doivent rester suffisamment variées pour encourager des réseaux connectés plutôt que des lignes qui desservent une seule forme.

## 3.6 Capacité des stations

Les sources communautaires indiquent que les stations ordinaires peuvent avoir des seuils de surcharge variables, généralement autour de six passagers, avec des cartes qui ont des capacités plus faibles. Certains guides observent une plage de 5 à 8 selon la carte. Des exemples documentés incluent une carte où les stations sont limitées à 4 passagers.

**Paramètres Mini Subway :**

- `stationCapacityDefault` : 6 passagers par défaut ;
- `stationCapacityByType` : surcharge possible par forme si nécessaire ;
- `stationCapacityOverrides` : surcharge d'une carte ;
- `interchangeCapacity` : 18 par défaut pour une station améliorée ;
- `overloadStartThreshold` : seuil effectif à partir duquel l'alerte commence ;
- `overloadGraceDuration` : durée avant la fermeture ;
- `overloadRecoveryRate` : vitesse de récupération lorsque la file diminue.

Ne pas considérer 6 comme une valeur universelle. Chaque carte doit pouvoir définir un autre seuil.

## 3.7 Alerte de surcharge

Quand une file atteint le seuil critique, un anneau de progression apparaît autour de la station. Il se remplit au fil du temps et sert de compte à rebours visible. Si la station est désengorgée avant la fin, le compte à rebours se réduit ou se réinitialise selon la règle de la carte.

La station peut suspendre l'avancée de l'alerte lorsqu'un train est en train de la desservir, selon la règle exacte choisie. Ce point doit être testé et implémenté comme une règle précise, pas laissé à des effets de bord.

### Recommandations de lisibilité

- État normal : icône sobre ;
- file croissante : passagers empilés de manière lisible ;
- proximité du seuil : anneau discret ;
- surcharge critique : anneau plus contrasté, animation pulsée courte ;
- seuil presque atteint : retour visuel et sonore léger, désactivable ;
- station désengorgée : retour à un état calme.

Le joueur doit savoir **où** se situe le problème et **combien de temps** il lui reste, sans devoir lire un long message.

## 3.8 Station d'échange / correspondance améliorée

Une amélioration peut transformer une station en grand nœud d'échange :

- capacité accrue, typiquement 18 passagers sans déclencher le seuil ordinaire ;
- transferts accélérés ;
- icône visuellement plus grande ;
- correspondances de plusieurs lignes plus faciles à utiliser ;
- effet stratégique permanent.

Les guides indiquent que l'amélioration n'est pas transférable et ne peut pas être retirée. Pour Mini Subway, cette permanence est recommandée dans les modes compétitifs et standards, tandis que le mode Créatif peut permettre de la retirer.

Cette amélioration est une ressource rare : elle résout un goulot d'étranglement mais ne remplace pas une bonne conception des lignes.

---

# 4. Lignes de métro

## 4.1 Notion de ligne

Une ligne est un itinéraire ordonné reliant plusieurs stations. Chaque ligne possède :

- un identifiant interne stable ;
- une couleur ;
- une séquence de stations ;
- une liste de tronçons ;
- un ou plusieurs trains ;
- des ressources de franchissement de l'eau éventuelles ;
- un sens ou des sens de circulation selon la topologie ;
- des statistiques de voyageurs et de temps de parcours.

Une ligne est normalement une séquence sans embranchement. Pour desservir deux branches différentes, il faut créer plusieurs lignes qui peuvent se rejoindre à une station de correspondance.

## 4.2 Création de ligne

Contrôle principal : sélectionner une ressource de ligne, puis glisser d'une station à une autre. Dans une interface à ressources disponibles, le dessin démarre depuis une station admissible et s'étend aux stations suivantes.

Règles :

1. une ligne doit relier au moins deux stations distinctes ;
2. les stations peuvent être ajoutées dans un ordre défini ;
3. une ligne peut être allongée depuis son extrémité si le mode le permet ;
4. les stations peuvent appartenir à plusieurs lignes ;
5. une nouvelle ligne ne doit pas créer une branche ambiguë au milieu d'une ligne existante ;
6. une liaison qui n'est pas attachée à une station ne doit pas fonctionner comme un arrêt ;
7. les croisements graphiques entre lignes ne créent pas une correspondance sauf si elles se rejoignent à une station.

## 4.3 Prolongement, modification et suppression

Dans les modes Classique, Infini et Créatif, le joueur doit pouvoir ajuster une ligne en réorganisant les stations, en déplaçant un segment ou en modifiant un point d'extrémité, selon les règles de l'interface choisie.

La modification doit permettre :

- ajouter une station en bout de ligne ;
- retirer un tronçon ou reconstruire le chemin ;
- déplacer une ligne vers une station plus pertinente ;
- réutiliser les ressources si une ligne est supprimée, selon le mode ;
- déplacer un train vers une autre ligne lorsque les règles l'autorisent.

Chaque action doit être prévisualisée avant confirmation si elle peut rendre une ligne invalide ou consommer une ressource rare.

Le mode Extrême verrouille les placements : les lignes, trains, wagons et autres ressources placés ne sont plus librement déplaçables. Le comportement exact de prolongement doit être explicite dans Mini Subway et couvert par des tests.

## 4.4 Boucles

Les réseaux peuvent comporter des boucles lorsque la carte et les règles le permettent. Une boucle permet au train de faire le tour du circuit sans demi-tour classique, mais elle augmente la longueur de l'itinéraire et peut réduire la fréquence de passage à certains arrêts.

La boucle doit être représentée clairement :

- le raccord final est explicite ;
- le train ne s'arrête pas sur un tronçon non connecté ;
- la distance et le sens de circulation sont correctement calculés ;
- l'éditeur de ligne ne confond pas une boucle avec une auto-intersection invalide.

## 4.5 Stations partagées et correspondances

Une station peut être connectée à plusieurs lignes. Elle devient alors un point où les voyageurs peuvent changer de train.

Les transferts doivent coûter du temps. Une correspondance n'est pas instantanée dans le modèle de simulation : elle consomme du temps et peut augmenter la file de la station.

L'interface doit rendre visible qu'une station est partagée, sans empiler des symboles illisibles. Utiliser une taille ou une composition spéciale plutôt qu'un texte explicatif.

## 4.6 Couleurs des lignes

Les couleurs de ligne varient selon les cartes, inspirées des réseaux de transport et des palettes propres à chaque carte. La couleur identifie rapidement un itinéraire, y compris quand plusieurs lignes passent à proximité.

Un guide de création de cartes documente une palette de référence en RVB, convertible en hexadécimal :

| Ordre suggéré | RVB | Hex | Nom de travail |
|---:|---|---|---|
| 1 | `221, 37, 21` | `#DD2515` | Rouge |
| 2 | `37, 129, 196` | `#2581C4` | Bleu |
| 3 | `53, 171, 82` | `#35AB52` | Vert |
| 4 | `240, 171, 0` | `#F0AB00` | Ambre |
| 5 | `0, 191, 255` | `#00BFFF` | Cyan |
| 6 | `255, 221, 85` | `#FFDD55` | Jaune clair |

**Important :** il s'agit d'une palette de référence pour les configurations de cartes, pas d'une palette universelle obligatoire. Les couleurs de Mini Subway doivent être suffisamment différentes entre elles, garder un contraste satisfaisant avec le terrain et fonctionner avec les modes Nuit et Daltonien.

Le nombre de couleurs doit couvrir le nombre maximal de lignes autorisées sur la carte. Chaque identifiant de ligne garde sa couleur de manière stable pendant une partie.

## 4.7 Ordre des stations et limites

Une ligne possède un ordre déterminé. Elle ne doit pas pouvoir se ramifier librement. Les trains parcourent les stations dans l'ordre puis reviennent dans l'autre sens lorsque la ligne est ouverte ; les boucles suivent le comportement de boucle défini.

Les guides communautaires indiquent généralement trois lignes disponibles au départ, deux sur certaines cartes particulières, avec des extensions de réseau pouvant atteindre sept lignes selon la carte. Une carte spéciale peut plafonner à six lignes. Le nombre maximal doit donc faire partie des paramètres de carte.

Une seule ligne peut desservir un grand nombre de stations, mais la distance et la charge doivent rendre les lignes excessivement longues moins efficaces.

## 4.8 Ressources de franchissement

Les segments qui traversent une rivière, un bras de mer ou une zone d'eau nécessitent une ressource de tunnel ou de pont. Cette ressource est limitée.

- La carte définit combien de franchissements sont disponibles au départ.
- Les récompenses peuvent en fournir de nouveaux.
- Un franchissement consommé par une ligne n'est plus disponible ailleurs tant que le tronçon reste en place, sauf règle spécifique du mode.
- La suppression d'un tronçon libère ou non la ressource selon le système de ressources choisi ; cette règle doit être stable et visible.
- Les cartes peuvent modifier les quantités de franchissements accordées.

Pour Mini Subway, appliquer une logique explicite et testable : chaque tronçon traversant l'eau référence un pont/tunnel consommé, et le compteur d'inventaire doit toujours correspondre aux ressources réellement utilisées.

---

# 5. Trains et capacité de transport

## 5.1 Locomotive de base

Chaque ligne active a besoin d'au moins une locomotive. La locomotive parcourt l'itinéraire, s'arrête aux stations, dépose les passagers arrivés à destination et embarque ceux pouvant poursuivre leur trajet.

Caractéristiques d'une locomotive :

- ligne affectée ;
- progression le long du tracé ;
- sens actuel ;
- nombre de passagers à bord ;
- wagons attachés ;
- vitesse ;
- position en cours de trajet ;
- statut : en route, arrêt en station, en transfert si simulé, attente ou immobilisation.

## 5.2 Capacité

La capacité standard d'une rame de base est généralement documentée autour de six passagers. Certaines cartes diminuent cette capacité, par exemple à quatre passagers. La capacité doit donc être un paramètre de carte ou de type de train.

Un wagon supplémentaire augmente la capacité d'un train ; les sources de référence indiquent une augmentation de six places par wagon dans les règles standard.

**Formule conseillée :**

`capacité_rame = capacité_locomotive_carte + somme(capacité_wagon_i)`

Cette formule reste paramétrable si une carte utilise une règle particulière.

## 5.3 Wagon

Un wagon est attaché à une locomotive pour augmenter le nombre de passagers transportés par trajet.

- Il augmente la capacité sans créer de nouvelle locomotive.
- Il suit la locomotive qui le tracte.
- Il ne constitue pas une ligne autonome.
- Dans le mode standard, il peut être transférable vers une autre locomotive si les règles de la carte et du mode le permettent.
- En Extrême, un wagon placé est immobilisé.

Le wagon est souvent un choix plus durable qu'un simple prolongement de ligne lorsqu'un axe très fréquenté est déjà bien connecté.

## 5.4 Nombre de locomotives par ligne

Plusieurs locomotives peuvent opérer sur une même ligne. Les guides de construction de cartes indiquent une limite généralement observée de quatre locomotives par ligne, même si ce nombre peut relever de contraintes du jeu ou de la carte.

Pour Mini Subway, définir `maxLocomotivesPerLine` comme paramètre, avec une valeur standard de quatre à valider par tests. Si plusieurs trains partagent une ligne, ils doivent être espacés de façon à éviter les collisions visuelles ou un regroupement durable qui réduit la fréquence réelle.

## 5.5 Trains plus rapides

Certaines cartes disposent de matériels particuliers plus rapides que la locomotive standard, notamment un train à grande vitesse sur des cartes japonaises. D'autres cartes ou matériels peuvent proposer un tram plus lent.

Ces matériels doivent modifier les paramètres de déplacement sans modifier les règles de destination :

- vitesse maximale ;
- accélération/décélération visuelles ;
- temps d'arrêt ;
- compatibilité avec les ressources de ligne ;
- capacité de base ;
- éventuellement le coût d'opportunité de la récompense.

Pour Mini Subway, définir des classes de matériel (`standard`, `tram`, `express`) au lieu de coder des exceptions par nom de ville dans le moteur.

## 5.6 Arrêts et embarquement

À chaque arrivée en station :

1. le train arrive à sa position d'arrêt ;
2. les voyageurs dont la destination correspond à la forme de la station descendent ;
3. les passagers admissibles embarquent, dans la limite de la capacité ;
4. le temps d'arrêt dépend de la quantité de voyageurs, de la station et du type de matériel ;
5. le train reprend son trajet.

Le temps d'arrêt et les transferts doivent contribuer à la dynamique du réseau. Une station très fréquentée peut ainsi ralentir une ligne même si ses trains possèdent assez de places.

## 5.7 Réaffectation

Dans les modes modifiables, le joueur peut déplacer une locomotive ou un wagon vers une autre ligne lorsque cela est autorisé.

Le déplacement doit se dérouler sans duplications : le même véhicule ne doit jamais apparaître sur deux lignes. Pendant la réaffectation, la rame quitte l'ancienne affectation et rejoint la nouvelle, ou est repositionnée selon la règle explicitement choisie.

Le mode Extrême empêche les déplacements après placement.

---

# 6. Logique de destination et routage des passagers

## 6.1 Destination par forme

La destination affichée par le passager est une forme. Pour les formes communes, toute station de cette forme peut satisfaire la destination ; pour une forme spéciale unique, il peut ne rester qu'une station admissible.

La forme ne représente donc pas toujours une adresse individuelle. C'est la classe de destination qui importe.

## 6.2 Réseau comme graphe

Pour une implémentation web robuste, représenter le réseau par un graphe :

- les stations sont des nœuds ;
- les tronçons de ligne sont des arêtes pondérées par le temps de trajet ;
- les transferts entre lignes sont des liens supplémentaires avec un coût de transfert ;
- les stations de forme cible sont les nœuds d'arrivée admissibles.

Le moteur peut alors trouver un parcours valable depuis la station d'origine vers une station compatible.

## 6.3 Calcul d'itinéraire recommandé

À l'apparition d'un passager :

1. enregistrer la station d'origine et la forme cible ;
2. calculer les stations de destination admissibles ;
3. chercher les itinéraires possibles à travers les lignes connectées ;
4. prendre en compte temps de trajet, attente, transferts et capacité disponible de façon simplifiée ;
5. conserver un chemin courant ;
6. recalculer si le réseau change, si la destination disparaît ou si le trajet devient impossible.

Éviter de lancer un calcul de chemin complet pour tous les passagers à chaque image. Recalculer lorsque le réseau ou la destination change, ou par lots à une fréquence contrôlée.

## 6.4 Choix d'une station de la bonne forme

Pour une destination commune, plusieurs stations peuvent satisfaire le besoin. La règle de la référence est décrite comme une livraison à la première station compatible rencontrée dans le parcours du passager. Cela signifie qu'un passager à destination « cercle » ne doit pas être lié de manière immuable à un cercle unique s'il peut en atteindre un autre plus efficacement.

Pour Mini Subway, définir le comportement exact dans le moteur et le tester. Une approche simple est de sélectionner l'arrêt compatible le plus rapide parmi les itinéraires utilisables, puis de réévaluer si le réseau change. Le choix doit rester cohérent et éviter les changements de destination injustifiés à chaque mise à jour.

## 6.5 Transferts

Un passager peut changer de ligne à une station desservie par plusieurs lignes. Le transfert a un coût en temps et les passagers en transfert peuvent contribuer à la file de la station.

Une station améliorée réduit ce délai. Il faut éviter qu'un passager change en boucle entre deux lignes, embarque puis débarque sans progression ou reste bloqué dans un état de transfert.

## 6.6 Itinéraires impossibles

Si aucune station compatible n'est accessible, le passager reste en attente à son origine, ou adopte la règle de blocage prévue par le moteur. L'interface peut signaler la destination non atteignable de façon indirecte, mais ne doit pas révéler toute la solution au joueur.

Quand une ligne est modifiée, les passagers doivent :

- conserver leur destination ;
- recalculer l'itinéraire ;
- rester dans le train si le modèle le permet, ou être déposés dans un état de transfert explicite ;
- ne jamais disparaître silencieusement.

---

# 7. Budget hebdomadaire, bonus et améliorations

## 7.1 Cycle de budget

En modes Classique et Extrême, un budget supplémentaire est accordé à la fin d'une semaine de jeu. Il fournit généralement une locomotive additionnelle puis une sélection limitée de ressources parmi lesquelles le joueur choisit.

Une semaine signifie une période du calendrier **dans le jeu**, pas sept jours réels.

Le choix d'amélioration est l'un des leviers centraux : le joueur doit arbitrer entre capacité, lignes nouvelles et accès géographique.

## 7.2 Choix standard d'améliorations

Les choix documentés dans les guides comprennent :

1. **Ligne supplémentaire** — permet d'ouvrir un nouvel itinéraire ; disponible seulement si la carte n'a pas atteint son maximum de lignes.
2. **Wagon** — augmente la capacité d'une rame existante.
3. **Deux ponts/tunnels** — augmente le stock de franchissements de l'eau.
4. **Station d'échange** — augmente la capacité et la vitesse de transfert d'une station.

La sélection proposée peut varier en fonction de la carte. Les récompenses ne donnent pas forcément tous les types de ressources à chaque semaine.

## 7.3 Locomotive supplémentaire

La locomotive est généralement accordée avec le budget hebdomadaire. Selon certaines cartes, le joueur peut recevoir deux locomotives ou choisir entre plusieurs locomotives classiques et un train express.

La règle exacte doit donc être paramétrée par carte :

- locomotive accordée automatiquement ;
- choix alternatif entre types de train ;
- nombre de véhicules remis ;
- exceptions propres à la carte.

## 7.4 Panneau de ressources

Le panneau présente les ressources non utilisées : lignes disponibles, locomotives, wagons, ponts/tunnels et stations d'échange.

Comportements à prévoir :

- afficher une quantité ou un nombre restant ;
- sélectionner une ressource avant de la placer ;
- indiquer les stations ou segments admissibles ;
- empêcher les actions impossibles ;
- afficher un retour clair après placement ;
- permettre de replier ou verrouiller le panneau pour garder le plateau visible ;
- conserver l'état d'ouverture si l'expérience l'exige.

## 7.5 Exceptions documentées de cartes

Les sources publiques donnent plusieurs exemples de différences de récompense ou de capacité. Ils montrent que les règles ne doivent pas être globales et rigides :

- une carte urbaine peut offrir moins souvent des tunnels ;
- une autre peut ne donner qu'un tunnel par récompense ;
- une carte peut recevoir deux locomotives au lieu d'une ;
- une carte peut proposer un choix entre deux locomotives normales et un véhicule express ;
- une autre peut donner deux wagons, mais un seul pont ;
- certaines cartes diminuent la capacité des stations ou des trains ;
- une carte peut démarrer avec davantage de stations ou des wagons pré-équipés.

Pour Mini Subway, placer ces différences dans les données de la carte. Ne pas multiplier les `if (cityName === ...)` dans le cœur du moteur.

---

# 8. Modes de jeu

Le jeu de référence documente quatre modes principaux, avec une nomenclature qui peut varier selon les versions et les plateformes. Pour Mini Subway, utiliser les noms français ci-dessous afin d'avoir une interface cohérente.

## 8.1 Classique

**But :** obtenir le score le plus élevé avant que la saturation d'une station ne provoque la fin de partie.

Règles :
- progression de la ville ;
- apparition de passagers ;
- capacité finie des trains et stations ;
- compte à rebours en cas de surcharge ;
- récompenses à la fin de chaque semaine de jeu ;
- possibilité de réorganiser lignes et ressources, selon les règles standard ;
- score final = nombre de passagers livrés.

C'est le mode d'apprentissage naturel et le mode principal du projet.

## 8.2 Infini

**But :** construire, observer et améliorer un réseau sans perdre à cause de la surcharge.

Règles :
- même logique générale de réseau et de passagers ;
- aucune fin de partie imposée par une station surchargée ;
- les files peuvent continuer d'augmenter ;
- un indicateur d'efficacité peut monter lorsque le transport fonctionne bien et baisser lorsque les files s'accumulent ;
- lorsque l'indicateur atteint un seuil, une récompense de ressources est donnée.

Le mode Infini doit servir à tester des architectures et à profiter d'une expérience plus calme. Ne pas le rendre totalement sans feedback : montrer quand le réseau devient inefficace reste utile.

## 8.3 Extrême

**But :** optimiser un réseau dont les placements deviennent irréversibles.

Règles :
- mêmes objectifs de livraison et de gestion de surcharge que le mode Classique ;
- une ligne ne peut plus être librement redessinée après sa validation ;
- les locomotives, wagons et autres ressources placés ne peuvent pas être librement déplacés ;
- la planification avant placement devient capitale ;
- une erreur de construction peut avoir des conséquences durables.

Le détail de ce qui reste modifiable doit être défini explicitement. Pour éviter toute ambiguïté dans Mini Subway, verrouiller après confirmation les tracés, véhicules, wagons et ressources d'infrastructure, sauf exception prévue par le design.

## 8.4 Créatif

**But :** créer librement le réseau souhaité.

Fonctions documentées dans le mode de référence :
- ajouter et modifier des stations ;
- disposer d'un inventaire illimité ou non contraint de locomotives, franchissements et stations d'échange ;
- modifier plus largement le réseau ;
- ne pas perdre à cause de la surcharge.

Pour Mini Subway, ajouter un éditeur simple de carte ou un mode de création libre : choix de forme, placement de station, déplacement, suppression, création de lignes et outils de nettoyage. L'éditeur doit protéger les erreurs de manipulation par annulation/rétablissement.

## 8.5 Défi quotidien

Le studio indique la présence de défis quotidiens. Pour Mini Subway :

- une carte ou graine unique commune à tous les joueurs durant une journée ;
- mêmes conditions de départ et mêmes paramètres ;
- règles et modificateurs clairement affichés avant le départ ;
- résultat enregistré sous la date du défi ;
- tableau de scores, si l'infrastructure de GameHub le permet ;
- une tentative officielle ou un nombre de tentatives défini et annoncé ;
- possibilité de rejouer en entraînement sans modifier le score officiel.

Ne pas prétendre qu'un classement est global s'il ne l'est pas. Pour comparer équitablement, vérifier la graine côté serveur ou utiliser une génération déterministe validée.

## 8.6 Défi hebdomadaire

Un défi hebdomadaire introduit un ensemble fixe de contraintes ou de conditions spéciales. Le même principe de comparabilité que le défi quotidien s'applique.

Exemples de modificateurs originaux pour Mini Subway :
- une ressource de tunnel limitée ;
- croissance de stations accélérée ;
- capacité de train réduite ;
- un nombre maximal de lignes ;
- un type de station plus fréquent ;
- objectif de livrer un nombre donné de voyageurs sans dépasser un seuil de lignes.

Ces exemples sont des propositions de conception, pas des règles confirmées du jeu étudié.

---

# 9. Progression, cartes et déblocages

## 9.1 Déverrouillage de cartes

La progression classique déverrouille de nouvelles villes lorsque le joueur atteint des objectifs sur des cartes déjà disponibles. Certains objectifs plus difficiles peuvent déverrouiller le mode Extrême d'une carte.

Pour Mini Subway, utiliser une progression avec :

- trois cartes d'initiation ;
- de nouveaux défis débloqués par score ou objectifs ;
- des objectifs simples au départ, plus spécifiques ensuite ;
- une indication visible des conditions de déblocage ;
- une sauvegarde locale du progrès ;
- des résultats et records par carte et mode.

Ne pas bloquer tout le catalogue derrière une longue progression si le public de GameHub veut accéder rapidement aux jeux. Les cartes de base doivent être immédiatement jouables.

## 9.2 Nombre et variété de cartes observés

Les ressources publiques consultées listent une collection d'environ 34 cartes urbaines standards, trois variantes historiques et une carte cachée dans une version du jeu. Ce nombre dépend de la version et des mises à jour ; Mini Subway peut s'en inspirer sans devoir reproduire ce catalogue exact.

La collection répertoriée dans ces ressources comprend les villes suivantes :

1. Londres
2. Paris
3. New York
4. Varsovie
5. Lisbonne
6. Tokyo
7. Chicago
8. Budapest
9. Berlin
10. Melbourne
11. Hong Kong
12. Barcelone
13. Osaka
14. Stockholm
15. Saint-Pétersbourg
16. Boston
17. Montréal
18. San Francisco
19. São Paulo
20. Séoul
21. Santiago
22. Washington, D.C.
23. Tachkent
24. Singapour
25. Le Caire
26. Istanbul
27. Shanghai
28. Guangzhou
29. Nankin
30. Chongqing
31. Mumbai
32. Addis-Abeba
33. Lagos
34. Auckland

Des variantes historiques sont notamment répertoriées pour Londres, Paris et New York, ainsi qu'une carte secrète. Ce catalogue sert à décrire l'étendue du système, pas à autoriser la copie des cartes exactes.

## 9.3 Paramètres qui donnent une personnalité à chaque carte

Chaque carte doit se différencier par plusieurs facteurs :

- géographie, eau et obstacles ;
- palette du terrain ;
- couleurs de lignes ;
- station initiale et distribution des formes ;
- nombre de lignes initiales et maximum ;
- stock initial de franchissements ;
- fréquence et distribution de la croissance ;
- capacité des stations et trains ;
- choix d'améliorations et particularités de récompense ;
- matériels de transport disponibles ;
- vitesse et difficulté générales.

Une carte ne doit pas être une simple recoloration. Les contraintes doivent générer des décisions différentes.

## 9.4 Exemples de modificateurs de carte documentés

Les sources communautaires signalent notamment les variantes suivantes. Elles sont à considérer comme exemples de paramètres confirmés pour des cartes particulières, et non comme un tableau exhaustif de toutes les cartes :

| Carte de référence (lieu) | Modificateur décrit |
|---|---|
| Paris | Capacité de station réduite, autour de 4 au lieu de 6 dans les règles standard |
| New York | Disponibilité plus faible de certaines récompenses de franchissement |
| Budapest | Récompense de tunnel réduite dans certaines conditions |
| Berlin | Attribution d'un tunnel à la fois |
| Hong Kong | Deux locomotives offertes lors de certaines récompenses |
| Osaka | Choix entre deux locomotives standard ou un train express |
| Le Caire | Capacité des trains réduite à 4 et maximum de lignes plus faible |
| Shanghai | Davantage de stations présentes au démarrage |
| Mumbai | Stations et trains à capacité réduite, wagons supplémentaires, ponts limités et récompenses d'échange spécifiques |
| Addis-Abeba | Un tunnel attribué par récompense plutôt que deux |

Pour Mini Subway, ne pas faire dépendre ces paramètres du nom d'une ville arbitraire dans le code. Les lire dans `maps/<mapId>.json` ou dans un schéma équivalent.

---

# 10. Score, records, fin de partie et statistiques

## 10.1 Score principal

Le score de base est le nombre total de passagers arrivés à destination. Un passager ne compte qu'une fois, au moment où il atteint une station admissible.

Ne pas compter comme livrés :
- les passagers montés mais pas encore arrivés ;
- les passagers ayant uniquement changé de ligne ;
- les passagers qui disparaissent lors d'un bug ;
- les passagers qui attendent encore lors de la fin de partie.

## 10.2 Statistiques secondaires recommandées

- passagers livrés ;
- jours/semaines de jeu écoulés ;
- meilleure performance personnelle ;
- nombre de stations présentes à la fin ;
- nombre de lignes et locomotives ;
- nombre de wagons ;
- nombre de correspondances ;
- quantité de passagers restants ;
- station ayant déclenché la fin de partie ;
- temps réel de session, si une mesure locale est souhaitée ;
- graine de la partie pour la reproduction des événements.

La fenêtre de fin de partie doit rester lisible. Le score et le bouton Rejouer ont priorité ; les statistiques détaillées peuvent se trouver dans un panneau secondaire.

## 10.3 Progression persistante

Sauvegarder localement :
- records par carte et mode ;
- cartes débloquées ;
- défis déjà réalisés ;
- préférences de son, vitesse et apparence ;
- succès et objectifs ;
- dernière version de données utilisée.

Si un compte GameHub est disponible, une synchronisation peut être ajoutée par la suite. Le mode solo doit néanmoins fonctionner sans compte et sans réseau.

## 10.4 Succès et objectifs

Les versions publiques possèdent un catalogue important de succès et de défis, comprenant des seuils de passagers et des conditions de construction particulières.

Pour Mini Subway, prévoir un moteur d'objectifs basé sur des conditions :

- livrer X passagers sur une carte ;
- atteindre une semaine donnée ;
- utiliser au plus N lignes ;
- utiliser peu de franchissements ;
- réaliser un score minimal sans dépasser une contrainte ;
- réussir un défi journalier/hebdomadaire.

Chaque succès doit avoir une condition mesurable, un nom original, une icône originale et une rétroaction discrète. Les succès ne doivent pas modifier les règles de base à moins qu'ils déverrouillent un élément explicitement annoncé.

---

# 11. Temps, vitesse et pause

## 11.1 Temps du jeu

L'interface comporte une horloge de jeu qui avance pendant la simulation. La progression des stations, les apparitions de passagers, les trains et les budgets hebdomadaires sont calculés à partir de cette horloge, et non de l'heure réelle du système.

Le moteur doit séparer :
- `realDelta` : temps réel entre deux images ;
- `gameDelta` : temps simulé, multiplié par le facteur de vitesse ;
- `gameTime` : horloge cumulée de partie ;
- `inGameDay` et `inGameWeek` : unités dérivées de l'horloge du jeu.

Les règles doivent rester stables si l'onglet perd le focus ou si la fréquence d'images varie. Pour des raisons de stabilité, privilégier une simulation à pas fixe ou semi-fixe et rendre l'affichage interpolé.

## 11.2 Vitesses

Les contrôles publics observés comportent une pause et une option d'avance rapide. Une discussion de développement ancienne indique également des contrôles clavier de vitesse. Pour Mini Subway, le comportement recommandé est explicite :

- **Pause** : `0×`, la simulation et l'horloge cessent d'avancer, mais le joueur peut continuer à modifier le réseau dans les modes autorisés.
- **Normal** : `1×`, vitesse de référence.
- **Rapide** : `2×`, vitesse de simulation doublée.

Les facteurs `1×` et `2×` sont une cible d'implémentation claire pour Mini Subway. Ne pas extrapoler d'autres facteurs à partir de détails internes ou d'anciennes versions sans observation directe.

Contrôles recommandés pour le navigateur :

- bouton Pause/Reprendre ;
- bouton Normal/Rapide ;
- `Espace` : pause/reprise ;
- `1` : vitesse normale ;
- `2` : vitesse rapide ;
- boutons tactiles équivalents sur mobile.

Les raccourcis doivent être affichés dans l'aide et ne pas entrer en conflit avec les champs texte. Le mode de vitesse actif doit toujours être clairement visible.

## 11.3 Pourquoi la pause compte

La pause est une mécanique stratégique : elle permet au joueur d'analyser le réseau et de planifier des changements quand la pression augmente. La pause ne doit pas ouvrir un menu qui empêche l'édition ; elle suspend la simulation, pas l'interface.

En mode Extrême, la pause n'autorise pas à déplacer les ressources verrouillées. En Créatif, le temps peut être désactivé ou remplacé par des commandes d'édition.

## 11.4 Équilibrage du rythme

L'objectif n'est pas de faire simplement apparaître plus de stations à chaque minute réelle. Le rythme doit s'exprimer par une courbe de difficulté :

- introduction : peu de stations et de passagers ;
- apprentissage : premières correspondances et premiers choix de ressources ;
- montée : plusieurs formes de destinations et stations rares ;
- pression : distances plus longues, files plus importantes et ressources insuffisantes ;
- endgame : plusieurs points du réseau deviennent critiques en même temps.

Les taux de croissance doivent être paramétrés et testés. Les pics doivent être difficiles mais compréhensibles.

---

# 12. Commandes et interaction

## 12.1 Souris / ordinateur

- Cliquer une ressource puis tracer une ligne d'une station à une autre.
- Cliquer/glisser sur un point de ligne admissible pour modifier l'itinéraire dans les modes où cela est permis.
- Sélectionner une locomotive ou un wagon puis le déposer sur une ligne.
- Sélectionner une station pour consulter sa file si cette action ne gêne pas le dessin.
- Molette pour zoomer ; glisser sur un espace vide pour déplacer la carte.
- `Espace` pour pause/reprise ; `1` et `2` pour les vitesses prévues par Mini Subway ; `Échap` pour fermer un dialogue ou ouvrir le menu selon le contexte.
- Bouton Annuler/Rétablir dans les modes modifiables, si la complexité de l'éditeur le justifie.

## 12.2 Tactile

- appui et glisser pour relier les stations ;
- tap sur les ressources pour sélectionner ;
- commandes visibles pour pause et vitesse ;
- gestes de zoom/pan standards ;
- zone tactile suffisante autour des stations ;
- aucune action stratégique essentielle qui nécessite un survol ;
- retour haptique facultatif, désactivable.

## 12.3 Menu de pause

Éléments recommandés :
- reprendre ;
- vitesse ;
- redémarrer la partie (avec confirmation) ;
- quitter la partie ;
- paramètres visuels ;
- son ;
- aide/contrôles.

Les actions destructives doivent avoir une confirmation claire. La pause ne doit pas redémarrer le réseau ni supprimer le score.

## 12.4 Affordances de construction

Pendant le dessin d'une ligne :
- afficher un aperçu du chemin ;
- marquer les stations admissibles ;
- montrer un retour de couleur indiquant quelle ligne est placée ;
- indiquer un obstacle ou une ressource manquante avant la confirmation ;
- éviter de créer une connexion par simple proximité visuelle ;
- permettre d'annuler un tracé commencé sans perdre la ressource.

---

# 13. Interface et hiérarchie visuelle

## 13.1 Philosophie visuelle

Mini Subway doit se lire comme une carte de transport claire et élégante. Les couleurs servent à identifier les lignes ; les formes identifient les stations et les destinations ; l'animation explique les mouvements ; le son renforce le rythme.

L'interface ne doit pas recouvrir la carte avec des panneaux de contrôle lourds. Les informations principales doivent être visibles, et les données secondaires disponibles sur demande.

## 13.2 HUD principal

Éléments principaux :

- temps de la partie ;
- pause et vitesse ;
- score des passagers livrés ;
- inventaire et récompenses ;
- indicateurs de surcharge ;
- bouton menu ;
- nom de la carte et mode, éventuellement dans une zone discrète.

Le HUD doit s'adapter aux dimensions de l'écran. Sur mobile, organiser les commandes en zones accessibles sans masquer les stations importantes.

## 13.3 Panneau de ressources

Le panneau doit montrer l'inventaire de façon compacte, avec une icône distincte et une quantité. La ressource sélectionnée doit être immédiatement identifiable.

Exemples d'icônes sémantiques :
- couleur/disque pour une ligne ;
- locomotive pour un train ;
- petit wagon pour une capacité supplémentaire ;
- pont/tunnel pour les franchissements ;
- station agrandie pour le nœud de correspondance.

Les icônes de Mini Subway doivent être originales. Ne pas copier directement les pictogrammes exacts de la référence.

## 13.4 États d'une station

Chaque station doit pouvoir exprimer :
- état normal ;
- sélectionnée ;
- desservie par plusieurs lignes ;
- station d'échange améliorée ;
- file élevée ;
- surcharge imminente ;
- inaccessible temporairement ou non reliée, si ce concept existe dans Mini Subway.

L'état doit être transmis au moins par la forme ou le contour et pas uniquement par la couleur.

## 13.5 Accessibilité

- mode daltonien avec palette distincte et suffisamment contrastée ;
- mode Nuit avec couleurs de terrain, stations et lignes adaptées ;
- réglage du volume et coupure sonore ;
- `prefers-reduced-motion` ;
- taille minimum des contrôles tactiles ;
- focus clavier visible ;
- alternatives textuelles aux pictogrammes dans les menus ;
- contraste suffisant du texte et des icônes ;
- ne pas communiquer l'alerte de surcharge uniquement par le son.

---

# 14. Options et paramètres

Les options réellement présentes dans les sources publiques comprennent des modes de couleur Nuit et Daltonien, des modes de jeu et des défis. Le jeu propose aussi une bande sonore qui s'adapte à l'état du réseau, ainsi que des outils de capture dans certaines versions.

## 14.1 Paramètres à prévoir pour Mini Subway

### Affichage
- palette Jour / Nuit / Daltonien ;
- contraste supplémentaire ;
- taille des labels passagers, si nécessaire ;
- intensité des animations ;
- réduction des mouvements ;
- niveau de détail du terrain, si les performances l'exigent.

### Son
- volume global ;
- musique ;
- effets ;
- mute immédiat ;
- mémorisation du réglage.

### Jeu
- commandes clavier affichées ;
- pause au changement d'onglet (option recommandée) ;
- confirmation au redémarrage ;
- vitesse par défaut ;
- explications de départ activables/désactivables.

### Données
- records locaux ;
- réinitialiser les données avec confirmation ;
- exporter une capture ou un résumé de partie ;
- identifiant/graine de défi si les replays sont supportés.

Ne pas collecter de données personnelles pour sauvegarder les scores locaux. Le mode solo doit pouvoir fonctionner entièrement hors ligne après chargement des ressources nécessaires.

## 14.2 Mode Nuit

Le mode Nuit change la palette de la carte pour une lecture plus sombre et confortable. Il doit préserver :
- la différenciation des lignes ;
- la visibilité des passagers ;
- les contours des stations ;
- l'alerte de surcharge.

Ne pas appliquer simplement un filtre CSS sur toute la page. Définir une palette dédiée.

## 14.3 Mode Daltonien

Le mode Daltonien doit modifier la palette et renforcer les différenciations visuelles. L'identification ne doit pas dépendre uniquement de couleurs parfois confondues.

Tester la palette avec des simulations de déficiences de perception des couleurs et garder les formes de station visibles.

## 14.4 Photo mode et captures

Des versions du jeu proposent des fonctions de capture et d'export de cartes ou d'animations. Pour Mini Subway, cela peut devenir une fonction secondaire intéressante :
- masquer temporairement le HUD ;
- choisir un cadre discret original ;
- exporter une capture de la carte ;
- option d'export d'une animation courte si cela reste léger.

Cette fonction n'est pas nécessaire au premier prototype jouable, mais doit être envisagée dans l'architecture de rendu pour éviter une refonte ultérieure.

---

# 15. Audio et musique adaptative

## 15.1 Principe

La musique officielle est décrite comme adaptative et liée au réseau de transport. Pour Mini Subway, reproduire le principe fonctionnel avec une bande sonore originale : le réseau produit progressivement une composition qui évolue avec l'activité, la densité et le rythme des trains.

Ne pas utiliser de musique ou d'effets audio sous licence de la référence. Créer une bande sonore originale ou des sons synthétisés pour Mini Subway.

## 15.2 Couche musicale recommandée

Le système audio peut combiner :

- une base musicale calme au début ;
- des motifs discrets associés à l'activité des lignes ;
- des couches supplémentaires quand le réseau s'élargit ;
- une densité rythmique plus riche avec l'augmentation du trafic ;
- une tension sonore subtile lorsque des stations deviennent critiques ;
- un relâchement lorsque le réseau désengorge la station.

La musique ne doit pas devenir agressive quand la partie dure longtemps. Le joueur doit pouvoir l'écouter durant une session prolongée.

## 15.3 Effets sonores

- création/validation d'une ligne ;
- train entrant dans une station ;
- embarquement/débarquement discret ;
- nouvelle station ;
- récompense hebdomadaire ;
- station approchant de la saturation ;
- partie terminée ;
- objectif ou succès atteint.

Les effets doivent se distinguer sans envahir le mix. Prévoir une limitation de fréquence pour les sons répétitifs lorsque plusieurs trains arrivent en même temps.

## 15.4 Accessibilité audio

- volume indépendant pour musique et effets ;
- mode silencieux ;
- aucun message essentiel uniquement sonore ;
- reprendre l'audio avec une politique navigateur compatible avec l'interaction utilisateur initiale ;
- ne pas lancer de musique avant que les règles de lecture audio du navigateur l'autorisent.

---

# 16. Défis, records et partage

## 16.1 Défis déterministes

Pour les défis communs, la même graine doit produire la même géographie, la même configuration initiale et la même séquence d'événements.

Paramètres d'un défi :
- identifiant ;
- date ou semaine ;
- graine ;
- carte ;
- mode ;
- paramètres de difficulté ;
- liste des modificateurs ;
- fenêtre de validité ;
- règles de score ;
- nombre de tentatives autorisées ;
- données de classement éventuelles.

Ne pas utiliser l'heure locale du navigateur comme seule source d'un défi compétitif. Les règles de date et de seed doivent être explicites.

## 16.2 Classements

Un classement doit indiquer :
- carte et mode ;
- score ;
- date ;
- durée/temps de jeu selon la métrique retenue ;
- graine du défi ;
- éventuelles contraintes du challenge.

Pour les records locaux, conserver les scores dans le navigateur. Pour un classement partagé sur GameHub, définir les règles de validation et d'anti-triche côté serveur avant d'afficher une promesse de classement global.

## 16.3 Partage de carte

Une carte finale peut être exportée en image. Le partage doit afficher un rendu propre sans éléments de contrôle. L'image ne doit pas inclure d'informations privées ni des éléments temporaires de débogage.

Un système de replay peut être ajouté ultérieurement en stockant la graine et les actions du joueur plutôt qu'une vidéo complète, si le moteur est déterministe.

---

# 17. Architecture technique recommandée

## 17.1 Modules logiques

Séparer au minimum :

1. **Game state** : état actuel de la partie et de son mode ;
2. **Map data** : géométrie, palette, stations initiales, paramètres par carte ;
3. **Station system** : formes, files, seuils, changements et surcharge ;
4. **Passenger system** : apparition, destinations, état à bord/en attente/livré ;
5. **Route graph** : lignes, tronçons, connexions, transferts ;
6. **Train system** : déplacement, arrêt, capacité et affectation ;
7. **Upgrade system** : inventaire et récompenses ;
8. **Difficulty director** : croissance, fréquence et courbe de difficulté ;
9. **Game modes** : règles Classique, Infini, Extrême et Créatif ;
10. **Clock** : pause, vitesse, semaines ;
11. **Audio system** : musique et effets adaptatifs ;
12. **Renderer** : terrain, lignes, stations, trains, passagers ;
13. **UI/HUD** : informations, inventaire, alertes et menus ;
14. **Progression** : records, déblocages, défis et succès ;
15. **Persistence** : sauvegarde locale, migrations de format ;
16. **Test hooks** : graine déterministe, horloge contrôlable et diagnostics de réseau.

## 17.2 Données d'une carte

Chaque carte doit décrire les paramètres plutôt que contenir des branches logiques spécifiques dans les composants d'interface.

Exemple de schéma indicatif :

```json
{
  "id": "harbor-city",
  "name": "Harbor City",
  "theme": "coastal",
  "palette": {
    "backgroundDay": "#F1EDE2",
    "backgroundNight": "#171D27",
    "waterDay": "#C8DFE6",
    "waterNight": "#263E53",
    "stationFillDay": "#FFFFFF",
    "stationOutlineDay": "#1F252B",
    "lineColors": ["#DD2515", "#2581C4", "#35AB52", "#F0AB00", "#00BFFF", "#FFDD55"]
  },
  "limits": {
    "startingLines": 3,
    "maxLines": 7,
    "startingLocomotives": 3,
    "startingCrossings": 3,
    "maxLocomotivesPerLine": 4
  },
  "capacity": {
    "station": 6,
    "train": 6,
    "carriageBonus": 6,
    "interchange": 18
  },
  "difficulty": {
    "firstAdditionalStationSeconds": 40,
    "stationSpawnCurve": "harbor-standard",
    "passengerSpawnCurve": "standard"
  },
  "upgrades": {
    "grantLocomotiveEachWeek": true,
    "availableChoices": ["line", "carriage", "crossings", "interchange"]
  },
  "modifiers": []
}
```

Ces valeurs sont un exemple de structure, pas une copie exacte d'une carte commerciale. Ajuster les noms, la géographie et les courbes à la conception de Mini Subway.

## 17.3 Pas de simulation uniquement dans le rendu

Ne pas mélanger les changements d'état du jeu et le dessin à l'écran. Le moteur doit avancer même si la fréquence d'images varie, et le rendu ne doit pas modifier les règles.

Utiliser une simulation déterministe à pas fixe ou semi-fixe. Le rendu interpole les positions des trains et animations entre les états logiques.

## 17.4 Graine et relecture

Chaque partie reçoit une graine. Les apparitions de stations et passagers doivent être reproduisibles depuis cette graine et les actions du joueur.

Conserver éventuellement un journal des actions :
- démarrage ;
- création/extension/suppression de ligne ;
- affectation de train ;
- choix d'amélioration ;
- modification d'un paramètre ;
- pause/vitesse ;
- fin de partie.

Cette approche facilite le débogage et les défis. Elle évite d'enregistrer une vidéo brute de chaque partie.

## 17.5 Performance

- dessiner plusieurs passagers dans un même lot lorsque possible ;
- éviter les recalculs globaux à chaque image ;
- recalculer les chemins seulement si le graphe change ou à intervalle contrôlé ;
- limiter les effets de halo à des éléments qui en ont besoin ;
- prévoir un niveau de détail adapté au mobile ;
- ne pas déclencher un calcul de layout DOM pour chaque passager à chaque frame ;
- garder un mode de rendu efficace sur les navigateurs desktop courants.

---

# 18. Équilibrage et difficulté

## 18.1 Courbe de difficulté

L'équilibrage repose sur la progression de quatre variables :

- quantité de stations ;
- nombre de passagers par station et fréquence d'apparition ;
- diversité et rareté des destinations ;
- distances/temps de trajet et contraintes de géographie.

La pression doit augmenter de façon cumulative. Il faut néanmoins laisser assez de temps pour que les améliorations puissent influencer réellement le résultat.

## 18.2 Principes d'équilibrage

- Une nouvelle station ne doit pas toujours provoquer une urgence.
- Une station de forme rare peut créer un problème de réseau, mais le problème doit pouvoir être résolu par une bonne construction.
- Les choix de ressources doivent présenter de vrais compromis : deux options ne doivent pas être évidentes à chaque fois.
- Le joueur doit comprendre la relation entre ses décisions et l'échec.
- Une partie très avancée doit être difficile, mais pas uniquement en raison d'apparitions incontrôlables.
- Les paramètres peuvent être différents par carte, mais les modes doivent rester cohérents.

## 18.3 Mesures à collecter pendant le playtest

- durée moyenne de partie ;
- score moyen et médian ;
- semaine moyenne de fin ;
- taux de surcharge par forme de station ;
- longueur moyenne des lignes ;
- proportion de passagers livrés sans transfert et avec transfert ;
- amélioration la plus choisie ;
- nombre moyen de stations ;
- moments où le joueur ne sait plus quoi faire.

Utiliser ces mesures pour équilibrer les courbes. Ne pas réduire la difficulté uniquement parce qu'un test isolé se termine vite.

---

# 19. Plan de tests exhaustif

## 19.1 Tests unitaires des stations

- création des formes ordinaires ;
- création des formes spéciales ;
- apparition et disparition contrôlées ;
- station qui évolue de forme ;
- respect des limites de capacité ;
- déclenchement de l'alerte ;
- interruption ou récupération du compte à rebours ;
- station améliorée ;
- capacité propre à une carte ;
- comportement lors de la suppression d'une ligne.

## 19.2 Tests des lignes

- création entre deux stations ;
- prolongement d'une extrémité ;
- ligne avec plusieurs stations ;
- croisement visuel sans correspondance ;
- station partagée par deux lignes ;
- boucle valide ;
- boucle invalide ;
- tracé interrompu ;
- franchissement d'eau sans ressource ;
- franchissement d'eau avec ressource ;
- suppression et restitution de ressources ;
- limites de lignes par carte ;
- limites de véhicules par ligne.

## 19.3 Tests des passagers

- destination cercle/triangle/carré ;
- destination spéciale ;
- choix parmi plusieurs stations de la bonne forme ;
- embarquement à capacité pleine ;
- débarquement à la destination ;
- transfert entre deux lignes ;
- itinéraire qui devient impossible ;
- recalcul après changement du réseau ;
- conservation du passager pendant une modification ;
- aucun doublon de passager ;
- aucun passager livré deux fois ;
- aucune disparition silencieuse.

## 19.4 Tests des véhicules

- déplacement entre stations ;
- demi-tour sur une ligne ouverte ;
- comportement sur une boucle ;
- arrivée en station et temps d'arrêt ;
- embarquement/débarquement en un arrêt ;
- capacité standard ;
- wagon additionnel ;
- véhicule rapide/lent ;
- plusieurs trains sur une ligne ;
- réaffectation en mode modifiable ;
- verrouillage en Extrême ;
- aucune duplication de train ou de wagon.

## 19.5 Tests des ressources et récompenses

- semaine terminée ;
- locomotive attribuée ;
- choix parmi deux récompenses ;
- inventaire correctement décrémenté ;
- ressource impossible refusée ;
- ligne ajoutée seulement sous le maximum ;
- exception propre à une carte ;
- récompense de mode Infini liée au seuil d'efficacité ;
- ressources illimitées en Créatif ;
- inventaire cohérent après modification de ligne.

## 19.6 Tests des modes

- Classique : surcharge conduit à la fin de partie ;
- Infini : surcharge n'interrompt pas la session ;
- Extrême : placements verrouillés ;
- Créatif : ajout, modification et suppression de stations ;
- défi journalier : graine identique pour tous ;
- défi hebdomadaire : paramètres reproductibles ;
- mode Nuit ;
- mode Daltonien ;
- pause et vitesses 1×/2× ;
- préférence de réduction du mouvement.

## 19.7 Tests d'interface

- souris ;
- clavier ;
- tactile ;
- zoom et déplacement de carte ;
- panneau de ressources ouvert/fermé/verrouillé ;
- messages de station critique ;
- menu pause ;
- redémarrage avec confirmation ;
- fin de partie ;
- enregistrement du score local ;
- reprise/rejouer ;
- aucun débordement horizontal ;
- tailles de texte adaptatives.

## 19.8 Tests de performance et de déterminisme

- partie courte de référence ;
- partie avec de nombreuses stations ;
- partie avec beaucoup de passagers ;
- plusieurs lignes qui se croisent ;
- plusieurs trains sur le même itinéraire ;
- changement rapide de vitesse ;
- pause/reprise répétée ;
- onglet masqué/réactivé ;
- graine identique = même séquence d'apparition ;
- jeu sans audio ;
- machine mobile à ressources modestes.

---

# 20. Feuille de route de réalisation

## Phase 1 — Boucle jouable minimale

- une carte originale ;
- trois formes ordinaires ;
- génération procédurale simple de stations ;
- dessin de lignes ;
- une locomotive par ligne ;
- circulation bidirectionnelle ;
- passagers par forme de destination ;
- embarquement/débarquement ;
- score ;
- surcharge et fin de partie ;
- pause et vitesse normale/rapide.

## Phase 2 — Profondeur stratégique

- wagons ;
- lignes supplémentaires ;
- ponts/tunnels ;
- stations d'échange ;
- récompenses hebdomadaires ;
- correspondances et recherche d'itinéraires ;
- meilleure courbe de difficulté ;
- écran de fin de partie et records.

## Phase 3 — Modes et progression

- Infini ;
- Extrême ;
- Créatif ;
- plusieurs cartes originales ;
- particularités de cartes ;
- objectifs/succès ;
- déblocages ;
- sauvegarde locale.

## Phase 4 — Qualité produit

- direction artistique dédiée ;
- palette Jour/Nuit/Daltonien ;
- son original adaptatif ;
- animations de trains et stations ;
- photo mode/export ;
- défis déterministes ;
- optimisation mobile ;
- revue visuelle indépendante ;
- audit de robustesse et tests de longue durée.

Ne pas chercher à livrer toutes les fonctions avancées avant que la simulation de base soit exacte, stable et agréable. Les erreurs de routage des passagers se propagent à tout le gameplay et doivent être réglées avant les effets visuels avancés.

---

# 21. Décisions spécifiques pour Mini Subway

Cette section traduit le fonctionnement général en règles implémentables pour GameHub.

1. **Nom unique :** tous les labels et documents internes utilisent `Mini Subway`.
2. **Identité propre :** nouvelles palettes par carte, nouveau logotype, nouvelles icônes et nouvelles illustrations. Ne pas réutiliser les assets graphiques, sons ou code privés d'un autre jeu.
3. **Mode par défaut :** Classique.
4. **Vitesses :** Pause, 1× et 2×. Tous ces états sont contrôlés par l'horloge de simulation.
5. **Démarrage standard :** trois stations de formes ordinaires, trois lignes disponibles, trois locomotives et un stock limité de ponts/tunnels. Les paramètres peuvent varier par carte.
6. **Capacité par défaut :** six passagers par train et six par station ordinaire, avec variantes déclarées dans les données de carte.
7. **Wagon :** ajoute six places dans la configuration standard ; valeur configurable par carte.
8. **Station d'échange :** capacité cible de dix-huit et transferts accélérés ; valeur configurable.
9. **Ressources de semaine :** une locomotive et un choix d'amélioration ; règles différentes en Infini et exceptions par carte.
10. **Formes de passagers :** la forme désigne une classe de destination, pas un identifiant de station.
11. **Boucles et correspondances :** prises en charge par un graphe et une définition explicite de la topologie.
12. **Progression :** records locaux d'abord ; défis communs et classements uniquement si une source serveur fiable est mise en place.
13. **Accessibilité :** palette daltonienne, mode Nuit, navigation clavier, commandes tactiles et réduction des mouvements.
14. **Rejouabilité :** seed de partie enregistrée pour tester, rejouer et proposer des défis comparables.
15. **Fin de partie :** le joueur doit savoir quelle station a causé l'échec, quel était son score et comment relancer rapidement.

---

# 22. Paramètres de départ recommandés

Les chiffres ci-dessous sont une base de prototypage, à ajuster avec des tests. Ils ne prétendent pas être des valeurs exactes et universelles de toutes les cartes observées.

| Paramètre | Valeur initiale Mini Subway | Notes |
|---|---:|---|
| Stations de départ | 3 | Cercle, triangle, carré |
| Lignes disponibles au départ | 3 | Variable par carte |
| Locomotives initiales | 3 | Une par ligne disponible, affectation à construire |
| Capacité standard d'une rame | 6 passagers | Override par carte |
| Capacité additionnelle d'un wagon | +6 | Override par carte |
| Capacité standard d'une station | 6 passagers | Le seuil de surcharge peut varier |
| Capacité d'une station d'échange | 18 passagers | Paramétrable |
| Lignes maximales | 7 | Variable par carte |
| Locomotives maximales par ligne | 4 | Paramètre à confirmer pendant les tests |
| Vitesses de simulation | pause, 1×, 2× | Valeurs explicites |
| Cycle de récompense Classique/Extrême | 7 jours de jeu | Un jour de jeu n'est pas une journée réelle |
| Options par récompense | 2 choix | Les ressources disponibles varient par carte |
| Couleurs de référence de ligne | 6 | Chaque carte doit fournir assez de couleurs |
| Mode de départ | Classique | Infini, Extrême et Créatif accessibles selon progression/design |

## 22.1 Ce qui doit être calibré avant la publication

- fréquence d'apparition des stations ;
- distribution des destinations de passagers ;
- évolution du trafic ;
- durée du compte à rebours de surcharge ;
- temps d'arrêt d'un train ;
- vitesse de déplacement en temps de jeu ;
- temps de transfert ;
- fréquences et choix des récompenses ;
- différences entre cartes ;
- durée moyenne de partie et scores cibles.

Ces valeurs doivent être adaptées en jouant et en analysant les métriques. Elles ne doivent pas être choisies seulement parce qu'elles semblent plausibles sur le papier.

---

# 23. Sources de recherche

Les liens suivants ont été consultés pour étudier les mécaniques publiques, la nomenclature des modes, les règles de stations et de lignes, les améliorations, les couleurs de cartes, les commandes et l'approche de conception. Les libellés de liens sont descriptifs afin que le projet conserve son vocabulaire Mini Subway.

1. [Fiche officielle sur la plateforme de distribution — description, modes, options visuelles, villes et soundtrack](https://store.steampowered.com/app/287980/)
2. [Guide communautaire — règles de base, stations, passagers, gestion du réseau et contrôles](https://steamcommunity.com/sharedfiles/filedetails/?id=313791555)
3. [Guide de création de cartes — types de stations, palettes jour/nuit, couleurs de lignes et paramètres de carte](https://steamcommunity.com/sharedfiles/filedetails/?id=2295902845)
4. [Discussion de commandes clavier et de vitesse — référence historique à vérifier sur la plateforme visée](https://steamcommunity.com/app/287980/discussions/0/35221031816936926/)
5. [Référence communautaire des récompenses hebdomadaires, des locomotives et des améliorations](https://steamcommunity.com/sharedfiles/filedetails/?id=2295902845)
6. [Entretien de conception avec l'équipe de développement — minimalisme, idée de départ et conception du jeu](https://www.pockettactics.com/dinosaur-polo-club/interview)
7. [Schéma de données communautaire — palette de ligne, propriétés de carte et paramètres](https://gist.github.com/tiernan/f2197c22f99d9bcafa519aa6be86beea)
8. [Mises à jour de version et notes de fonctionnalités — historique des cartes, captures et améliorations](https://steamcommunity.com/app/287980/discussions/0/35221031816936926/)

### Limites des sources

- Les pages officielles décrivent les objectifs et grandes fonctionnalités, mais ne publient pas nécessairement tous les chiffres internes.
- Les guides communautaires peuvent se rapporter à des versions anciennes ou à des plateformes différentes.
- Les couleurs RVB de la section 4 sont documentées dans un guide de configuration de cartes ; elles ne doivent pas être interprétées comme la palette obligatoire de toutes les cartes.
- Les capacités exactes, le nombre de lignes, les stocks initiaux, les récompenses et les exceptions sont variables selon les cartes.
- Les facteurs de vitesse documentés ici sont ceux que Mini Subway devrait implémenter explicitement ; d'autres commandes ou comportements spécifiques à une plateforme doivent être vérifiés dans l'application ciblée.
- Les règles de Mini Subway doivent être confirmées par tests, notamment la capacité, le compte à rebours de surcharge, le routage des passagers et la libération des ressources lorsqu'une ligne change.

---

# 24. Checklist de livraison — définition de « complet »

## Fonctionnement de la simulation
- [ ] Les stations apparaissent selon une graine déterministe.
- [ ] Les formes communes et spéciales sont prises en charge.
- [ ] Les passagers ont une destination par forme.
- [ ] Les lignes sont ordonnées, colorées et validées.
- [ ] Les trains parcourent leur ligne et changent de sens correctement.
- [ ] Les boucles fonctionnent sans oscillation ou blocage.
- [ ] Les correspondances fonctionnent et ont un coût temporel.
- [ ] Les trains ont une capacité finie.
- [ ] Les wagons augmentent la capacité.
- [ ] Les stations ont une limite et une alerte de surcharge.
- [ ] Une station d'échange augmente la capacité et accélère les transferts.
- [ ] Les ponts/tunnels sont nécessaires pour traverser l'eau.
- [ ] Les récompenses périodiques sont cohérentes avec l'inventaire.
- [ ] Le score compte uniquement les passagers réellement livrés.

## Modes et options
- [ ] Classique.
- [ ] Infini.
- [ ] Extrême.
- [ ] Créatif.
- [ ] Défis quotidiens/hebdomadaires, si activés.
- [ ] Pause, vitesse 1× et 2×.
- [ ] Mode Nuit.
- [ ] Mode Daltonien.
- [ ] Volume musique/effets.
- [ ] Réduction des mouvements.
- [ ] Records et progression locale.

## Interface et qualité
- [ ] Carte claire, palette harmonieuse et lignes distinguables.
- [ ] Stations et passagers lisibles à petite taille.
- [ ] Alertes de surcharge compréhensibles.
- [ ] Panneau de ressources utilisable à la souris et au toucher.
- [ ] Pas de conflit entre dessin de ligne et déplacement de carte.
- [ ] Menu pause, redémarrage et fin de partie fonctionnels.
- [ ] Affichage correct sur desktop et mobile.
- [ ] Aucun débordement, bug d'inventaire ou double comptage.
- [ ] Musique et effets non intrusifs et désactivables.

## Progression et robustesse
- [ ] Seed enregistrée et reproduisible.
- [ ] Records locaux persistants.
- [ ] Défis déterministes si utilisés.
- [ ] Tests du graphe de lignes et des destinations.
- [ ] Tests de surcharge et fin de partie.
- [ ] Tests de toutes les améliorations.
- [ ] Tests des particularités de chaque carte.
- [ ] Tests de longue durée et performance.
- [ ] Données de carte séparées du code moteur.
- [ ] Les assets et le code sont originaux et propres à Mini Subway.

**Définition de fin :** Mini Subway est prêt lorsque le système de transport est déterministe, les règles sont testées, les quatre modes principaux ont des comportements distincts, les paramètres de chaque carte sont explicites et la présentation reste claire sous forte charge. Une simple carte dessinable avec des trains animés n'est pas suffisante : la qualité vient du routage cohérent, de la pression progressive, des choix de ressources et de la lisibilité de la carte finale.

---

*Fin du cahier de conception Mini Subway.*

---

# 25. Annexe — Multijoueur (Coopération et Versus)

> Section ajoutée lors de la préparation du chantier : le cahier d'origine ne détaillait pas le multijoueur. Les choix ci-dessous sont des **décisions de départ** ; l'agent peut les affiner, en les consignant dans `DECISIONS.md`.

## 25.1 Principes communs

- Le moteur (section 17) est **déterministe** : état initial = `(carte, graine, mode, version des règles)` ; évolution = suite ordonnée de **commandes** appliquées à des **ticks** précis. Deux clients qui appliquent les mêmes commandes aux mêmes ticks obtiennent le même état.
- On synchronise des **commandes** (tracer/prolonger/supprimer une ligne, poser un train ou un wagon, choisir une récompense, pause, vitesse), jamais l'état complet à chaque frame. Un snapshot périodique (toutes les quelques secondes) sert à la reconnexion et à détecter une dérive (hash d'état).
- Chaque commande porte : `id` unique (idempotence : rejouée = sans effet), auteur, tick d'application, type, paramètres. Le coordinateur ordonne les commandes concurrentes de façon stable (tick, puis ordre d'arrivée dans le journal).
- Salon : code d'invitation, présence, état « prêt », départ par l'hôte. Partie pleine, code inconnu et départ concurrent sont des erreurs explicites.
- Pas de serveur de confiance : l'hôte (ou le journal partagé) fait foi. Les limites anti-triche sont à documenter honnêtement ; aucun classement ne doit être présenté comme vérifié.

## 25.2 Coopération (2 à 4 joueurs)

- Un monde, un réseau, un inventaire et un score communs ; la défaite est collective.
- Toutes les ressources sont partagées : une ressource dépensée par un joueur disparaît pour les autres (dépense atomique, jamais double).
- Le temps est partagé : pause et vitesse sont décidées par l'hôte ou par vote (au choix, à documenter). Le choix de récompense hebdomadaire est fait par le premier joueur qui valide, ou par vote.
- Édition concurrente d'une même ligne : le journal tranche ; la commande perdante est refusée avec un message clair.

## 25.3 Versus (2 joueurs)

- Même carte, même graine, même séquence d'apparition de stations et de passagers pour les deux ; **deux réseaux indépendants**, chacun avec son inventaire et son score.
- Chaque joueur ne peut émettre de commandes que sur son propre réseau. L'adversaire voit une vue du réseau de l'autre (lecture seule).
- Le premier dont le réseau perd (surcharge selon le mode Classique) perd le duel. Même tick = égalité, départagée par le score de passagers livrés, sinon match nul.
- Revanche : nouvelle graine, mêmes participants.

## 25.4 Déconnexion, abandon, fin

- Déconnexion : le joueur a une fenêtre de reconnexion (valeur configurable) pendant laquelle la partie se met en pause (coopération) ou continue sans ses commandes (Versus) ; au-delà, abandon.
- Abandon en Versus = défaite ; en coopération, la partie continue avec les joueurs restants (le réseau reste intact).
- Fin de match : écran récapitulatif commun, scores, station fatale, graine, bouton revanche.

## 25.5 Extension future (non implémentée)

Handicaps et pénalités dynamiques (ex. un joueur subit un malus lorsqu'un autre livre beaucoup de passagers) : prévoir seulement un champ versionné `modifiers` dans la configuration de match et un point d'application documenté dans le moteur. Aucune interface ni aucun effet dans cette livraison.
