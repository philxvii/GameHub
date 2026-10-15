# MISSION 3 du cloud (2026-10-15) — refonte « premium » de Qui est-ce ?

**Cette mission REMPLACE `MISSION_2.md`** (dont M2-0, le bug du portrait, et M2-1, les visages variés,
sont repris et agrandis ci-dessous). Elle prime sur `CLOUD_PLAN.md` en cas de contradiction.
Le texte de l'utilisateur est reproduit tel quel plus bas, après ce préambule d'adaptation.

## Préambule d'adaptation au cloud (à lire d'abord)

Le prompt de l'utilisateur a été écrit pour une session locale. Voici comment l'appliquer dans le
cloud. En cas de doute, ces règles l'emportent sur la lettre du prompt, **jamais sur son esprit**.

1. **Budget : 50 $** (solde annoncé 2026-10-15), réserve de 8 $ pour la fin. C'est beaucoup moins
   que ce que demande le prompt : **priorise et approfondis**, ne survole pas. Répartition guide :
   bug du portrait et test d'image 4 $ ; audit + note de DA 4 $ ; direction artistique 8 $ ;
   interface (lot 4) 12 $ ; personnages (lot 5) 12 $ ; game feel 5 $ ; tests / captures 5 $.
   Si ça ne tient pas : finis proprement l'interface et le casting plutôt que tout à moitié.
2. **Git (contradiction à connaître)** : le prompt dit « pas de commit / push sans autorisation ».
   Dans le cloud, **le dépôt est ta seule mémoire** : l'utilisateur a déjà autorisé les commits et
   pushs **sur la branche `proto/qui-est-ce-3d` uniquement**. Continue donc de commiter et pousser
   là, après chaque étape. **Jamais `main`, jamais `--force`, aucun déploiement.** (Identité
   `philxvii`, message court en français minuscule, aucun trailer.)
3. **« Ouvre Chrome sur localhost et laisse-le ouvert »** : impossible dans le cloud. À la place :
   lance le serveur local et Chromium sans affichage pour **tester et capturer**, **regarde toi-même
   chaque capture** (écrans clés, bureau 1440 × 900, 1920 × 1080 et mobile 390 × 844) et enregistre-les
   dans `reports/premium/`. L'utilisateur ouvrira le jeu sur son PC après `git pull`
   (`PC_RUNBOOK.md` à jour, avec l'URL exacte). Les temps et FPS du cloud (rendu logiciel) ne valent rien.
4. **Recherche (lot 2)** : tente d'ouvrir les liens ; **si le réseau les bloque, n'insiste pas** (une
   tentative par lien, pas de contournement) et appuie-toi sur ce que tu sais de ces jeux. Garde la
   note courte (une page : observé / retenu / choix à nous / ce qu'on n'imite pas), dans `DA_NOTE.md`.
5. **Direction artistique : le prompt RÉOUVRE le choix.** L'utilisateur rejette désormais explicitement
   les cartes polaroïds, les fonds gris, le panneau noir, l'orange monospace sur noir, les typographies
   manuscrites partout. Le choix précédent « casting » (Polaroïds, Permanent Marker) est **abandonné** ;
   tu peux garder des idées utiles (révélation du salon, revanche en un clic, voyant de tour). Compare
   trois directions **réellement différentes** sur la vraie interface et choisis (décision réversible,
   notée dans `DECISIONS.md`). Le choix précédent n'est pas une contrainte.
6. **Sons** : le prompt demande d'évaluer des effets courts, discrets et désactivables. Cela remplace
   la consigne précédente « aucun son » : produis-les en **Web Audio synthétisé** (aucun fichier audio
   sous licence), **coupés par défaut tant que le joueur ne les active pas** si tu as un doute, avec
   un réglage visible et mémorisé. Pas de musique.
7. **Mobile** : le prompt demande une vraie adaptation mobile et tactile. Elle s'ajoute au jeu sur
   ordinateur (qui reste la cible principale) ; ne dégrade pas le bureau pour le mobile.
8. **Où travailler** : sur la version `games/qui-est-ce/v3d/` + `prototype-3d/` (jeu 3D, `qec3`,
   bot, réseau factice et Firebase de L5). **Ne modifie pas** le jeu en production
   (`games/qui-est-ce/index.html`, nœud `qec2`), ni Banqueroll, ni l'index, ni l'administration, ni
   le Worker IA. N'ajoute **pas** de règles Firebase en dehors de `qec3` (déjà ajoutées) ; pas
   d'autres sessions Claude ici, un seul worktree.
9. **Tests** : `games/qui-est-ce/tests/` n'existe pas ; les tests sont `prototype-3d/tools/test-board.js`,
   `test-game-logic.mjs`, `firebase/tests/qec3.test.js` (émulateur) et `node tools/check-links.js`.
   **Ajoute un test d'image** (comparaison de pixels : seule la case concernée change) : voir 10.
   Le SDK Firebase est bloqué dans le cloud : la partie à deux navigateurs sera notée « à faire sur
   le PC » dans `PC_RUNBOOK.md`, avec la commande exacte, mais teste tout le reste (bot, logique,
   règles sur l'émulateur, deux contextes locaux simulés si possible).
10. **BUG BLOQUANT à corriger en premier**, reproduit par l'utilisateur sur **GPU réel**
    (Chrome, Intel Iris Xe, 1440 × 900) sur `prototype-3d/board.html` et `v3d/` : dès qu'une
    partie contre le bot est lancée, **le portrait de « mon personnage » (le secret) est dessiné très
    grand, décalé à gauche, par-dessus 5 à 6 cartes** ; l'infobulle de survol est aussi coupée.
    Erreur console vue : `drawImage` d'un canevas de largeur ou hauteur nulle (`board3d.js`,
    `snapshot`). Les captures du cloud et `test-board.js` (12/12) ne l'ont pas détecté (aucune
    comparaison d'image). Trouve la cause réelle (zone de rendu non recalée, mesure avant mise en
    page, défilement…), corrige, et **ajoute `tools/test-board-pixels.js`** qui échoue sur le code
    actuel puis passe après correction (prouve-le dans `CLOUD_LOG.md`). Plus aucun écran « auto-validé »
    sans avoir regardé son image.
