# Mauvais Perdants : direction artistique « Canal 7 »

Recherche : [`RECHERCHE-DA.md`](RECHERCHE-DA.md). Captures : `captures/` (générées par les
tests navigateur, non commitées) et `captures/avant/` (version précédente).

## L'idée

Mauvais Perdants est l'émission phare de **Canal 7**, une chaîne de télévision fictive de la
fin des années 70. L'écran est ce que voit le téléspectateur : l'habillage de la chaîne. Un
univers à part entière, comme chez Rockstar : une époque, une chaîne, ses publicités, son ton
taquin. Pas de présentateur dessiné, pas de décor : **l'interface est le décor**.

Version retenue après plusieurs essais avec l'utilisateur (music-hall avec présentateur,
tableau d'affichage sombre, feuille de match, affiche) et un prototype animé validé.

## Règles

- **La couleur dit la phase** : orange hors antenne (accueil), crème en régie (salon), brun à
  l'antenne (manche), moutarde quand ta manche est finie (attente), sarcelle au verdict
  (résultats, classement), brun et soleil doré à la finale. Le fond glisse d'une couleur à
  l'autre (700 ms).
- **Signature** : la bande de quatre couleurs (moutarde, orange, rouge, sarcelle), le logo
  « 7 », les bandeaux « En direct », « Verdict », « Fin de l'émission ».
- **Pièces de jeu** : boutons, jetons, cartes ont un bord d'encre et une ombre dure (on a envie
  de les enfoncer ; ils s'enfoncent). Le reste est sans cadre.
- **Jetons de joueur** : un pion rond à la couleur du joueur, avec son initiale. Huit couleurs
  qui ne se confondent avec aucun fond de phase.
- **Typographie** : Anton pour ce qui s'affiche à l'antenne (titres, chiffres, boutons),
  Instrument Sans pour ce qui se lit ou se tape.
- **Ton taquin** : un autocollant au plus par écran (« Proie facile », « Lanterne rouge »,
  « Te dépasse », « Si près… »), des phrases courtes (« Prêt, personne ne te croit »), de
  fausses publicités pendant l'attente (Assurances Rebond, Pastilles Excuses…). La moquerie
  vise le jeu, jamais la personne.
- **Mouvement** : une seule courbe, celle des feuilles iOS (`cubic-bezier(.32,.72,0,1)`), un
  petit rebond pour les pièces ; apparitions décalées de 45 ms. Virgule d'antenne (la bande
  balaie l'écran, le « 7 » tourne) à l'entrée dans l'émission, au début d'une manche, au
  verdict et à la finale. Aucune animation ne pilote le jeu. Mouvement réduit respecté.
- **Son** : coupé pour l'instant (`ENABLED = false` dans `js/sfx.js`).

## Les écrans

| Écran | Ce qu'on voit |
|---|---|
| Accueil | Le titre, une carte : nom de candidat (le jeu commente le nom), « Créer un plateau », ou code + « Rejoindre », « Jouer en solo » |
| Salon | Le code en palettes, « Copier le lien d'invitation », les candidats sur leurs pupitres, « Lancer le tournoi », les règles repliées |
| Carte d'épreuve | La carte est distribuée (famille, règles, durée), qui est prêt, l'interrupteur « Fanfaronner », « Prêt », le départ automatique |
| Compte à rebours | 3, 2, 1 en grands chiffres |
| Manche | Le jeu au centre ; à droite, les rivaux en direct (jeton, valeur, rampe de lampes, « Te dépasse ») |
| Attente | Ton score, la course des autres (les jetons roulent vers l'arrivée), une fausse publicité |
| Verdict | Les places tombent du dernier au premier ; le vainqueur sur fond moutarde ; la lanterne rouge |
| Classement | Le parcours : les jetons avancent vers l'arrivée ; ▲/▼ ; « Remontada » ; qui est prêt pour la suite |
| Finale | 3e, 2e, temps d'arrêt, puis « X gagne », tampon « Sans appel », confettis, classement final, distinctions, Revanche |

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | structure (accueil, salon, émission, virgule d'antenne) |
| `css/show.css` | tout le style, jetons de couleur et de mouvement en tête |
| `js/main.js` | les vues (lecture seule de l'état) |
| `js/ui/fx.js` | virgule d'antenne, confettis |
| `js/ui/flaps.js` | palettes du code |
| `js/sfx.js` | son (désactivé) |
