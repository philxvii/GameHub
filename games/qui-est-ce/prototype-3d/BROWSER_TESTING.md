# Tester et naviguer avec le minimum de jetons

Recherche du 2026-10-16 (sources tierces, chiffres approximatifs : direction fiable, valeurs non
garanties). Un MCP de navigateur renvoie souvent à chaque action tout l'arbre de la page dans la
conversation (de l'ordre de milliers à dizaines de milliers de jetons par étape, anciens états non
purgés) et charge ses définitions d'outils au démarrage. Une **CLI qui écrit ses états sur disque** et
ne renvoie que de courtes références coûte plusieurs fois moins.

## Ordre de préférence

1. **Scripts CDP du dépôt** (`tools/cdp.js` + `test-board.js`, `test-board-pixels.js`, `bench_*`) :
   zéro image, sortie texte de quelques lignes. **Premier choix pour tout ce qui est vérifiable.**
2. **Un script par besoin** (Playwright en Node/Python, déjà installé hors dépôt : voir la mémoire
   « Playwright setup ») : le script fait toute la séquence et n'imprime qu'un résumé (« 12/12 »,
   les 3 lignes d'erreur). Pas de MCP en continu.
3. **`agent-browser`** (CLI Rust de Vercel Labs, Apache 2.0, pilote Chrome en CDP) : instantané compact de la
   page avec références courtes (`@e1`…), environ 200 à 400 jetons par instantané d'après les sources,
   à tester avant adoption (`npx agent-browser` est déjà en cache npm sur ce PC). Utile pour naviguer
   sur un site inconnu (documentation, forum).
4. **Chrome MCP** (extension « Claude in Chrome ») : seulement quand on a besoin d'un navigateur
   connecté à votre session (Gemini avec votre compte, par exemple), jamais pour les tests du jeu.

## Pour le web (documentation, forums, GitHub)

- `WebSearch` en mode standard pour une question précise, `WebFetch` avec un `prompt` ciblé (il renvoie
  la réponse, pas la page) ; jamais d'ouverture de page entière pour la lire.
- Dépôts GitHub : `gh api` / `gh search` (sortie texte) plutôt que la navigation.
- Garder les résultats utiles dans `RESEARCH.md` pour ne pas les chercher deux fois.

## Images

- Une capture lue coûte environ 1 900 jetons à 1440 px. **Réduire à ≤ 1000 px** (ou recadrer sur la
  zone jugée), une seule par question visuelle, jamais pour vérifier un comportement.
- Comparer deux rendus par **pixels** (`diff_shots.py`, `test-board-pixels.js`) plutôt que par l'œil.
- Pour le rendu 3D : rendu déterministe (graine fixée) pour que deux images identiques le soient au pixel.

## Session

- Une session par objectif, courte ; décisions dans les fichiers du dépôt, pas dans la conversation.
- `CLAUDE.md` court ; lire des plages de lignes, pas des fichiers entiers ; filtrer les sorties
  (`| tail -20`).
- Les sous-agents neufs sont économes (contexte isolé, seul le résumé revient) ; **les sous-agents
  « fork » recopient tout le contexte** et coûtent très cher.
- Cache de prompt : travailler par séquences rapprochées (le cache dure quelques minutes).