11. **Casting (lot 5) sans photos** : les photos viennent de Gemini sur le PC de l'utilisateur. Ici, tu
    peux fabriquer des **visages provisoires distincts** en mélangeant les 100 formes d'identité d'ICT
    (`build-ict/ict.npz`, `ids`), avec teints variés (grain de peau conservé), yeux, coiffures
    (`gen_cards.py`, nouveaux styles), pilosité et accessoires du roster. Mêmes 53 expressions, même
    squelette (le rig doit marcher sans changement). Poids ~2 à 3 Mo par personnage, aucun > 4 Mo.
    **Un visage laid ou dérangeant vaut moins qu'un visage commun : retire-le.** Dis franchement dans
    `FIN_DE_MISSION_3.md` ce qui n'est pas au niveau du personnage 01. Le personnage 01 reste validé
    (visage ICT, coiffure V4.1 optimisée) et n'est jamais écrasé.
12. **Mode autonome conservé** : tu ne t'arrêtes pas pour demander ; décisions réversibles dans
    `DECISIONS.md`, questions dans `QUESTIONS.md`. Limites dures inchangées (voir `CLOUD_PLAN.md`) :
    jamais `main`, aucun déploiement, aucun secret, aucun contournement de sécurité.
13. **Livrables de fin** : `FIN_DE_MISSION_3.md` (fait / décidé en autonomie / à faire sur le PC /
    cinq points douteux / questions), `PC_RUNBOOK.md` à jour (URL exacte du jeu, commande de la partie
    à deux), captures dans `reports/premium/` (la grille des 24 en premier), puis un seul message final
    court. Ne conserve pas de prototypes alternatifs inutilisés dans le code final.

---

# Texte de l'utilisateur (tel que reçu le 2026-10-15)

# GAMEHUB — QUI EST-CE ? : REFONTE COMPLÈTE AU NIVEAU D'UN VRAI JEU PREMIUM

Tu es le directeur artistique, game designer, UI/UX designer, technical artist 3D et développeur principal de Qui est-ce ? sur GameHub.

Je veux transformer ce jeu en une expérience multijoueur de grande qualité, avec sa propre identité artistique, ses personnages mémorables, ses animations, son ambiance et un vrai soin dans chaque interaction.

Ce n'est pas une demande de simple refonte CSS. Il faut améliorer ensemble :
- la direction artistique ;
- les personnages et leurs portraits ;
- la mise en scène ;
- la lisibilité de l'interface ;
- les animations et le game feel ;
- les interactions de déduction ;
- l'expérience multijoueur ;
- la fluidité et la finition générale.

Le résultat doit se distinguer des interfaces générées automatiquement. Il doit donner l'impression d'un jeu pensé, construit, testé et poli par une équipe de développement.

**Objectif final : une version réellement jouable, esthétique, expressive, robuste et agréable, ouverte sur localhost pour validation. Pas de commit, de push ou de déploiement sans mon autorisation.** *(Voir préambule, points 2 et 3 : adaptation au cloud.)*

---

## LOT 1 — Audit visuel, fonctionnel et technique

Commence par inspecter le dépôt et le jeu dans un vrai navigateur.

