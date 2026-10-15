> **Précisions prioritaires sur ce prompt (ajoutées au dépôt)**
> - Le cahier n'est pas « joint » : il est dans le dépôt, `games/mini-subway/docs/CAHIER_DE_CONCEPTION.md`. Lire aussi `games/mini-subway/CLAUDE.md` (règles de travail, prioritaires). La section 25 du cahier fixe l'annexe multijoueur.
> - **Budget limité (≈ 100 $)** : ordre de priorité = moteur déterministe testé → solo jouable et beau (gates visuels 1 et 2) → modes Infini/Extrême/Créatif et cartes → multijoueur Coopération puis Versus → finition. Limiter le nombre d'agents en parallèle, éviter les captures inutiles. Vers 80 % du budget consommé : stabiliser, pousser un checkpoint sur `feature/mini-subway`, écrire l'état exact (fait / partiel / non fait) dans `docs/ETAT.md`, puis s'arrêter proprement.
> - Aucun commit ni push sur `main`, aucun déploiement, aucune donnée de production.

---

# PROMPT DE LANCEMENT — MINI SUBWAY

## Mission

Tu es le développeur principal, le directeur technique et le responsable qualité de **Mini Subway** dans le dépôt GameHub. Tu dois réaliser le jeu de bout en bout à partir du document joint `MINI_SUBWAY_CAHIER_DE_CONCEPTION.md`.

Le cahier des charges joint est la **référence fonctionnelle prioritaire**. Lis-le intégralement avant de coder, y compris les annexes multijoueurs et la checklist finale. N'implémente pas une version simplifiée en prétendant qu'elle est complète. Ne remplace pas les mécaniques précisées par tes propres idées. Si le document distingue les règles confirmées, les variantes et les valeurs à calibrer, respecte cette distinction : les données variables doivent rester configurables et les hypothèses doivent être documentées et testées.

Le nom du projet est exclusivement **Mini Subway**. N'utilise pas le nom d'un autre jeu dans l'interface, le code, les noms de fichiers, les commentaires, les commits, les captures ou la documentation de conception. Le jeu doit disposer de son propre code, de ses propres visuels, de son identité artistique et de ses sons originaux. Ne copie aucun code, asset, carte, illustration, texte, son ou branding propriétaire. Implémente les mécaniques décrites dans le cahier avec une expression visuelle et technique originale.

**Objectif : livrer un jeu web abouti, agréable, robuste, très soigné visuellement et jouable, avec une simulation testée, les modes demandés, et une revue indépendante. Tu prends les décisions nécessaires sans attendre que le propriétaire valide chaque lot.**

---

## 1. Git, branche de développement et protection du dépôt

Avant toute modification :

1. Inspecte le dépôt, `git status`, les branches, les worktrees et les éventuelles modifications non commitées.
2. Fais un `git fetch origin` et relève le SHA courant de `origin/main`.
3. Vérifie les instructions du dépôt (`CLAUDE.md`, README, scripts de test, conventions et architecture existante).
4. Vérifie que le cahier joint est accessible dans son intégralité. S'il n'est pas présent dans le dépôt, utilise le fichier joint à cette mission. Ne continue pas en te basant uniquement sur un résumé ou sur ta mémoire.
5. Vérifie si `feature/mini-subway` existe déjà. Si elle n'existe pas, crée-la depuis le dernier `origin/main`. Si elle existe, inspecte son historique et son contenu puis reprends-la sans écraser de travail. Ne remplace jamais une branche existante sans vérification.
6. Confirme que tu travailles bien dans un worktree propre et isolé pour Mini Subway. Si un worktree existe déjà, vérifie-le avant toute opération.

### Règles de publication

- Toutes les modifications du jeu doivent rester sur `feature/mini-subway`.
- **Ne committe et ne pousse jamais sur `main`. Ne merge pas la branche dans `main` et ne déploie rien.**
- Des commits de checkpoint sont autorisés sur `feature/mini-subway` pour préserver le travail dans l'environnement cloud. Pousse uniquement cette branche, normalement, sans `--force` ni `--force-with-lease`.
- Avant chaque commit, inspecte le diff indexé et exclue secrets, fichiers personnels, journaux, caches, captures inutiles et sorties temporaires.
- Avant chaque push, fetch les références distantes et vérifie qu'il s'agit d'une avance rapide. Si la branche a divergé, arrête-toi et analyse avant toute action.
- Préserve le travail des autres sessions, worktrees, branches et fichiers non committés. Ne fais aucun reset destructif.
- Ne modifie pas les autres jeux, le présentateur IA, l'administration ou le design global du hub, sauf intégration strictement nécessaire et documentée. Le périmètre principal est Mini Subway.

