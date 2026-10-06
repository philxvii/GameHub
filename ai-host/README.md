# ai-host — proxy du présentateur IA de Banqueroll

Un Cloudflare Worker de 150 lignes entre le jeu et OpenRouter. Il garde la clé,
fixe le prompt du présentateur et renvoie une réplique. **100 % gratuit** :
offre gratuite de Cloudflare Workers et modèle gratuit d'OpenRouter.

```
banqueroll.html ──(contexte de jeu)──▶ Worker ──(clé secrète)──▶ OpenRouter (modèle :free)
       ▲                                  │
       └────────────── { text } ──────────┘   puis l'hôte l'écrit dans Firebase (chat)
```

- **Aucun secret dans le frontend.** La clé est un secret du Worker.
- Le jeu n'envoie que des données (état, chat récent, mémoire). Le prompt vit ici.
- Le Worker renvoie du texte, rien d'autre : l'IA ne peut pas toucher au jeu.
- En cas d'erreur, de lenteur (plus de 9 s) ou d'absence de configuration, le jeu
  garde sa réplique locale. Rien ne bloque.

## Déployer (une fois, environ 5 minutes)

1. Crée une clé sur <https://openrouter.ai/keys>. Aucun moyen de paiement n'est nécessaire.
2. Depuis ce dossier :

   ```bash
   npx wrangler login
   npx wrangler secret put OPENROUTER_API_KEY     # colle la clé quand c'est demandé
   npx wrangler deploy
   ```

   Wrangler affiche l'URL, du type `https://banqueroll-host.<compte>.workers.dev`.
3. Vérifie : `curl https://banqueroll-host.<compte>.workers.dev/health`
   doit répondre `{"ok":true,"configured":true,...}`.
4. Dans `banqueroll/js/presenter.js`, renseigne
   `export const AI_ENDPOINT = 'https://banqueroll-host.<compte>.workers.dev/host';`,
   puis pousse sur `main`. Cette URL n'est pas un secret.

## Quotas (offre gratuite OpenRouter, octobre 2026)

- 20 requêtes par minute ;
- 50 requêtes par jour sans crédit acheté, 1 000 par jour après un achat unique de 10 $ (facultatif).

Le jeu économise ce budget de lui-même :

- l'IA n'est appelée que pour les gros évènements (intensité ≥ 3) et quand on interpelle le présentateur (`@host`) ;
- au plus un appel toutes les 12 s pour les évènements, toutes les 6 s pour le chat ;
- 40 appels au maximum par partie ;
- après trois échecs de suite, une pause de 2 minutes.

Tout le reste passe par les répliques locales.

`openrouter/free` choisit un modèle gratuit disponible au moment de la requête. Les
modèles gratuits changent souvent : ce routeur évite de dépendre de l'un d'eux. Pour
fixer un modèle, change `OPENROUTER_MODEL` dans `wrangler.toml`.

**Confidentialité :** le contexte envoyé contient les prénoms et les messages du chat
de la partie. Les fournisseurs des modèles gratuits peuvent conserver les requêtes.
Préviens les joueurs, ou laisse `AI_ENDPOINT` vide.

## Tester sans clé

```bash
node tools/ai-mock.js        # exécute ce Worker dans Node, avec un OpenRouter simulé
```

Puis ouvre `http://localhost:4173/banqueroll.html?ai=http://localhost:8787/host`.
La surcharge `?ai=` n'est acceptée que lorsque la page tourne sur localhost.
`tools/test-browser.js` s'en sert pour tester la réponse, le contexte reçu et la panne.