La capture actuelle montre :
- un fond beige/gris sans véritable atmosphère ;
- des cartes de personnages ressemblant à des polaroids ;
- des portraits très similaires, cadrés de la même façon et posés sur des arrière-plans gris ;
- un mélange de typographies manuscrites, monospace orange et polices classiques ;
- un panneau noir latéral qui ne semble pas appartenir au même système visuel que les cartes ;
- des scores et compteurs insuffisamment hiérarchisés ;
- une miniature de la planche adverse trop petite pour apporter une vraie valeur ;
- une interface qui fonctionne comme un prototype, sans finition visuelle cohérente.

Ne cherche pas à réparer cela avec quelques ombres, des bordures arrondies ou davantage de couleurs. Il faut une vraie direction artistique.

### Inspecte en priorité

- `games/qui-est-ce/` et l'ensemble de son code ;
- les règles du jeu, le moteur, le comportement des bots et le réseau ;
- `games/qui-est-ce/prototype-3d/`, si ce prototype est toujours présent ;
- les modèles, textures, coiffures, accessoires, références et captures déjà réalisés ;
- les tests existants ;
- la documentation et les décisions artistiques précédentes ;
- la version actuelle de Banqueroll, qui sert de référence de qualité sur GameHub ;
- les changements non commités et les éventuelles autres sessions Claude.

Établis une cartographie des écrans et des parcours réels :
1. création ou entrée dans une partie ;
2. attente des joueurs ;
3. choix du personnage secret ;
4. début de partie ;
5. pose et réponse aux questions ;
6. élimination des suspects ;
7. tentative de devinette ;
8. victoire ou défaite ;
9. revanche ou nouvelle partie.

Adapte cette liste aux mécaniques réelles du code. Ne réinvente pas les règles sans les avoir comprises.

Préserve le fonctionnement multijoueur, les bots et les données déjà compatibles avec Firebase. Ne modifie pas les règles Firebase de phase 2 ni les autres jeux.

---

## LOT 2 — Recherche sérieuse de direction artistique

Avant de choisir le style, consulte réellement les références ci-dessous. Ouvre les pages, observe les captures et, lorsque des retours de production sont disponibles, lis-les. *(Voir préambule, point 4 : si le réseau les bloque, une tentative par lien, sans contournement.)*

### PlayStation / Housemarque — Returnal

https://blog.playstation.com/2021/05/11/unpacking-returnals-ux-design-gameplay-first-ui-retro-futuristic-tech-and-accessibility/

Étudie :
- la cohérence entre l'univers du jeu et l'interface ;
- la hiérarchie des informations ;
- les timings d'animation ;
- le code couleur ;
- la complémentarité des sons et des retours visuels ;
- la manière d'éviter les distractions inutiles.

### Ubisoft — Assassin's Creed Valhalla

https://news.ubisoft.com/en-us/article/5Rys9UeXZh9bAjnHBZN4pC/assassins-creed-valhalla-bringing-accessibility-to-a-viking-epic

Étudie les décisions liées à la lisibilité des textes, à la taille des icônes et à l'expérience des joueurs découvrant l'interface.

### Ubisoft — personnalisation et HUD

https://news.ubisoft.com/en-us/article/1QLCE5mmONckIxhB8xJw6d/assassins-creed-black-flag-resynced-deep-dive-into-hud-customization

Observe comment l'information utile peut rester claire tout en limitant les éléments superflus. Ne transpose pas littéralement un HUD d'action à un jeu de déduction.

### Sony Pictures Animation — Spider-Verse

https://www.sony.com/en/brand/beyondthescreen/acrossthespiderverse/

https://www.sony.com/en/SonyInfo/technology/stories/entries/earlylook_spiderverse/

Étudie la construction d'une identité visuelle originale, les silhouettes, les matières, les expressions et le lien entre direction artistique et outils de création. Ne copie pas l'esthétique de Spider-Verse : extrais les principes de cohérence et de caractère.

### Rockstar Games

https://www.rockstargames.com/fr/reddeadredemption2

https://www.gamedeveloper.com/design/learn-how-rockstar-breathed-life-into-the-wildlife-of-i-red-dead-redemption-2-i-at-gdc

Étudie le soin des personnages et la crédibilité visuelle. Recherche également des retours de production sérieux sur la conception des personnages, les animations et les systèmes de jeu.

### Game feel

https://www.gdcvault.com/play/1022759/Game-Feel-Why-Your-Death

Étudie comment le rythme, l'animation, le son, les effets visuels et les retours d'action se combinent pour produire une sensation de qualité.

### Accessibilité et mouvement

https://developer.mozilla.org/fr/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance

Les animations doivent rester maîtrisées et les interactions utilisables au clavier. Respecte les préférences de réduction du mouvement et garde un indicateur de focus visible.