---

## 2. Le cahier des charges fait foi

Le cahier de conception définit notamment :

- la boucle de simulation et l'objectif du mode standard ;
- les cartes, géographies, stations, formes, destinations et passagers ;
- la création, le prolongement, la suppression et les contraintes des lignes ;
- les couleurs des lignes et les palettes d'affichage ;
- les trains, locomotives, wagons, capacités, arrêts et transferts ;
- le routage des passagers et les règles de correspondance ;
- le budget périodique, les choix d'améliorations et les ressources de franchissement ;
- les modes Classique, Infini, Extrême et Créatif, ainsi que les défis lorsqu'ils sont inclus dans le périmètre documenté ;
- les cartes et leurs particularités ;
- le score, les records, les statistiques et la progression ;
- la pause, les vitesses, les commandes desktop et tactiles ;
- les options, l'accessibilité, le mode Nuit et le mode Daltonien ;
- l'audio, les effets sonores et les principes de musique adaptative ;
- l'architecture de simulation, les graines déterministes et les tests ;
- **l'annexe multijoueur : Coopération à 2–4 joueurs et Versus à 2 joueurs** ;
- les extensions futures de handicaps et pénalités.

Transforme l'ensemble en checklist d'exigences traçable, et lie chaque exigence à du code, des données, un test ou une décision documentée. N'omets aucune section au motif qu'elle semble secondaire. Si une fonction est explicitement conditionnelle ou varie selon la carte/version, implémente-la comme paramètre documenté et non comme une constante universelle arbitraire.

### Multijoueur : exigence de cette livraison

L'annexe multijoueur fait partie du cahier et doit être implémentée, pas simplement mentionnée dans un README :

- **Coopération** : les joueurs partagent un monde, un réseau, les ressources et le score ; une défaite est collective.
- **Versus** : deux joueurs partent de la même carte/configuration/seed et de la même séquence d'événements, mais gèrent chacun un réseau indépendant. Le premier dont le réseau perd selon les règles du cahier perd le duel.
- Les clients doivent réellement synchroniser l'état et les commandes ; une simulation locale indépendante présentée comme multijoueur est interdite.
- Le temps partagé, les commandes concurrentes, les reconnexions, l'abandon et la fin de match doivent être définis et testés.
- Les handicaps et pénalités dynamiques appartiennent à une version ultérieure. Prévois seulement un point d'extension documenté et versionné ; n'ajoute ni bouton factice ni modificateur de handicap dans cette livraison.

Si une contrainte technique ou de sécurité rend un sous-ensemble impossible à livrer correctement, ne simule pas une réussite. Produis d'abord le meilleur fonctionnement sûr, documente précisément le blocage et sa cause et ne déclare pas ce sous-ensemble terminé.

---

## 3. Équipe d'agents spécialisés et revue indépendante obligatoire

Utilise les sous-agents ou capacités d'équipe réellement disponibles dans l'environnement cloud. Vérifie les mécanismes disponibles avant de les utiliser. N'affirme pas qu'un agent indépendant a été mobilisé si ce n'est pas le cas. Si les agents indépendants ne sont pas disponibles, signale cette limite et sépare malgré tout les passes d'audit et de revue au mieux des outils accessibles.

Organise au minimum les rôles suivants, en parallèle lorsque les dépendances le permettent :

### A. Architecte de simulation / gameplay

Responsable du moteur déterministe, du graphe de réseau, des stations, passagers, itinéraires, trains, capacités, budget, modes et conditions de défaite. Il écrit les tests unitaires du moteur et n'enfouit pas la simulation dans le rendu visuel.

### B. Directeur artistique / UI-UX

Responsable d'une DA originale et cohérente, d'une hiérarchie visuelle nette, du HUD, de la carte, des couleurs et formes, des interactions de construction, des états d'alerte, des menus, de la typographie et de la version mobile. Il doit livrer des décisions concrètes et un jeu qui a du caractère, non un dashboard générique.

