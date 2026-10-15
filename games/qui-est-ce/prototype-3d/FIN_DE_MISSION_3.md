# Fin de la mission 3 : refonte « premium » de Qui est-ce ?

Branche `proto/qui-est-ce-3d` uniquement ; rien sur `main`, aucun déploiement, aucun secret, aucune
règle Firebase touchée (hors `qec3`, déjà là). Jeu en production, Banqueroll, index, administration
et Worker IA intacts. Détail : `CLOUD_LOG.md` (section « Mission 3 »), `DECISIONS.md`,
`reports/premium/`.

**Où regarder le jeu** (après `git pull`, serveur `python -m http.server 4173` à la racine) :
http://localhost:4173/games/qui-est-ce/v3d/ — ou, sans le mode en ligne,
http://localhost:4173/games/qui-est-ce/prototype-3d/board.html

## Ce qui est fait

| Poste | Résultat | Preuve |
| --- | --- | --- |
| Bug du portrait géant | Cause trouvée (le portrait HD peint dans un coin du canevas partagé n'était jamais effacé entre les cartes), corrigé, puis rendu impossible par la nouvelle architecture | `tools/test-board-pixels.js` : échec sur le code fautif (54 651 pixels hors des cases), 0 après correction ; voir « Tests » |
| Audit | Parcours réels, problèmes (dont une injection HTML possible par le nom de l'adversaire, corrigée) | `CLOUD_LOG.md` |
| Direction artistique | 3 pistes comparées sur le vrai écran ; « studio de suspects » retenue (bleu encre, carnet crème, papiers de studio, Fraunces + Instrument Sans) | `DA_NOTE.md`, `reports/premium/da/` |
| Interface | Barre d'état, grille 6 × 4 (8 × 3 en grand écran), carnet (mon suspect, action, journal, adversaire), questions groupées avec compteurs, écartés nets, révélation, revanche, mobile avec action fixée en bas | `reports/premium/00-grille-des-24.jpg`, `reports/premium/ecrans/` |
| Portraits et 3D | Portraits pré-rendus (4 expressions) + UNE carte vivante en 3D au survol, focus ou toucher (même studio, transition sans saut), mémoire GPU bornée | `js/game/cast.js`, `live.js`, `tools/bake_portraits.js` |
| Casting | Chaîne de visages provisoires (identité ICT, teint, yeux, rasage, accessoires refaits par tête) ; 4 pilotes, revue indépendante ; 3 visages gardés (Kenji, Damien, Farid) ; vraies variantes rasée et chauve ; teintes blond et gris corrigées | `reports/premium/revue-1-pilotes.md`, `tools/casting/` |
| Game feel | Réactions des visages aux évènements (méfiance à la question, sourire au oui), trait d'élimination, pré-marquage des suspects qui ne collent pas, révélation animée ; sons synthétisés, coupés par défaut | `js/game/app.js`, `js/game/sfx.js` |
| Revues indépendantes | n° 1 (pilotes) et n° 2 (jeu intégré), par un sous-agent qui n'a vu que les captures | `reports/premium/revue-*.md` |

## Tests (cloud, rendu logiciel, dernière exécution)

| Test | Résultat |
| --- | --- |
| `tools/test-board-pixels.js` (image : seule la case concernée change ; vivant posé sur sa photo ; défilement, redimensionnement ; 1280 × 720, 1440 × 900, 1440 × 900 DPR 1,5, 1920 × 1080) | **60/60** (avant le correctif du bug : échec, 54 651 pixels hors des cases) |
| `tools/test-board.js` (partie complète contre le bot, révélation, statistiques, planche PNG, revanche, départ, survol vivant, console, 390 px) | **12/12** sur `board.html` et **12/12** sur `v3d/` |
| `tools/test-game-logic.mjs` | 5/5 |
| `node tools/check-links.js` | 13/13 |
| Captures desktop 1440 × 900, 1920 × 1080, mobile 390 × 844 | 0 erreur console, aucun débordement horizontal (`reports/premium/ecrans/`) |
| Règles Firebase `qec3` (émulateur) | inchangées depuis la mission 1 (342/342) ; partie à deux navigateurs : **à faire sur le PC** |

## Ce que je n'ai PAS réussi (franchement)

- **Les 24 personnages ne sont pas finalisés.** Seuls 4 ont leur propre visage : Raphaël (validé),
  Kenji, Damien, Farid (provisoires). Les 20 autres sont le visage de Raphaël « grimé » (coiffure
  teintée, accessoires, rasé ou chauve). **Les 12 femmes ont un visage masculin** et **aucun
  personnage n'a de cheveux longs ou mi-longs visibles** : la méthode sans photos ne sait faire ni
  l'un ni l'autre (revue n° 1 : Diane et Fatou refusées et retirées). Le jeu reste juste grâce à la
  ligne d'attributs sous chaque nom et à l'avertissement « Visages provisoires », mais ce n'est pas
  le jeu final.
- La revue n° 2 a **refusé** le jeu à cause de ce casting (B1). Les autres bloquants sont corrigés ;
  B1 ne l'est qu'en partie.
- Le jeu à deux navigateurs (Firebase) n'a pas pu être testé dans le cloud (SDK bloqué).
- Les temps et les images par seconde du cloud ne valent rien (rendu logiciel).

## À faire sur le PC (`PC_RUNBOOK.md`)

1. Regarder le jeu (URL ci-dessus) ; `node games/qui-est-ce/prototype-3d/tools/measure_pc.js`.
2. Partie en ligne à deux profils Chrome contre l'émulateur (§ 2 du runbook, `…/v3d/?emu`).
3. **Le vrai casting** : photos Gemini des personnages (§ 3), puis `build_character.py`, puis
   `node tools/bake_portraits.js <id>`. C'est la seule voie crédible pour les femmes et les cheveux
   longs.

## Décisions prises en autonomie (détail dans `DECISIONS.md`)

Correctif minimal puis nouvelle architecture ; portraits pré-rendus + une carte vivante ; fond
des portraits en CSS ; piste A ; planche adverse remplacée par une jauge ; ligne d'attributs ;
sons coupés par défaut ; pilotes refusés retirés ; casting limité à ce que la revue autorise.

## Les cinq points les plus douteux

1. **Livrer avec 20 visages provisoires** plutôt que de retirer le jeu 3D : il est jouable et
   honnête, mais pas beau sur ce point.
2. **La ligne d'attributs sous chaque nom** : indispensable avec ces visages, à retirer quand les
   vrais personnages existeront (elle rappelle un tableau de bord).
3. **Les teintes très fortes des cheveux clairs** (facteurs 8 à 9 sur une coiffure en niveaux de
   gris) : lisibles, mais un peu artificielles en grand.
4. **Les papiers de studio colorés au hasard** (la revue n° 2 note qu'ils ne codent rien, et que le
   corail rappelle l'accent « à toi ») : choix esthétique, discutable.
5. **Pas de vignette du secret dans la barre en mobile** : le secret est en bas de page.

## Questions

Voir `QUESTIONS.md` : une seule vraiment bloquante pour la suite, la production des photos des
personnages (à faire sur le PC, avec Gemini).