### Livrable de recherche

Crée une courte note locale de direction artistique qui distingue :
- les éléments observés dans les sources ;
- les principes que tu en retiens ;
- tes choix propres à Qui est-ce ? ;
- ce que tu décides de ne pas imiter.

Ne transforme pas cette étape en rapport interminable : elle doit conduire à des décisions et à une implémentation.

---

## LOT 3 — Construire une identité propre à Qui est-ce ?

Banqueroll possède sa propre ambiance, sa palette, son rythme, ses composants et sa personnalité. Qui est-ce ? doit atteindre le même niveau de finition, mais sans être une copie de Banqueroll.

Je veux une identité reconnaissable autour de la déduction, du casting de personnages et du mystère.

### Direction de travail à explorer

Commence par une piste de « studio de suspects » contemporain et premium, puis compare-la visuellement à deux alternatives réellement différentes.

Piste de départ :
- couleurs profondes et riches, mais pas un écran uniformément sombre ;
- couleurs d'accent utilisées pour indiquer les états du jeu ;
- portraits lumineux et mis en scène ;
- matériaux et arrière-plans travaillés ;
- typographie très lisible avec un caractère propre ;
- cartes donnant envie d'observer les visages ;
- panneaux d'information intégrés dans le même univers visuel.

Une palette possible à explorer est un bleu pétrole ou un bleu encre, avec des accents corail ou orange brûlé, des touches claires et une couleur secondaire spécifique à l'état du jeu. Ce n'est qu'une piste : choisis la palette définitive après examen des vrais rendus.

### Interdictions visuelles

Je ne veux plus :
- de cartes polaroids génériques ;
- d'arrière-plans gris uniformes derrière tous les portraits ;
- de panneaux noirs sans relation avec le reste ;
- de texte orange monospace sur fond noir utilisé comme décoration ;
- de typographies manuscrites partout ;
- de mélanges de styles sans logique ;
- de badges, numéros ou libellés techniques décoratifs ;
- de portraits qui semblent générés en série par IA ;
- de dégradés génériques et de glassmorphism généralisé ;
- d'un jeu qui ressemble à un tableau de bord SaaS.

Le design doit être expressif, professionnel, cohérent et immédiatement reconnaissable.

### Typographie

Construis un véritable système typographique :
- une police de titre avec une personnalité ;
- une police de texte lisible ;
- éventuellement une monospace uniquement pour des éléments techniques tels que le code de salon ;
- une hiérarchie claire pour les scores, noms et actions ;
- aucune typographie utilisée uniquement pour « faire stylé ».

Compare plusieurs associations sur la véritable interface avant de choisir. Vérifie le chargement et les licences des polices.

---

## LOT 4 — Repenser entièrement l'écran de jeu

Je veux une interface de jeu, pas une feuille Excel de portraits.

### Barre supérieure

Elle doit afficher de façon immédiatement compréhensible :
- l'identité du jeu ;
- le code de la partie, avec action pour le copier ;
- le score et l'état de la manche ;
- qui doit jouer ou répondre ;
- les informations essentielles sur les deux joueurs.

Supprime les compteurs redondants. Si le nombre de suspects restants est affiché, il doit être utile et avoir une hiérarchie claire.

### Plateau principal

Les 24 personnages doivent rester faciles à identifier.

Revois :
- la taille des portraits ;
- leur cadrage ;
- l'équilibre entre visage et fond ;
- la densité de la grille ;
- la disposition des noms ;
- les espaces entre les personnages ;
- l'état des suspects encore possibles ;
- l'état des suspects éliminés.

La grille doit profiter intelligemment de l'écran desktop, sans laisser de grandes zones vides inutiles. Sur mobile, utilise une disposition réellement adaptée à la taille disponible et au toucher.

Ne fais pas dépendre l'identification d'un personnage uniquement du survol : les noms et les détails utiles doivent rester accessibles.

### Panneau de jeu

Refais le panneau consacré au personnage secret, au joueur adverse et à l'état courant de la partie.

Il doit être visuellement intégré au jeu. Le joueur doit comprendre immédiatement :
- quel personnage il a choisi ;
- ce qui est masqué ;
- quel est l'état de la manche ;
- ce qu'il doit faire ensuite ;
- où voir les réponses et l'information nécessaire à la déduction.

Évalue l'utilité de la petite planche adverse actuellement affichée. Si elle répète des informations sans apporter de vraie aide, simplifie-la. Ne supprime cependant aucune information nécessaire au fonctionnement des règles.

### États et actions

