# 🎲 Game Hub

Des jeux multijoueurs à lancer dans le navigateur entre potes : on crée une partie,
on partage le code, on joue. Pas d'installation, pas de compte.

**▶ Jouer : [roulia.me](https://roulia.me)**

## Les jeux

| | Jeu | Joueurs | En deux mots |
|---|---|---|---|
| 💼 | [Banqueroll](https://roulia.me/games/banqueroll/) | 2–8 | Plateau financier : enchères, échanges, bots, présentateur IA et modes party |
| 🃏 | [UNO](https://roulia.me/games/uno/) | 2–6 | Pose tes cartes, bloque les autres et crie UNO |
| 🕵️ | [Undercover](https://roulia.me/games/undercover/) | 3–9 | Trouve l'imposteur avant qu'il ne te démasque |
| 🎰 | [Roulette](https://roulia.me/games/roulette/) | 2–8 | Misez vos jetons, la roue tourne |
| ⛳ | [Mini Golf](https://roulia.me/games/mini-golf/) | 2–4 | 9 trous, le moins de coups gagne |
| 🌍 | [WikiRace](https://roulia.me/games/wikirace/) | 2–6 | Atteins la page cible en ne suivant que les liens Wikipédia |
| 🤔 | [Qui est-ce ?](https://roulia.me/games/qui-est-ce/) | 2 | Devine le personnage adverse |
| ⚓ | [Bataille navale](https://roulia.me/games/bataille-navale/) | 2 | Place ta flotte et coule celle de l'adversaire |
| 🔴 | [Puissance 4](https://roulia.me/games/puissance4/) | 2 | Aligne 4 jetons avant l'adversaire |

## Sous le capot

- **HTML, CSS et JavaScript natifs**, sans framework ni étape de build : le dépôt est
  servi tel quel par GitHub Pages.
- **Firebase Realtime Database** synchronise les parties en temps réel, un nœud par jeu.
- Banqueroll est découpé en modules ES ; son présentateur passe par un
  [Worker Cloudflare](games/banqueroll/ai-host/) gratuit (aucune clé côté navigateur).

```
index.html        le hub
404.html          page introuvable, redirige aussi les anciennes adresses (/uno.html…)
games/<jeu>/      un dossier autonome par jeu
tools/            vérifications communes
```

## Lancer en local

```bash
python -m http.server 4173
# puis http://localhost:4173
```

## Tests

Node 22+, sans dépendance npm ; Chrome pour les tests navigateur.

```bash
node tools/check-links.js                        # structure du site
node games/banqueroll/tests/check-static.js      # règles de Banqueroll, sans navigateur
node games/banqueroll/tests/test-browser.js      # parties réelles dans Chrome
```

Détails : [tools/](tools/README.md) · [tests de Banqueroll](games/banqueroll/tests/README.md).

---

By XVIIIUUUU