### C. Technical artist / motion / audio

Responsable du rendu de la carte, de la géographie, des trains et passagers, des animations, du feedback, des ombres et des sons originaux. Il optimise les rendus et respecte les préférences de mouvement réduit ainsi que les commandes utilisateur.

### D. Architecte multijoueur / Firebase

Responsable des salons, de la synchronisation, du modèle de commandes, du déterminisme du mode Versus, des actions concurrentes, des reconnexions et des règles nécessaires dans la branche de développement. Il doit auditer les règles Firebase existantes avant de choisir les chemins et permissions.

### E. QA / performance / accessibilité

Responsable des tests, de la stabilité, de la performance, des résolutions, des contrôles au clavier et au tactile, de la simulation longue, du déterminisme et de la compatibilité entre deux clients distincts.

### F. Reviewer visuel indépendant — obligatoire

Cet agent est chargé de **refuser** un résultat visuellement insuffisant. Il ne doit pas être le seul agent à implémenter les visuels qu'il valide. Il inspecte les captures réelles du navigateur à taille native, pas seulement le code, des miniatures ou les descriptions d'autres agents.

Le reviewer évalue au minimum :
- identité artistique, caractère et cohérence générale ;
- palette, contraste et lisibilité de la carte ;
- typographie, hiérarchie, densité et composition ;
- stations, lignes, passagers, trains et détails du terrain ;
- ombres, éclairages, textures, artefacts, raccords et qualité des animations ;
- lisibilité des files et des alertes de surcharge ;
- menus, récompenses, fenêtres, écran de fin et mode multijoueur ;
- responsive desktop/mobile ;
- fluidité et qualité perçue des interactions.

Il doit produire des défauts actionnables, avec emplacement, gravité (bloquant/majeur/mineur), impact, correction conseillée et captures de preuve. Une note globale ne masque pas un défaut majeur. Il ne doit jamais valider automatiquement parce que les tests passent ou que beaucoup de travail a été réalisé.

### Boucle d'approbation

1. L'agent responsable implémente une partie concrète.
2. Le jeu est ouvert et inspecté dans le navigateur.
3. Le reviewer examine des captures réelles et rend son verdict indépendant.
4. L'agent responsable corrige les problèmes bloquants et majeurs.
5. Le reviewer examine les nouvelles captures.
6. QA relance les tests concernés.

Au minimum trois gates visuels sont obligatoires : direction artistique/prototype de carte ; première boucle jouable ; jeu complet et multijoueur intégré. Si une revue révèle encore un défaut majeur, continue la correction. Ne considère pas le projet terminé simplement parce que la compilation ou les tests fonctionnels passent.

Ne lance pas des dizaines d'agents sans objectif. Évite que plusieurs agents modifient simultanément les mêmes fichiers. Tu restes l'intégrateur et le responsable final.

---

## 4. Exécution de A à Z — sans demandes de validation intermédiaires

Tu prends les décisions d'implémentation à partir du cahier et du dépôt. Ne me demande pas de choisir les bibliothèques ou de valider chaque lot. Inscris les choix importants et les hypothèses dans `DECISIONS.md`, et les blocages réels dans `QUESTIONS.md`, mais poursuis lorsque tu peux avancer sans risque.

### Phase 0 — Audit et plan traçable

- Vérifie le cahier complet et extrais toutes les exigences en checklist.
- Inspecte la stack, les contraintes de GitHub Pages et l'architecture partagée GameHub.
- Inspecte les règles Firebase de phase 2, les permissions existantes et les patterns des autres jeux uniquement pour comprendre leur compatibilité.
- Définis une architecture simple et modulaire adaptée à la simulation.
- Identifie les dépendances réellement nécessaires ; n'ajoute pas de framework à la mode sans justification.
- Établis la matrice : exigence → module → test → état.

### Phase 1 — Fondations du moteur

Implémente la simulation indépendante du rendu : géographie et graines déterministes, stations, formes, passagers, lignes, graphe, calcul d'itinéraires, transferts, locomotives, wagons, capacité, temps, surcharge, budget, récompenses, modes et score.

Les règles doivent être testables sans navigateur. Les paramètres des cartes doivent résider dans des fichiers de données clairs. Toute valeur incertaine doit être exposée comme paramètre à calibrer et documentée.