Conçois et teste les états suivants, selon le code réel :
- joueur actif ;
- joueur qui attend une réponse ;
- sélection du secret ;
- choix du secret confirmé ;
- question envoyée ;
- réponse reçue ;
- suspect éliminé ;
- tentative de devinette ;
- victoire ;
- défaite ;
- reconnexion ou attente de l'adversaire.

Les actions principales doivent être claires et accessibles sans devoir découvrir des contrôles cachés au survol.

---

## LOT 5 — Donner une vraie personnalité aux 24 personnages

C'est un élément essentiel du jeu.

Le plateau actuel montre beaucoup de visages très similaires. La plupart se distinguent par quelques accessoires, coiffures ou couleurs, plutôt que par une vraie personnalité visuelle.

Je veux un casting cohérent de 24 personnages, avec des silhouettes et des visages suffisamment distincts pour que le jeu soit intéressant.

### Étudier les assets existants avant de régénérer quoi que ce soit

Vérifie en particulier si les ressources précédemment validées sont encore présentes :
- `games/qui-est-ce/prototype-3d/models/character-01-ict.glb` ;
- `games/qui-est-ce/prototype-3d/models/hair/hair-curly-v41-opt.glb` ;
- le prototype 3D et ses expressions ;
- les références utilisées pour ajuster le visage et la coiffure.

Ces fichiers peuvent avoir changé d'emplacement ou ne pas être présents dans la branche de travail : inspecte réellement le dépôt avant d'en dépendre.

Le visage issu d'ICT-FaceKit et la coiffure volumineuse V4.1 avaient été considérés comme une base prometteuse. Si ces assets sont toujours disponibles et de bonne qualité, réutilise-les comme point de départ, sans les écraser.

### Qualité du casting

Donne aux personnages de vraies différences visuelles :
- formes de visage ;
- mâchoires et pommettes ;
- coiffures et volumes de cheveux ;
- pilosité ;
- lunettes et accessoires ;
- vêtements et couleurs ;
- âge apparent ;
- diversité des apparences ;
- expressions et attitude.

Ne fabrique pas 24 personnages qui seraient presque tous le même visage avec une casquette ou des lunettes ajoutées.

Il faut néanmoins garder un casting visuellement cohérent, avec une qualité de lumière, de matériaux et de rendu comparable d'un personnage à l'autre.

Ne crée pas des variations complètement aléatoires. Chaque identité doit être délibérée et validée visuellement.

### Attributs et équilibre du jeu

Préserve l'équité du jeu :
- les attributs doivent rester équilibrés dans le catalogue ;
- aucun trait pertinent ne doit être présent chez un seul suspect si cela casse les mécaniques existantes ;
- respecte les contraintes du moteur et du catalogue de questions ;
- ne fonde pas de questions sur la couleur de peau ou l'origine ;
- conserve un casting diversifié.

Les nouvelles apparences ne doivent jamais changer les règles de déduction sans adaptation et tests correspondants.

### Un modèle 3D doit devenir une vraie chaîne de production

N'instancie pas 24 personnages 3D lourds simultanément pour embellir le plateau.

Évalue une architecture dans laquelle :
- les 24 portraits affichés sont des images de rendu issues d'assets maîtrisés ;
- le personnage survolé ou sélectionné peut bénéficier d'un rendu 3D vivant ;
- le personnage secret peut disposer de sa propre mise en scène ;
- un même moteur et un nombre contrôlé de scènes sont réutilisés ;
- les assets sont préchargés et optimisés avec soin ;
- les ressources GPU sont correctement libérées lorsqu'elles ne sont plus nécessaires.

Si les personnages ne disposent pas tous d'un modèle 3D de qualité, ne prétends pas que les portraits sont tous issus du même rig. Mets d'abord au point et valide une chaîne de production fiable, puis produis les variations.

Avant de générer 24 nouvelles versions, vérifie visuellement quelques personnages pilotes et confirme que le style, les expressions et la variété fonctionnent. Réutilise les assets validés au lieu de les remplacer sans raison.

---

## LOT 6 — Le mouvement : des personnages vivants, mais maîtrisés

Les personnages doivent paraître vivants, pas être des images statiques collées sur des cartes.

Explore les possibilités du prototype 3D existant :
- regard qui suit subtilement le curseur ;
- tête qui réagit avec un mouvement limité ;
- légère animation du buste ;
- respiration discrète ;
- clignements naturels ;
- expressions sélectionnées selon le contexte.

L'animation doit respecter l'identité du personnage et rester subtile. Pas d'oscillations permanentes, de mouvements exagérés ou de réactions comiques sans raison.

Pour la performance, utilise un moteur et un rendu partagés si possible. Quand une carte n'est pas active, un portrait pré-rendu peut suffire ; au survol ou à la sélection, le personnage concerné peut prendre vie.

