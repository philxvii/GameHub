# Mauvais Perdants

Un tournoi de cinq mini-jeux entre amis, animé par Gonzague Stentor, un présentateur
arrogant et mauvais perdant… pour les autres. Pour 2 à 8 joueurs, chacun sur son
téléphone ou son ordinateur, avec un code de salon et sans compte.
Un écran de scène (télé, ordinateur) peut afficher l'émission sans jouer.

## Le tournoi

1. L'hôte crée un salon et choisit l'intensité du présentateur : *Pièces rapportées*
   ou *Sans pitié*. Il peut aussi autoriser les grossièretés. Les amis rejoignent avec
   le code.
2. **Cinq manches** sont tirées au sort, **une par famille** : vitesse, espace, mémoire,
   mots, chiffres. La même manche ne sort jamais deux fois. Le Petit Bac n'ouvre ni ne clôt
   le tournoi (la manche jugée ne vaut jamais double), et la graine du tirage est affichée.
3. Chaque manche suit le même rythme : annonce et règles (avec le bouton
   **Fanfaronner**), compte à rebours de 3 s, action (20 à 70 s, verrouillée dès que
   tout le monde a fini), résultats, classement.
4. **Barème** : la place dans la manche rapporte `10 − round(8·k/(N−1))` points, soit
   10 au premier et 2 au dernier. Les ex æquo partagent la moyenne de leurs places. Un
   joueur qui n'a rien joué (ou rien envoyé) marque 0. **La 5e manche vaut double.** La
   fanfaronnade rapporte +3 à qui gagne la manche et coûte −3, en entier, à qui finit dans
   la moitié basse (2e sur 2, 3e sur 3…) ou ne joue pas.
5. **Égalité finale** : on regarde d'abord le nombre de manches gagnées. Si l'égalité
   tient, un départage oppose les seuls ex æquo : Gong (3 signaux), ou Calcul express
   (20 s) si le Gong est retiré pour ce salon. Une égalité qui
   tient encore donne une victoire partagée.
6. Podium, titres calculés sur la partie (meilleur réflexe, remontée, grande gueule
   punie…), puis **Revanche** (même groupe, nouveau tirage) ou **Retour au salon**.

## Les 11 manches

| Famille | Manche | Ce qu'on fait | Résultat |
|---|---|---|---|
| Vitesse | **Le Gong** | toucher dès que le panneau passe au rouge, 5 fois | temps moyen, par tranches de 15 ms (retirée si tactile et souris sont mélangés) |
| Vitesse | **Le Stand de tir** | 20 cibles, aux mêmes positions pour tous | temps total, +0,3 s par tir raté |
| Vitesse | **La Dictée** | recopier la même phrase | temps (retirée si claviers tactiles et physiques sont mélangés) |
| Espace | **Le Chemin** | reproduire une séquence sur une grille 3×3 | niveau |
| Espace | **Les Numéros** | retenir des positions, les toucher dans l'ordre (3 vies) | nombre de numéros |
| Espace | **Le Damier** | retrouver les cases allumées (3 erreurs par niveau, 3 vies) | niveau |
| Mémoire | **Le Coffre** | retaper un nombre affiché un instant (2 vies) | nombre de chiffres |
| Mémoire | **Déjà vu ?** | « déjà vu » ou « nouveau » (3 erreurs) | bonnes réponses |
| Mots | **Le Petit Bac** | une lettre, quatre catégories, correction par IA | 10 si unique, 5 si partagée |
| Chiffres | **Calcul express** | opérations générées, juste +1, faux −1 | total net |
| Chiffres | **Le Nuage** | estimer un nuage de points vu 2,5 s (×3) | écart logarithmique |

Les huit premières viennent du cahier des tests cognitifs, adapté au jeu à plusieurs.
Le Petit Bac est la manche signature. Calcul express et Le Nuage ont été ajoutées
parce que leur bonne réponse est générée par le code : elle est toujours juste.

## Équité

- Tout le contenu d'une manche (séquences, nombres, mots, positions, lettre) découle de
  la **graine** du tournoi : tous les joueurs voient exactement la même chose.
- Manches de mémoire, de calcul, d'estimation et Petit Bac : le coordinateur **recalcule
  le score à partir des entrées brutes** (clics, réponses) en rejouant la graine.