### Phase 2 — Prototype jouable et identité artistique

Construis immédiatement un prototype navigable dans le navigateur avec une carte reconnaissable, des stations, des lignes que l'on peut tracer, des trains en mouvement, des passagers visibles et une vraie boucle de simulation.

Conçois une identité visuelle originale et premium. Elle doit avoir du caractère sans nuire à la lecture du réseau. Le style doit rester épuré, mais les surfaces, formes, couleurs, animations, éclairages, transitions, typographie et sons doivent être délibérés. Ne copie pas le langage graphique exact d'un produit existant et n'utilise pas des illustrations génériques sans personnalité.

Le minimalisme est une discipline : la carte doit transmettre l'information d'abord, les détails de finition doivent enrichir cette lecture. La beauté ne doit jamais masquer les stations menacées, les destinations, les lignes ou les commandes.

### Phase 3 — Construire le jeu complet

Implémente toutes les mécaniques, modes, options, cartes, ressources, contrôles, tableaux de scores, records et options d'accessibilité définis dans le cahier. Chaque modalité affichée doit fonctionner réellement. Ne laisse pas de boutons décoratifs, de sections « bientôt disponibles » ni de valeurs fictives présentées comme réelles.

Les modes solo doivent être jouables sans connexion multijoueur. La sauvegarde et la progression doivent respecter les limites du site statique et du modèle de données prévu.

### Phase 4 — Multijoueur coopératif et Versus

Construis le lobby, le code d'invitation, la présence, l'état prêt, le départ, les commandes validées, la synchronisation, les ressources partagées en coopération et les deux réseaux déterministes en Versus.

Le modèle de synchronisation doit être explicite. Ne publie pas l'état complet arbitrairement à chaque frame. Les clients soumettent des commandes validables ; l'état est appliqué de façon atomique ou ordonnée selon l'architecture retenue. Les doubles clics, mises à jour concurrentes et commandes rejouées ne doivent pas dépenser deux fois une ressource.

Inspecte les règles Firebase phase 2 avant tout ajout. Si Mini Subway nécessite de nouveaux chemins, ajoute dans cette branche uniquement des règles minimales, isolées et testées sur l'émulateur. N'élargis aucune règle existante pour accélérer le travail. **Aucun déploiement Firebase en production** ; fournis les modifications et les instructions de migration pour une revue ultérieure.

Si un serveur de confiance est absent, sois honnête sur les limites anti-triche du coordinateur client. Ne qualifie pas de classé ou d'inviolable un résultat non vérifié. Respecte l'annexe du cahier.

### Phase 5 — Audio, game feel et finition

Ajoute les retours sonores et animations définis ou recommandés dans le cahier, en respectant une ambiance originale et la possibilité de désactiver les sons. Les sons sont désactivables, aucun son ne doit démarrer de façon intrusive et aucune ressource sous licence ne doit être copiée.

Travaille le tracé des lignes, la pose d'un train, la montée des passagers, les transferts, les ressources gagnées, l'alerte de surcharge et la fin de partie. Les interactions doivent répondre vite, être cohérentes et rester fluides. Respecte `prefers-reduced-motion`.

### Phase 6 — Reviewer et corrections

Effectue les gates visuels indépendants décrits plus haut. Capture les écrans et les états importants à haute résolution. Le reviewer doit relever les défauts réels et vérifier les corrections. Répète le cycle jusqu'à l'absence de défaut bloquant ou majeur non résolu dans les écrans essentiels.

### Phase 7 — Stabilisation et livraison

Réexécute toute la suite de tests, les tests navigateur et deux clients distincts pour les modes multijoueurs. Corrige les problèmes plutôt que de simplement les documenter lorsqu'ils peuvent être résolus dans le périmètre.

Vérifie tous les critères de la checklist de livraison du cahier. N'annonce aucune fonctionnalité comme terminée sans test vérifiable.

---

## 5. Architecture et qualité technique attendues