Si tu choisis cette approche, la transition entre l'image et le rendu vivant doit être propre et ne pas provoquer de changement brutal d'éclairage, de cadrage ou de proportions.

Le curseur ne doit pas être indispensable sur mobile. Prévois une interaction équivalente au toucher, ainsi qu'un comportement au focus clavier.

Respecte `prefers-reduced-motion` : les animations facultatives doivent pouvoir être réduites ou supprimées.

---

## LOT 7 — Le game feel et l'envie de rejouer

Je veux que le jeu soit agréable à regarder, mais aussi agréable à jouer et à refaire.

La rejouabilité doit venir de la qualité de la partie, pas de mécanismes manipulateurs.

### Retours d'action

Travaille les moments où le jeu doit répondre au joueur :
- sélection d'un secret ;
- envoi et réception d'une question ;
- réponse oui/non ;
- élimination d'un suspect ;
- sélection d'un personnage ;
- tentative de devinette ;
- révélation du personnage caché ;
- victoire ou défaite ;
- revanche.

Chaque retour doit être compréhensible, satisfaisant et rapide.

Les effets visuels doivent renforcer l'action. Une élimination peut entraîner une animation brève et précise, un changement de lumière ou un état graphique clair. Une victoire peut avoir une mise en scène plus forte. Une action ordinaire ne doit pas déclencher une cinématique.

### Sons

Évalue si des effets sonores courts amélioreraient les actions :
- sélection ;
- élimination ;
- réponse ;
- confirmation ;
- révélation ;
- victoire.

Le son doit être discret, cohérent et désactivable. Il ne doit pas démarrer avec une musique intrusive, ni utiliser des sons sous licence sans autorisation.

### Boucle de jeu et onboarding

Le joueur doit comprendre quoi faire sans lire un long tutoriel.

S'il s'agit de sa première partie :
- les contrôles essentiels doivent être compréhensibles immédiatement ;
- le choix du personnage secret doit être clair ;
- la question, la réponse et l'élimination doivent être faciles à suivre ;
- les états de tour ne doivent pas prêter à confusion.

Facilite la revanche et le lancement d'une nouvelle partie si cette fonction est compatible avec les règles existantes.

Ne transforme pas le jeu en machine à notifications, en système de récompenses artificielles ou en interface remplie de compteurs. Je veux une expérience qu'on a naturellement envie de relancer parce que les parties sont bonnes.

---

## LOT 8 — La technique doit garantir la robustesse

Le jeu est un projet web qui doit fonctionner dans un navigateur ordinaire, sur desktop et mobile.

Avant de changer une bibliothèque, inspecte la stack et le code existants. Ne migre pas tout vers une nouvelle architecture uniquement pour obtenir une interface plus jolie.

### Pour la 3D

Utilise Three.js et les outils déjà présents si le prototype existant le justifie. Vérifie les versions, les imports, les matériaux, les animations et les ressources nécessaires.

Privilégie les solutions adaptées à un affichage web :
- textures optimisées ;
- modèles de taille raisonnable ;
- rendu partagé ;
- limitation des scènes simultanées ;
- nettoyage des ressources GPU ;
- réduction des calculs lorsque les animations ne sont pas nécessaires.

Ne dégrade pas le visage ou les cheveux validés uniquement pour réduire la taille des fichiers. Mesure les gains et vérifie les rendus avant/après.

### Multijoueur et sécurité

Conserve les API partagées et les contrats de données actuels. Ne contourne aucune permission Firebase.

Ne rends jamais les rôles secrets d'Undercover accessibles par erreur à des participants qui ne devraient pas les voir. Ne modifie pas les règles Firebase de phase 2.

Si tu modifies le rendu de textes provenant du joueur ou de Firebase, conserve les protections contre les injections HTML et vérifie qu'aucune donnée non fiable ne devient du HTML exécutable.

Ne modifie pas Banqueroll, l'index, l'administration ou le Worker IA dans le cadre de cette mission, sauf nécessité directement démontrée et préalablement signalée.

---

## LOT 9 — Découpage autonome du travail

Tu dois organiser et réaliser le travail par lots, avec une vérification après chaque lot. Ne me demande pas de choisir entre des concepts non terminés et ne t'arrête pas après l'audit.

Organise le travail à partir de ces objectifs :

### Lot A — Audit et recherche

Cartographie les mécaniques, les assets, les chemins réseau et les problèmes visuels.

### Lot B — Direction artistique

Compare trois directions visuelles rapidement dans le navigateur, choisis la meilleure et crée un système de design cohérent : palette, typographie, lumières, matériaux, composants, ombres et règles d'animation.

### Lot C — Interface principale

Refais l'écran de jeu, la grille des 24 personnages, les panels, les états de tour et les vues responsives.

