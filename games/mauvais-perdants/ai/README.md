# ai — Worker du présentateur et du correcteur de Mauvais Perdants

Un Cloudflare Worker gratuit placé entre le jeu et les fournisseurs d'IA, sur le même
modèle que celui de Banqueroll (`games/banqueroll/ai-host/`) : il garde les clés, fixe
les consignes, essaie **Gemini, puis OpenRouter, puis Workers AI**, et ne renvoie que des
données validées. **Non déployé.**

| Route | Entrée | Sortie |
|---|---|---|
| `POST /host` | `{ roast, crude, event, facts, players, localLine }` | `{ text, provider, model }` |
| `POST /judge` | `{ letter, items:[{ id:"g0", category, answer }] }` (64 au plus) | `{ results:[{ submissionId, verdict, categoryFit, shortReason, confidence, normalizedAnswer }], provider }` |
| `GET /health` | — | fournisseurs configurés |

## Ce qui est repris de Banqueroll, et ce qui change

| | Banqueroll (`ai-host`) | Mauvais Perdants (`ai`) |
|---|---|---|
| Ordre des fournisseurs | Gemini → OpenRouter → Workers AI | le même |
| Clés | secrets du Worker | les mêmes noms de secrets |
| CORS et limiteur | origines autorisées, limiteur en mémoire | le même principe |
| Budget | 20 s (une réplique remplace la locale à tout moment) | **8 s** pour une réplique, **9,5 s** pour la correction : le tournoi n'attend pas |
| Sortie | une réplique en texte | une réplique en texte **ou** du JSON au schéma strict (`responseMimeType` + `responseSchema` chez Gemini, `json_object` chez OpenRouter) |
| Persona | `persona.js`, privé, hors dépôt | `prompts.js`, versionné, sans actualité ni contenu sensible |
| Garde-fous | sortie de rôle, détresse | sortie de rôle, et rejet d'une réplique qui vise une caractéristique personnelle |

Le code de Banqueroll n'est **pas modifié** et n'est pas importé : ses adaptateurs
dépendent de `persona.js`, absent d'un dépôt fraîchement cloné, et ne gèrent pas le mode
JSON. Le principe est repris dans des fichiers propres au jeu.

## Contrôles du correcteur

- L'entrée est bornée : 64 éléments au plus, des identifiants `g<n>` uniques, 32
  caractères par réponse, et aucun pseudo.
- Les réponses sont des **données** placées dans le message utilisateur ; les consignes
  sont dans le message système.
- La sortie est refusée en bloc (on passe au fournisseur suivant) si le JSON est
  invalide, si un identifiant est inconnu ou dupliqué, si le verdict sort de
  `valid|invalid|ambiguous`, si la confiance sort de [0, 1], ou si un élément manque.
- Le jeu revalide la sortie (`js/petitbac.js`, `parseJudge`) et applique **lui-même**
  le barème.

## Tester sans clé

```bash
node --test games/mauvais-perdants/tests/ai.test.mjs
node games/mauvais-perdants/tests/ai-mock.mjs 8787    # le vrai Worker dans Node, fournisseurs simulés
```

## Déployer (à faire par toi, pas pendant cette mission)

```bash
cd games/mauvais-perdants/ai
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

Si wrangler est bloqué sur le poste : `node games/mauvais-perdants/ai/build-bundle.mjs`, puis
colle `ai/dist/worker.bundle.js` dans l'éditeur du tableau de bord Cloudflare. Ajoute
ensuite le binding Workers AI (`AI`), les variables de `wrangler.toml` et les deux
secrets. Renseigne enfin l'URL du Worker dans `AI_ENDPOINT` (`js/ai.js`).

## Confidentialité

Seules partent vers le correcteur les réponses du Petit Bac, sans pseudo. Le
présentateur reçoit les pseudos, les points et les faits de la manche. Les offres
gratuites peuvent conserver les requêtes. Les journaux du Worker ne contiennent que le
fournisseur et la raison d'un échec.