- Manches de vitesse (Gong, Tir, Dictée) : le temps est **mesuré par l'appareil du
  joueur** (entre l'affichage et le geste, donc sans latence réseau), puis rehaussé à un
  minimum humain (Tir : 300 ms par cible ; Dictée : 300 mots/min ; Gong : un essai sous
  100 ms compte comme anticipé).
- La base **refuse** (règles Firebase, horloge du serveur) une réponse envoyée après
  l'échéance + 2,5 s, une deuxième réponse, la réponse d'un autre joueur, ou celle d'un
  joueur hors du tournoi. Les scores écrits sont bornés par le barème.
- Recharger la page en pleine manche ne permet pas de la rejouer : elle s'arrête à ce
  qui était joué (marqueur « commencée » à écriture unique, protégé par les règles). Un
  joueur inactif est compté absent, et la manche ne l'attend plus après 25 s sans progrès
  (sauf au Petit Bac, où l'on réfléchit).
- Petit Bac : les réponses ne partent qu'à l'échéance, ou quand tout le monde a fini.
  On ne peut donc pas lire celles des autres pendant qu'on écrit.
- **Limite assumée** : il n'y a pas de serveur arbitre (comme pour les autres jeux de
  GameHub). Les membres d'un salon lisent la graine. Quelqu'un qui sait programmer peut
  donc fabriquer des entrées parfaites ou des temps flatteurs (au-dessus des
  minimums). Ce jeu se joue entre amis ; voir `docs/CONCEPTION.md`.

## Petit Bac et IA

Le **code** vérifie la présence de la réponse, sa longueur et sa première lettre
(articles et accents ignorés). Il repère aussi les doublons (casse, accents, articles,
pluriel simple). Le **correcteur IA** reçoit, après verrouillage, chaque réponse
distincte avec un identifiant opaque et sa catégorie, sans aucun pseudo. Il renvoie
`valid`, `invalid` ou `ambiguous`, une raison courte et une confiance. Le format est
validé strictement, deux fois (dans le Worker, puis dans le jeu).

- Si le correcteur est sûr de lui (confiance ≥ 0,6), son verdict est appliqué.
- Sinon, la réponse est **soumise au vote** des autres joueurs (18 s). Elle n'est
  refusée qu'avec **au moins deux refus** et la majorité stricte des votants admis ;
  l'auteur ne vote pas. En duel (deux joueurs), l'autre joueur est le seul juge : un refus
  suffit, sans quoi n'importe quelle suite de lettres passerait.
- Une réponse qui ressemble à une consigne adressée au correcteur (« valid », « ignore les
  règles »…) n'est jamais envoyée à l'IA : elle passe directement au vote.
- Si le correcteur est lent (plus de 12 s), en panne ou renvoie un format invalide, on
  passe au **mode jury** : toutes les réponses passent au vote, et l'écran l'annonce.
- **Le code applique le barème.** L'IA n'attribue aucun point.

## Présentateur

Le présentateur suit le même principe que Banqueroll : une **réplique locale**
s'affiche tout de suite, puis l'IA peut la remplacer sur place si elle répond à temps.
Rien n'attend l'IA. Les répliques locales (près de 140 sur 39 situations, dans `js/lines.js`) sont tirées
selon des évènements **mesurés** (`js/presenter.js`) et ne se répètent pas : fanfaron
puni, exploit, écart minuscule, égalité, dernier, vainqueur, changement de leader,
remontée, chute, réponse refusée au Petit Bac, etc. Le présentateur vise le jeu, jamais
la personne ; un garde-fou côté Worker écarte les répliques qui sortent du cadre.

## Architecture

```
index.html, css/show.css     page et direction artistique
js/main.js                   interface : écrans, vues de chaque étape, élection du coordinateur
js/net.js                    salon Firebase (sa/<code>), présence, écritures du joueur
js/coord.js                  coordinateur : boucle, transitions (transactions), Petit Bac, répliques
js/machine.js                machine à états (pure)
js/draw.js, js/scoring.js    tirage et barème (purs)
js/results.js                calcul des résultats et du bilan (pur)
js/petitbac.js               correction du Petit Bac (pure)
js/presenter.js, js/lines.js évènements et répliques du présentateur (purs)
js/ai.js                     appels au Worker (revalidés)
js/rounds/*.js               une manche = paramètres + score (purs) ; contrat : rounds/contract.js
js/play/*.js                 interface de chaque manche
js/ui/*.js                   DOM sûr (textContent), scène, palettes
ai/                          Worker Cloudflare (présentateur + correcteur), NON déployé
tests/                       tests Node, IA simulée, tests multi-navigateurs, affiche
```

**Ajouter une manche** : un fichier `js/rounds/<id>.js` qui respecte le contrat de
`rounds/contract.js`, son interface dans `js/play/<id>.js`, une ligne dans
`rounds/index.js` et une dans `play/index.js`. Ajouter ensuite ses tests.

**Coordination** : l'onglet de l'hôte fait avancer le tournoi. Si sa présence ne bat
plus depuis 15 s, le premier membre en ligne prend la relève (les règles de la base l'y
autorisent) et peut lancer la partie suivante. L'hôte revenu reprend la main. La relève reprend l'état publié. Chaque transition est une transaction
qui vérifie l'étape et son numéro : un message rejoué ne fait pas avancer le tournoi
deux fois. Les totaux sont recalculés à partir des résultats de chaque manche.

## Lancer en local

```bash
# 1. émulateurs Firebase (Java 21+ requis par firebase-tools)
cd firebase && npx firebase emulators:start --only database,auth --project demo-gamehub
# 2. site servi contre les émulateurs
node firebase/tests/serve-emulated.js 4174
# 3. (facultatif) IA simulée
node games/mauvais-perdants/tests/ai-mock.mjs 8787
# puis http://localhost:4174/games/mauvais-perdants/?emu&ai=http://localhost:8787
```

Sans `&ai=…`, le jeu tourne avec ses répliques locales et le Petit Bac en mode jury.
C'est aussi le comportement en production tant que le Worker n'est pas déployé.

## Tests

```bash
node --test games/mauvais-perdants/tests/*.test.mjs      # manches, barème, tirage, machine, Petit Bac, IA
node games/mauvais-perdants/tests/sim.mjs                # simulation du barème (×1 / ×2)
cd firebase && npx firebase emulators:exec --only database --project demo-gamehub "node --test --test-concurrency=1"
node games/mauvais-perdants/tests/multi.cjs              # 4 Chrome réels, 3 tournois (prérequis ci-dessus)
```

## Mise en production (non faite)

1. Publier les règles `firebase/database.rules.phase2.json`, qui contiennent le nœud `mp`.
   Sans elles, la base refuse tout accès au salon.
2. Déployer le Worker (`ai/README.md`), puis renseigner son URL dans `AI_ENDPOINT`
   (`js/ai.js`).