### Lot D — Personnages et rendu 3D

Examine les assets approuvés, améliore le rendu et mets en place la solution de portraits et d'animation la plus convaincante et performante.

### Lot E — Game feel

Travaille les transitions, le feedback, les sons éventuels, la sélection, les réponses, les éliminations et la révélation.

### Lot F — Tests et finition

Relance les tests après les modifications, inspecte la page dans un vrai navigateur et corrige les défauts visuels ou fonctionnels.

Tu peux réorganiser ces lots si les dépendances techniques le nécessitent. À la fin de chaque lot, conserve un bilan très court des modifications et des tests. Ne laisse pas des prototypes alternatifs ou des assets non utilisés s'accumuler dans le code final.

---

## LOT 10 — Tests obligatoires

Teste la nouvelle version sur :
- desktop 1440 × 900 ;
- grand écran 1920 × 1080 ;
- mobile 390 × 844.

Vérifie :
- lisibilité de chaque personnage et de son nom ;
- clarté de tous les états du jeu ;
- navigation à la souris et au clavier ;
- interactions tactiles ;
- réduction des animations ;
- comportement des 24 personnages ;
- sélection et confirmation du personnage secret ;
- élimination des suspects ;
- tour et score ;
- réponses et devinettes ;
- fin de partie et revanche ;
- connexion multijoueur avec deux joueurs ;
- comportement des bots si disponibles ;
- absence de fuite d'informations secrètes ;
- conservation des règles ;
- absence d'erreurs JavaScript nouvelles ;
- absence de débordements horizontaux ;
- performances de chargement et d'animation.

Relance les tests réels qui existent déjà dans `games/qui-est-ce/tests/` et les contrôles communs du dépôt. Ne fabrique pas de résultats de tests. *(Voir préambule, point 9 : ce dossier n'existe pas ; utiliser les tests du prototype.)*

Ne teste pas en créant ou supprimant des parties réelles sur le site public. Utilise les émulateurs et les environnements locaux prévus.

---

## LOT 11 — Démonstration locale obligatoire

Le livrable n'est pas un rapport ou une maquette statique : je veux le jeu réellement jouable. *(Voir préambule, point 3 : adaptation au cloud — captures regardées par toi-même, jeu ouvert par l'utilisateur sur son PC.)*

1. Vérifie l'état Git et le worktree dans lequel tu travailles. Il peut y avoir plusieurs sessions Claude actives.
2. Préserve les modifications non commités des autres sessions.
3. Si un worktree isolé est nécessaire, base-le sur la version contenant les bons clients et les assets 3D approuvés. Ne perds pas les fichiers non suivis du prototype.
4. Implémente la refonte.
5. Lance le jeu sur localhost.
6. Ouvre le jeu dans Chrome.
7. Vérifie visuellement le résultat et les interactions.
8. Teste une partie locale avec deux joueurs distincts.
9. Enregistre des captures des écrans clés, desktop et mobile.
10. Laisse le jeu ouvert afin que je puisse l'examiner.

Si un outil de maquette ou de génération graphique est disponible, utilise-le pour produire de vrais assets, mais ne prétends pas avoir utilisé un outil qui n'est pas connecté. Utilise les modèles et références existants en priorité lorsqu'ils correspondent à la direction choisie.

Ne committe pas, ne pousse pas, ne déploie pas et ne supprime pas le worktree. *(Voir préambule, point 2 : push sur la branche `proto/qui-est-ce-3d` uniquement.)*

---

## Résultat final attendu

À la fin, je veux :
- un jeu à l'identité artistique forte et cohérente ;
- 24 personnages reconnaissables et variés ;
- des portraits et une 3D visuellement maîtrisés ;
- une interface lisible et élégante ;
- des interactions et des animations qui rendent les actions satisfaisantes ;
- un jeu multijoueur robuste et testé ;
- une bonne expérience mobile ;
- un chargement et des performances adaptés au navigateur ;
- une démonstration ouverte sur localhost.

Indique l'URL locale exacte, les fichiers modifiés, les tests exécutés, les résultats réellement observés et les limites restantes.

**Ne déclare pas le jeu terminé parce qu'il fonctionne. Il doit aussi atteindre une vraie qualité visuelle. Le but est d'avoir un Qui est-ce ? à la hauteur du reste de GameHub, avec sa propre DA et sa propre personnalité.**

---

# PRÉCISIONS DE L'UTILISATEUR (2026-10-15, après lecture du préambule) — ELLES PRIMENT

Le plan d'adaptation est accepté, avec ces précisions. En cas de contradiction avec le préambule
ci-dessus, **cette section gagne**.