- Sépare moteur de simulation, configuration des cartes, interface, rendu, audio, persistance et adaptateurs réseau.
- Le temps de simulation repose sur des ticks fixes ; il ne doit pas dépendre du framerate ou du nombre de rafraîchissements du navigateur.
- Utilise une graine déterministe pour reproduire les cartes et vérifier les matchs Versus.
- Le rendu doit être distinct de l'état de simulation.
- Évite les mises à jour Firebase par frame. Utilise des commandes, snapshots et fréquences maîtrisées.
- Réutilise raisonnablement les composants partagés GameHub mais garde Mini Subway modulaire.
- Évite les dépendances disproportionnées et les architectures artificiellement complexes.
- Aucun secret dans le code client ou dans le dépôt.
- Les textes non fiables doivent être affichés de façon sûre, sans injection HTML.
- Les erreurs doivent être gérées explicitement : réseau perdu, lobby invalide, partie pleine, ressource indisponible, code invalide, sauvegarde impossible.
- Tous les boutons, menus, contrôles tactiles et options doivent réellement fonctionner.
- Les valeurs de conception variables doivent être centralisées et documentées.
- Les performances doivent rester bonnes sur une machine de bureau ordinaire et un mobile compatible.

---

## 6. Tests obligatoires

Le cahier contient une checklist exhaustive : utilise-la comme source des tests, et ajoute les tests nécessaires découverts pendant l'implémentation.

### Simulation

Teste notamment :
- génération reproductible avec seed ;
- apparition et évolution des stations ;
- formes communes et spéciales ;
- passagers et destinations ;
- routage à travers lignes et correspondances ;
- itinéraires impossibles ;
- sens des trains et boucles ;
- capacités et wagons ;
- franchissements eau/obstacles ;
- transfert et station d'échange ;
- budget et récompenses sans doublon ;
- surcharge et défaite ;
- score exact ;
- comportement et particularités de chaque mode et carte.

### Multijoueur

Utilise deux à quatre identités distinctes et des fenêtres/navigateurs réellement indépendants :
- création et jonction de salon ;
- code inconnu, match plein, départ concurrent et joueur parti ;
- monde commun et ressources atomiques en coopération ;
- même départ et séquence d'événements en Versus ;
- réseaux indépendants ;
- premier échec correctement déclaré ;
- égalité au même tick ;
- reconnexion et abandon ;
- commandes rejouées, tardives ou concurrentes ;
- permissions membre/non-membre/non authentifié ;
- aucun état privé d'adversaire modifiable hors des commandes autorisées.

### Interface et produit

Teste desktop 1440×900 et 1920×1080, ainsi que mobile 390×844 et au moins un autre format adapté. Vérifie les commandes souris et tactiles, zoom/pan, pause, vitesses, menus et clavier ; focus visible ; contraste ; palette daltonien ; mode Nuit ; sons désactivables ; mouvement réduit ; fin de partie et revanche.

### Performance et robustesse

Mesure le temps de chargement, la fréquence des updates, la stabilité de longues simulations et le comportement en onglet arrière-plan. Vérifie l'absence de croissance mémoire anormale, de boucles infinies et de fuites de listeners. Teste les erreurs réseau et la resynchronisation.

Tous les tests réels doivent être exécutés sur des environnements locaux ou émulateurs. Ne crée, ne modifie et ne supprime aucune donnée de production pour tester.

---

## 7. Revue visuelle — critère d'acceptation de premier rang

Le jeu ne doit pas être considéré comme terminé uniquement parce qu'il est fonctionnel.

Le reviewer doit examiner des captures natives des écrans suivants :

- menu principal et choix de mode ;
- carte en début de partie ;
- réseau en cours avec plusieurs lignes ;
- construction et déplacement d'une ligne ;
- carte densément peuplée ;
- station en surcharge et alerte ;
- choix de récompense ;
- panneau de pause et options ;
- écran de fin et récapitulatif ;
- lobby multijoueur ;
- coopération active ;
- deux réseaux Versus ;
- mobile aux dimensions indiquées.

Le reviewer doit examiner les captures à taille réelle pour détecter : texte illisible, contrastes faibles, incohérence des couleurs, tracés qui se confondent, alignements approximatifs, stations masquées, chevauchements, textures peu qualitatives, effets gratuits, menus inachevés, états d'interaction flous, animations saccadées et différence de finition entre les écrans.

Fournis des scores détaillés sur 10 pour : direction artistique, lisibilité du réseau, composition, typographie, animations, retours d'action, interface de jeu, interface multijoueur, mobile et finition générale. Toute note faible doit avoir un plan de correction. Aucune note moyenne ou basse ne doit être dissimulée dans la moyenne générale.

