# L'équipe d'agents du Qui est-ce ? (décision de l'utilisateur, 2026-10-16)

Pour ce jeu, **le travail est délégué à des sous-agents** afin de consommer moins de jetons et de
séparer les compétences. La session principale est l'**orchestrateur** : elle réfléchit, décide, délègue
et contrôle ; elle ne fait presque pas le travail elle-même.

## Mise en route (une fois par machine ou par session cloud)

1. Copier les définitions dans le dossier que Claude Code lit :
   `bash games/qui-est-ce/prototype-3d/team/install.sh` (crée `.claude/agents/` à la racine du dépôt ;
   `.claude/` n'est pas versionné, d'où cette copie). **Relancer la session** pour les charger.
2. Choisir le modèle de l'orchestrateur : `/model` → **Opus**, avec le niveau de raisonnement le plus
   élevé proposé (le réglage d'effort se trouve dans `/model` ou `/config` selon la version).
3. Travailler sur la branche **`proto/qui-est-ce-3d`** (worktree `C:\Java\GameHub-proto`). Jamais sur `main`.

## Les rôles

| Agent | Modèle | Rôle | Écrit du code ? |
| --- | --- | --- | --- |
| **orchestrateur** (session principale) | Opus, effort max | plan, décisions, arbitrage, brief des agents, intégration, dialogue avec l'utilisateur | peu |
| `direction-artistique` | Sonnet | identité visuelle, palette, polices, matières, lumière, maquettes comparées, critique de cohérence | oui (CSS, tokens, maquettes) |
| `dev-scene-3d` | Sonnet | scène du plateau (Three.js), caméra d'intro, volets, animations, rendu, performance | oui |
| `dev-ui-jeu` | Haiku | interface, états de jeu, accessibilité, responsive, intégration à la mécanique | oui |
| `tech-artist-personnages` | Sonnet | personnages ICT, coiffures, accessoires, optimisation, pipeline photo, bancs | oui |
| `game-designer` | Haiku | mécaniques, boucle de rejouabilité, game feel, recherche d'études, `RESEARCH.md` | docs, peu de code |
| `chercheur-web` | Haiku | recherche web ciblée (docs, forums, GitHub), notes compactes | non |
| `qa-tests` | Haiku | lance les tests, mesure, rapporte en quelques lignes, **ne modifie rien** | non |
| `perf-mesures` | Haiku | bancs et mesures (poids, triangles, draw calls, FPS), rapporte les chiffres | non |
| `reviewer-visuel` | Sonnet | revue **indépendante** des captures ; peut refuser ; ne lit pas le code | non |
| `reviewer-code` | Sonnet | revue du diff : bugs, régressions, sécurité (secrets, injection HTML, fuite du secret adverse) | non |

Le code du modèle (`opus`, `sonnet`, `haiku`) est dans l'en-tête de chaque fichier ; on peut le
changer sans toucher au reste.

## Choix des modèles (décision de l'utilisateur : orchestrateur Opus, le reste le plus petit possible)

- **Opus** : l'orchestrateur seulement (plan, décisions, arbitrages, brief). Un sous-agent n'est lancé
  sur Opus que **par exception**, pour une tâche critique où l'échec coûterait plus cher que le surcoût
  (par exemple une décision d'architecture 3D difficile, ou le dernier verdict avant fusion).
- **Sonnet** : là où le jugement compte : direction artistique, scène 3D, personnages, et les deux
  reviewers (la revue visuelle lit des images).
- **Haiku** : tout le reste : recherche, tests, mesures, interface courante, spécifications de jeu.
- **Escalade** : Haiku échoue deux fois sur une tâche → on la relance sur Sonnet ; Sonnet échoue deux
  fois sur une tâche critique → une fois sur Opus, avec un brief enrichi. Le modèle se change pour un
  appel via le paramètre `model` de l'outil Agent, sans modifier le fichier.
- **Ne pas définir** la variable d'environnement `CLAUDE_CODE_SUBAGENT_MODEL` : d'après les guides, elle
  écraserait le modèle de tous les agents et annulerait ce découpage.

## Ce que dit la recherche (2026-10-16, sources tierces à vérifier)

- Le schéma « chef Opus, ouvriers moins chers » est le schéma standard. Anthropic l'a utilisé pour son système
  de recherche multi-agents (chef Opus, sous-agents Sonnet), mais note que ces systèmes consomment
  **environ 15 fois plus de jetons qu'une conversation simple** et conviennent mal aux tâches de code très
  interdépendantes : on délègue donc des tâches **indépendantes et bien bornées**, jamais un enchevêtrement.
- Les sous-agents au contexte isolé coûtent moins cher que de tout faire dans la conversation principale ;
  les « forks » coûtent très cher (ils recopient le contexte).
- Collections connues d'agents prêts à l'emploi : `VoltAgent/awesome-claude-code-subagents` (plus de 100
  agents, script d'installation) et `wshobson/agents` (via la place de marché de plugins de Claude Code).
  **Ce sont des invites ayant accès à des outils** : ne rien installer sans avoir lu le fichier (risque de
  chaîne d'approvisionnement). Notre équipe est sur mesure ; on peut s'en inspirer, pas l'importer à l'aveugle.

## Boucle de travail

1. **Brief** (orchestrateur) : objectif unique, fichiers concernés, critère de réussite chiffré, limite
   de longueur de la réponse. Un brief clair évite les allers-retours.
2. **Fabrication** : l'agent développeur fait la tâche, commite sur la branche, répond en ≤ 150 mots.
3. **Contrôle** : `qa-tests` (tests) puis `reviewer-code` (diff) ; pour tout ce qui est visible,
   `reviewer-visuel` (captures seulement, sans le rapport de l'implémenteur).
4. **Décision** (orchestrateur) : accepter, renvoyer avec les défauts précis, ou écarter. Les décisions
   vont dans `DECISIONS.md`.
5. **Goût** : seules les décisions de style (direction artistique, ambiance) remontent à l'utilisateur,
   avec une maquette ou une capture réduite à regarder.

## Règles d'économie (obligatoires)

- **Réponses courtes** : un sous-agent rend ≤ 150 mots (verdict, fichiers touchés, preuves chiffrées,
  prochaine action). Pas de rapport narratif ; les détails vont dans un fichier.
- L'orchestrateur **ne relit pas** ce qu'un agent a déjà résumé, sauf doute.
- **Agents neufs, jamais « forkés »** : un fork recopie tout le contexte et coûte très cher.
- **Parallèle seulement si les fichiers sont disjoints** (deux agents ne modifient jamais le même
  fichier en même temps).
- Les tâches mécaniques (tests, mesures, recherches) vont aux agents Haiku ; la conception et la
  revue visuelle aux agents Sonnet ; Opus reste à l'orchestration et aux arbitrages difficiles.
- Pas de sous-agent pour une retouche d'une ligne : la faire directement.
- Images : réduites (≤ 1000 px), une à la fois (voir `BROWSER_TESTING.md`).

## Fusion dans `main` (plus tard)

Le jeu vit sur `proto/qui-est-ce-3d` et **n'arrive dans `main` que quand il est complet** et que
l'utilisateur dit explicitement « on fusionne ». Liste de contrôle préalable : tous les tests verts
(`test-board`, `test-board-pixels`, `test-game-logic`, `check-links`, règles `qec3`), partie à deux
navigateurs jouée sur l'émulateur, mesures GPU réelles, revue visuelle finale validée, garde de
maintenance présente, `check-links` à jour, aucun secret. La fusion se fait par une demande de fusion
(`gh pr create`), jamais par un `push` direct sur `main` ; le déploiement des règles Firebase se fait
depuis le PC de l'utilisateur, jamais depuis le cloud.

## Coût : ce qu'il faut savoir

Les sous-agents **réduisent** le coût de la conversation principale (elle ne lit plus le code et les
captures, seulement des résumés) et permettent d'utiliser des modèles moins chers pour les tâches
simples. Ils **ajoutent** le coût de chaque appel et de leurs propres lectures. Le gain est réel pour
un grand chantier ; il est nul, voire négatif, pour une petite retouche.