## 1. Démarrage sûr
Vérifie le dépôt, la branche, le worktree et les modifications locales avant toute synchronisation ;
récupère `origin/proto/qui-est-ce-3d` sans écraser de travail ; lis tout `MISSION_3.md`. Cette mission
remplace la mission 2 ; le rejet de la direction artistique actuelle annule les choix visuels
antérieurs incompatibles. Travail **exclusivement** sur `proto/qui-est-ce-3d`.

## 2. Priorité immédiate
Commence par le bug de survol du portrait **et son test automatisé**. Le test compare des captures
dans des conditions reproductibles et détecte un vrai défaut visuel : il ne doit pas être conçu pour
passer artificiellement (prouve qu'il échoue sur le code fautif). Vérifie ensuite le correctif dans un
navigateur, sans régression. Puis audit → direction artistique → interface → personnages.

## 3. Sous-agents et reviewer indépendant
Utilise les sous-agents **réellement disponibles** pour séparer les compétences : direction
artistique, personnages / 3D, UI/UX et game design, animation / game feel, QA et revue visuelle.
Le **reviewer visuel** examine les captures réelles en résolution suffisante, **indépendamment du
rapport de l'implémenteur**, et peut **refuser** le résultat (visages, cheveux, matériaux,
éclairage, typographie, composition, animations médiocres). **Deux passes de revue indépendantes au
minimum** : (1) sur les personnages pilotes, **avant** d'étendre la production au casting ;
(2) sur le jeu intégré. Si des sous-agents indépendants ne sont pas disponibles, **dis-le** et
utilise ce qui l'est réellement ; ne prétends jamais avoir fait une revue indépendante si ce n'est
pas le cas. Les comptes rendus du reviewer vont dans `reports/premium/revue-*.md` avec les captures.

## 4. BUDGET : 50 $ AU TOTAL, RÉSERVE COMPRISE (corrige le tableau du préambule)

Le tableau du préambule (4 + 4 + 8 + 12 + 12 + 5 + 5 = 50 $, plus 8 $ de réserve) dépassait le
plafond. **Nouveau tableau, somme = 50 $ :**

| Poste | Budget |
| --- | --- |
| Bug du portrait + test d'image | 4 $ |
| Audit + note de DA | 3 $ |
| Direction artistique (3 pistes comparées, système de design) | 7 $ |
| Interface principale (écran de jeu, grille, panneaux, états, responsive) | 10 $ |
| Personnages : pilotes d'abord (3 à 4), puis casting | 11 $ |
| Game feel (retours, révélation, sons synthétisés) | 3 $ |
| Reviewer indépendant (2 passes) | 4 $ |
| Tests, captures desktop / mobile | 3 $ |
| Réserve (fin de mission, passation, imprévus) | 5 $ |
| **Total** | **50 $** |

Protège en priorité : direction artistique, interface, validation du modèle pilote, reviewer.
**Ne génère pas les 24 personnages avant d'avoir validé** (passe 1 du reviewer) **la qualité et la
reproductibilité de la méthode** sur quelques pilotes. Si le budget devient insuffisant : termine
proprement le bug, une direction artistique solide, l'interface principale et **un casting pilote
convaincant**, et **ne prétends pas que les 24 sont finalisés** s'ils ne le sont pas (dis
précisément ce qui reste). Demande le solde réel à l'utilisateur à la fin de chaque poste.

## 5. Synchronisation, sauvegardes, checkpoints
Tu peux commiter et pousser des checkpoints, **exclusivement sur `proto/qui-est-ce-3d`**. Avant
chaque push : vérifie le diff et le contenu indexé ; exclus secrets, fichiers temporaires et
captures inutiles ; relance les tests pertinents ; vérifie que le push est une **avance rapide** qui
n'écrase aucun travail distant (sinon fetch + rebase de tes commits locaux seulement, jamais de
`--force`). Décisions dans `DECISIONS.md`, questions **réellement bloquantes** seulement dans
`QUESTIONS.md`, captures des revues dans `reports/premium/`. Ne supprime pas d'assets validés sans
vérifier leurs dépendances. Ne touche ni à Firebase (hors `qec3` déjà fait), ni au Worker IA, ni aux
autres jeux, ni aux secrets.

## 6. Critère de fin
Pas seulement un jeu qui fonctionne ou un modèle 3D techniquement correct : **une amélioration
visuelle manifeste par rapport à la capture actuelle**, confirmée par le reviewer (défauts majeurs
corrigés) et vérifiable dans les captures et les tests. À la fin, donne : le **SHA** de la branche,
les fichiers modifiés, les résultats des tests, les captures desktop / mobile, le bilan du reviewer,
le budget consommé, et **précisément ce qui reste** si la mission s'arrête avant d'être achevée.
Tu peux commencer et décider sans me demander de valider chaque lot.
