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
| 🚇 | [Mini Subway](https://roulia.me/games/mini-subway/) | 1–4 | Trace des lignes de métro et achemine les passagers avant la saturation |
| 🤔 | [Qui est-ce ?](https://roulia.me/games/qui-est-ce/) | 2 | Devine le personnage adverse |
| ⚓ | [Bataille navale](https://roulia.me/games/bataille-navale/) | 2 | Place ta flotte et coule celle de l'adversaire |
| 🔴 | [Puissance 4](https://roulia.me/games/puissance4/) | 2 | Aligne 4 jetons avant l'adversaire |

## Architecture

```
visiteur ─▶ Cloudflare (Worker edge/) ─▶ GitHub Pages ─ pages statiques
                                                │
                                                ▼  (depuis le navigateur)
                                   Firebase : comptes anonymes + base temps réel
```

- **Site statique.** HTML, CSS et JavaScript natifs, sans framework ni build : GitHub Pages
  publie le dépôt tel quel à chaque `git push origin main`.
- **Firebase Realtime Database** synchronise les parties, un nœud par jeu. Chaque joueur
  reçoit un compte anonyme : les [règles de la base](firebase/) ne laissent lire et écrire une
  partie qu'à ses membres. Il n'y a aucun serveur applicatif, les clients arbitrent la partie.
- **Cloudflare Worker** ([edge/](edge/README.md)) placé devant GitHub Pages. Il ajoute les
  en-têtes de sécurité et sert de portier : en maintenance, il répond lui-même et rien du site
  ne sort. L'admin entre avec son compte Google (son uid doit figurer dans `admins/`).
- **Maintenance** : un interrupteur Firebase (`hub/settings/maintenance`) que le Worker, la page
  ([shared/maintenance.js](shared/maintenance.js)) et les règles de la base lisent tous les trois.
- Banqueroll est découpé en modules ES ; son présentateur passe par un
  [Worker Cloudflare](games/banqueroll/ai-host/) gratuit (aucune clé côté navigateur).

```
index.html        le hub (liste des jeux, panneau admin)
404.html          page introuvable, redirige aussi les anciennes adresses (/uno.html…)
games/<jeu>/      un dossier autonome par jeu
shared/           code commun : connexion Firebase, maintenance, charte graphique
firebase/         règles de la base et leurs tests (émulateur)
edge/             Worker Cloudflare devant le site, avec ses tests
__/auth/          pages de connexion Google de Firebase, servies depuis roulia.me
icons/            favicon et icônes
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
node --test edge/test/worker.test.mjs              # Worker Cloudflare, sans réseau
```

Détails : [tools/](tools/README.md) · [tests de Banqueroll](games/banqueroll/tests/README.md).

## Droits

© 2026 XVIIIUUUU, tous droits réservés : le code est visible mais pas libre de
réutilisation (voir [LICENSE](LICENSE)). Les noms UNO, Qui est-ce ?, Puissance 4 et
les autres jeux classiques restent des marques de leurs éditeurs respectifs.

---

By XVIIIUUUU
