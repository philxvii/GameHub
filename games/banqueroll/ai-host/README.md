# ai-host — proxy du présentateur IA de Banqueroll

Un Cloudflare Worker entre le jeu et les fournisseurs d'IA. Il garde les clés, fixe
le prompt du présentateur, essaie **Gemini, puis OpenRouter, puis Workers AI** (binding Cloudflare, sans clé) et renvoie une réplique
normalisée `{ text, provider, model }`. **100 % gratuit.**

```
games/banqueroll/ ──(contexte de jeu)──▶ /host ──▶ Gemini (offre gratuite AI Studio)
       ▲                                              │ échec
       │                                              ▼
       │                                         OpenRouter (modèles :free)
       │                                              │ échec
       └──── { text, provider } ◀─────────────────────┘ → le jeu garde sa réplique LOCALE
```

- **Aucun secret dans le frontend.** Les clés sont des secrets du Worker.
- Le jeu n'envoie que des données (état, chat récent, mémoire). Le prompt vit ici.
- Le Worker renvoie du texte, rien d'autre : l'IA ne peut pas toucher au jeu.
- Chaque réplique affiche sa source dans le jeu : `LOCAL`, `GEMINI` ou `OPENROUTER`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/worker.js` | routes `/host` et `/health`, CORS, limiteur, journal minimal |
| `src/orchestrator.js` | ordre fixe Gemini → OpenRouter → Workers AI, budget de 20 s : 7 s par fournisseur, le dernier prend le reste |
| `src/providers.js` | un adaptateur par fournisseur (format de requête et de réponse) |
| `src/prompt.js` | prompt du présentateur, bornage du contexte, nettoyage et validation des répliques |

## Bascule

1. Gemini d'abord. S'il n'a pas de clé, échoue, dépasse 9 s, renvoie 429 (quota) ou
   une réponse qui n'est pas une vraie réplique (moins de 25 caractères, étiquette de
   classifieur…), on passe à OpenRouter.
2. OpenRouter, avec les mêmes critères.
3. Si les deux échouent, le Worker répond 502 et le jeu garde sa **réplique locale**,
   déjà affichée de toute façon (rien n'attend l'IA).

Modèles (dans `wrangler.toml`) : `GEMINI_MODEL` liste un ou plusieurs modèles essayés à la
suite (`gemini-3.5-flash-lite`, ~1 s, puis `gemini-3.1-flash-lite` s'il cale plus de 5 s ;
réflexion au niveau « low ») et
`OPENROUTER_MODEL` (Gemma 31B, dots, Nemotron Lightning : 3 modèles `:free`, bascule automatique).
Le routeur `openrouter/free` est volontairement écarté : il tirait aussi des
classifieurs de sécurité et des modèles de code.

## Clés

Les clés des fournisseurs sont des secrets du Worker (`wrangler secret`), jamais
dans le dépôt ni dans le navigateur.

## Confidentialité

Le contexte envoyé contient les prénoms et les messages du chat de la partie. Les
offres gratuites peuvent conserver les requêtes, voire s'en servir pour améliorer
leurs modèles. Les journaux du Worker ne contiennent que le fournisseur et la raison
d'un échec, jamais de clé ni de contenu.

## Tester sans clé

```bash
node games/banqueroll/tests/ai-mock.js  # exécute ce Worker dans Node, Gemini et OpenRouter simulés
```

Puis ouvre `http://localhost:4173/games/banqueroll/?ai=http://localhost:8787/host`.
`?ai=off` coupe l'IA. Ces surcharges ne sont acceptées que sur localhost.
`games/banqueroll/tests/test-browser.js` s'en sert pour tester chaque bascule et le repli local.
