# Méthode de travail économe du Qui est-ce ? (décision de l'utilisateur, 2026-10-16)

**Principe : une chaîne de production, pas une grande équipe.** Les jetons partent surtout dans les
conversations longues (chaque réponse relit tout), les images regardées (~1 900 jetons) et le tâtonnement
à l'aveugle. Un système multi-agents consomme beaucoup plus de jetons (Anthropic annonce environ 15 fois) et
convient mal à un travail très lié comme celui-ci (DA, scène 3D et interface se tiennent). On automatise donc
ce qui est répétitif et on garde la création dans **une seule session**.

## 1. Les commandes (zéro jeton ou presque)

| Besoin | Commande (depuis la racine du dépôt) | Sortie |
| --- | --- | --- |
| Tout vérifier | `node games/qui-est-ce/prototype-3d/tools/check-all.js` (`--fast` : sans navigateur) | ~8 lignes : OK / ECHEC par test |
| Juger l'esthétique | `node games/qui-est-ce/prototype-3d/tools/shoot.js` (`--mobile`) | 3 JPEG réduits (≤ 940 px) dans `build/shots/shoot/` |
| Comparer deux rendus | `tools/hair/diff_shots.py`, `tools/test-board-pixels.js` | chiffres (pixels changés, SSIM) |
| Mesurer | `tools/measure_pc.js`, `tools/hair/bench_hair.js` | chiffres |

Règle : **vérifier un comportement = un script ; regarder une image = seulement pour l'esthétique**, une
seule, réduite.

## 2. La session

- **Une session courte par objectif** (≤ ~2 h), qui démarre par `VISION_V4.md` et `HANDOFF.md`. Les
  décisions vont dans `DECISIONS.md`, pas dans la conversation.
- **Un seul modèle principal** pour créer et coder. Réserver Opus (raisonnement élevé) aux décisions de
  direction artistique et d'architecture ; le code courant peut se faire sur un modèle plus léger (`/model`).
- Lire des plages de lignes, filtrer les sorties (`| tail -20`), ne pas relire ce qu'un script a déjà dit.
- Corriger par petits objectifs, avec `check-all` après chaque lot.

## 3. Les seuls sous-agents utiles (3)

Un sous-agent n'est lancé que pour une tâche **isolée, bornée, qui lit beaucoup et rend peu** :

| Agent | Modèle | Pourquoi |
| --- | --- | --- |
| `reviewer-visuel` | Sonnet | revue **indépendante** de captures, sans le code ni les rapports ; peut refuser. À lancer avant d'accepter un résultat visible. |
| `reviewer-code` | Sonnet | relecture du diff avant commit (bugs, fuite du secret adverse, HTML injecté, secrets). |
| `chercheur-web` | Haiku | lit beaucoup de pages, ne renvoie que ~10 lignes avec les sources. |

Installation : `bash games/qui-est-ce/prototype-3d/team/install.sh` (copie dans `.claude/agents/`, non
versionné), puis relancer la session. **Agents neufs, jamais « forkés »** (un fork recopie tout le contexte).
Réponses de ≤ 150 mots. Jamais deux agents sur le même fichier. Pas de sous-agent pour une retouche courte.

Les autres rôles (développeurs, designers, testeurs) restent des **modes de la session principale**, pas des
agents : ils ont besoin du contexte complet, et le découper crée des erreurs et des malentendus.

## 4. Fusion dans `main` (plus tard)

Le jeu vit sur `proto/qui-est-ce-3d` et n'arrive dans `main` que **complet** et sur un « on fusionne » explicite
de l'utilisateur. Contrôle préalable : `check-all` vert, partie à deux navigateurs jouée sur l'émulateur,
mesures GPU réelles, revue visuelle finale validée, garde de maintenance présente, aucun secret. Fusion par
demande de fusion (`gh pr create`), jamais par `push` direct sur `main` ; déploiement des règles Firebase
depuis le PC de l'utilisateur.

## 5. Mesurer plutôt que supposer

Aucun chiffre d'économie n'est garanti. Pour trancher entre deux façons de travailler, essayer les deux sur une
tâche réelle et comparer la consommation affichée dans le compte.
