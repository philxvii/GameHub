# Mauvais Perdants : conception

Les recherches et les décisions de game design sont dans
[`docs/party-game-research.md`](../../../docs/party-game-research.md). Ce document
décrit le produit, sa direction artistique et son architecture.

## Concept

Une émission de variétés du samedi soir, un peu méchante. Le plateau a des rideaux
lie-de-vin, des ampoules de fronton, un tableau d'affichage à palettes et un animateur
en nœud papillon qui se croit la vedette. Le titre dit la promesse : à la fin, il y a
toujours des **mauvais perdants**. On rit de la chute du favori, et on réclame aussitôt une
revanche.

**Gonzague Stentor** est un nom inventé, d'après Stentor, le héros grec à la voix
tonnante. Il vouvoie le public et tutoie les candidats. Il est jaloux des vainqueurs,
savoure les échecs, ressort les fanfaronnades et défend parfois un joueur. Il ne vise
que le jeu : lenteur, erreurs, réponses absurdes, chutes au classement, promesses non
tenues.

## Direction artistique

- **Palette** : encre chaude `#141110`, crème d'affiche `#f3ebdc`, laiton `#d6a84a`,
  et un seul rouge « antenne » `#ff4a2e`, réservé aux signaux (Gong, cibles, mauvaise
  réponse, ×2). Huit couleurs de joueur bien distinctes. Ni dégradé violet, ni néon.
- **Typographie** : Anton (fronton de théâtre, titres et chiffres) et Instrument Sans
  (la police du hub, pour l'interface).
- **Signature** : le **tableau à palettes**. Code du salon et totaux défilent lettre par
  lettre avec un claquement synthétisé. Il ne s'anime que quand le classement bouge.
- **Le présentateur** : une affiche en deux tons, en SVG. Ses humeurs (narquois,
  ravi, choqué, jaloux) passent par des classes CSS sur les sourcils, le regard et la
  bouche, et sa bouche bouge pendant qu'il parle. Son bandeau fait office de
  télé-prompteur.
- **Mouvement rare** : compte à rebours qui cogne, lignes de résultats révélées du
  dernier au premier, lignes du classement qui glissent vers leur nouvelle place,
  podium qui monte, confettis. Tout est coupé avec `prefers-reduced-motion`.
- **Son** : synthèse Web Audio, sans fichier, avec un bouton de coupure mémorisé. Il
  n'est jamais utilisé comme signal de jeu.
- **Écrans** : sur un écran large, la scène est à gauche et l'action à droite. Sur un
  téléphone, le présentateur se réduit à un bandeau et disparaît pendant l'action.

## Audit de Banqueroll et ce qui en est repris

| Banqueroll | Constat | Mauvais Perdants |
|---|---|---|
| `js/presenter.js` : l'onglet de l'hôte seul écrit les répliques, une réplique locale tout de suite, puis l'IA la remplace sur place | robuste, rien n'attend l'IA | même principe (`coord.js` : `say` puis `enrich`) |
| `js/lines.js` : fonctions `ctx => texte \| null`, mémoire des répliques utilisées | facile à enrichir et à tester | même forme, plus des drapeaux d'intensité (`h`, `s`, `x`) |
| `ai-host/` : Worker, Gemini → OpenRouter → Workers AI, budget de 20 s, journal minimal | bon socle | Worker distinct (`ai/`) sur le même patron. Budgets courts (8 et 9,5 s) et **mode JSON** strict pour le correcteur |
| `ai-host/src/prompt.js` importe `persona.js`, privé et non versionné | réutiliser ses fichiers casserait un clone neuf | consignes versionnées dans `ai/src/prompts.js`. **Aucun fichier de Banqueroll modifié** |
| `?ai=off` / `?ai=<url>` acceptés seulement sur localhost | utile pour les tests | repris (`js/ai.js`) |
| Tests : `ai-mock.js` exécute le vrai Worker avec des fournisseurs simulés | très bon pour tester les bascules | repris : `tests/ai-mock.mjs`, réglable à chaud (`/mode`) |

Le présentateur de Banqueroll commente un plateau financier et répond au chat. Celui
de Mauvais Perdants commente des **résultats de manche mesurés** et n'a pas de chat : on
évite ainsi le texte libre envoyé à l'IA.

## Modèle de données (`mp/<code>`)

| Nœud | Écrit par | Contenu |
|---|---|---|
| `hostUid`, `members/<uid>` | création, puis chaque membre pour lui-même en `lobby` | identité de l'hôte, membres |
| `phase` | hôte ou coordinateur | `lobby` / `playing` / `ended` |
| `coord` | un membre, pour lui-même, si le coordinateur ne bat plus depuis 15 s (ou l'hôte) | uid du coordinateur |
| `cfg` | hôte | `roast` (`soft` / `hard`), `crude` |
| `players/<uid>` | soi | pseudo (16 car., sans `<`), couleur, type d'appareil |
| `presence/<uid>` | soi, horodatage du serveur imposé | battement toutes les 4 s |
| `ready/<uid>`, `prog/<uid>` | soi | « prêt » / « j'ai voté », progression en direct |
| `match` | coordinateur | tournoi : `tid`, `rk`, `i`, `step`, `at`, `end`, `seq`, `seed`, `plan`, `roster`, `res`, `det`, `tb` |
| `subs/<tid>/<rk>/<uid>` | soi, **une fois**, pendant `play`, avant `end` + 2,5 s (`now`) | entrées brutes de la manche (JSON ≤ 4 000 car.) |
| `boast/…/<uid>` | soi, une fois, pendant `intro` | fanfaronnade |
| `start/…/<uid>` | soi, une fois, pendant `play` (`now`) | manche commencée (un rechargement l'arrête) |
| `votes/…/<uid>/<gid>` | soi, pendant `vote` | refus d'une réponse du Petit Bac |
| `mc/<id>` | coordinateur | répliques (texte ≤ 300 car., sans `<`, source) |

## Machine à états

```
intro (12 s ou tous prêts) → count (3 s) → play (durée de la manche, ou tous finis)
  → [Petit Bac : judge (≤ 12 s) → vote (18 s, si nécessaire)]
  → reveal (5,5 s + 0,55 s par joueur) → board (8 s, ou tous ont touché « Suite »)
  → manche suivante | départage (Gong, ou Calcul express en salon mixte) | final
```

`machine.decide()` est pure et testée. Le coordinateur applique chaque transition par
transaction en vérifiant `(tid, rk, step, seq)`. Le bouton « Passer » de l'hôte
raccourcit `intro`, `vote`, `reveal` et `board`, jamais `play`.

## Limites connues

- **Pas de serveur arbitre** (comme les autres jeux de GameHub). Le contenu d'une manche
  se calcule côté client à partir de la graine. Un tricheur qui sait programmer peut
  donc fabriquer des entrées parfaites pour une manche de mémoire, ou déclarer des
  temps irréalistes (au Tir et à la Dictée, ils sont rehaussés à un minimum humain). Les règles de la
  base empêchent les réponses tardives, les doubles réponses et l'usurpation ; elles
  ne peuvent pas vérifier qu'un humain a joué.
- Les temps de réaction dépendent du matériel. Des tranches d'égalité (15 ms, 30 ms si
  tactile et souris sont mélangés) et l'exclusion de la Dictée en salon mixte limitent
  l'effet sans le supprimer.
- Le Worker IA n'est **pas déployé**. Tant qu'il ne l'est pas, le Petit Bac se joue en
  mode jury et le présentateur n'utilise que ses répliques locales.
- Production : les règles `mp` restent à publier (`firebase/database.rules.phase2.json`).