Ne copie pas des écrans d'un autre produit. Utilise les sources de référence pour apprendre des principes, puis crée une identité propre à Mini Subway.

---

## 8. Gestion des décisions et des blocages

Crée ou mets à jour :

- `DECISIONS.md` : décisions importantes, alternatives examinées et raisons ;
- `QUESTIONS.md` : incertitudes ou blocages réels, avec hypothèses retenues lorsque le travail peut continuer ;
- une checklist de traçabilité des exigences ;
- un rapport de revue visuelle avec captures ;
- un README du jeu expliquant lancement, commandes, architecture, modes, tests et limites multijoueurs.

Ne me sollicite pas pour chaque décision ordinaire. Choisis la solution la plus cohérente avec le cahier et documente-la. Si un élément n'est pas explicitement fixé et qu'il est indispensable pour continuer, utilise les indications « variable », « recommandation » ou « à mesurer » du cahier, expose le choix sous forme de paramètre et poursuis.

En revanche, n'invente pas une preuve de fonctionnalité ou de sécurité. Si tu ne peux pas valider une partie, dis-le clairement et donne la meilleure alternative réelle.

---

## 9. Utilisation du budget et autonomie

Aucun plafond de dépense additionnel ne t'a été fixé pour cette mission. N'engage toutefois aucun achat ni service payant sans autorisation. Privilégie d'abord les outils, bibliothèques et ressources disponibles, et évalue les coûts d'exploitation avant d'introduire un service externe.

Tu es autorisé à prendre les décisions de conception, à exécuter les lots, à faire les tests, à créer les commits et à pousser les checkpoints sur `feature/mini-subway` sans demander une validation intermédiaire, à condition de respecter les règles Git ci-dessus.

Ne sollicite pas le propriétaire pour un choix de palette, une bibliothèque ou l'ordre des tâches. Si une fonctionnalité nécessite un nouveau service payant, une modification de DNS, de facturation, une clé externe ou un changement de production, ne l'active pas : propose un plan documenté et continue les autres tâches indépendantes.

---

## 10. Conditions finales de livraison

Le travail est considéré comme livré lorsque :

- le jeu peut être lancé localement et réellement joué ;
- les mécaniques et modes du cahier sont implémentés ou chaque exception est explicitement documentée ;
- les cartes et paramètres variables sont configurés proprement ;
- les modes solo restent fonctionnels sans réseau ;
- les modes Coopération et Versus ont été testés avec plusieurs clients distincts ;
- les règles Firebase ajoutées restent confinées à la branche et ont été testées sur l'émulateur ;
- les tests de simulation, d'interface, de synchronisation et de sécurité passent ;
- le reviewer visuel indépendant n'a plus de défaut bloquant ou majeur non résolu sur les écrans essentiels ;
- les captures desktop et mobile sont sauvegardées ;
- le rapport de traçabilité explique quelles exigences sont terminées ;
- la branche `feature/mini-subway` est poussée et les commits de checkpoints sont vérifiables ;
- aucune modification n'a été poussée sur `main` et rien n'a été déployé en production.

### Rapport final obligatoire

À la fin, donne un compte rendu précis comprenant :

1. nom de branche et SHA final ;
2. URL locale et instructions de lancement ;
3. fonctionnalités implémentées par rapport au cahier ;
4. modes réellement jouables ;
5. résultats des tests avec commandes exactes ;
6. captures desktop/mobile et rapport du reviewer visuel ;
7. notes par catégorie et défauts corrigés ;
8. architecture et règles Firebase préparées dans la branche, sans déploiement ;
9. limites restantes, notamment sur l'autorité serveur et l'anti-triche ;
10. dépenses engagées et services payants éventuels ;
11. confirmation explicite que `main` n'a pas été modifiée et qu'aucun déploiement n'a eu lieu.

**Ne t'arrête pas après le prototype. Réalise le jeu complet décrit dans le cahier, jusqu'à la checklist finale, avec des tests réels, une revue visuelle indépendante et une branche de développement isolée. La perfection est l'objectif ; si une limite empêche de l'atteindre, identifie-la et documente-la sans la masquer.**
