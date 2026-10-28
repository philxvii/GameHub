<div align="center">

<img src="icons/favicon.svg" alt="" width="84" height="84">

# Game Hub

**Des jeux multijoueurs à lancer dans le navigateur, entre potes.**<br>
On crée une partie, on partage le code, on joue. Aucune installation, aucun compte.

<br>

[![Jouer sur roulia.me](https://img.shields.io/badge/%E2%96%B6%EF%B8%8F%20JOUER-roulia.me-e63946?style=for-the-badge&labelColor=1d1d2b)](https://roulia.me)

![10 jeux](https://img.shields.io/badge/jeux-10-5F6FE8?style=flat-square)
![Sans framework](https://img.shields.io/badge/framework-aucun-2a9d8f?style=flat-square)
![Sans build](https://img.shields.io/badge/build-aucun-2a9d8f?style=flat-square)
![Temps réel](https://img.shields.io/badge/temps%20r%C3%A9el-Firebase-f4a261?style=flat-square)
![Hébergé sur GitHub Pages](https://img.shields.io/badge/h%C3%A9berg%C3%A9-GitHub%20Pages-1d1d2b?style=flat-square)

</div>

<br>

<div align="center">
<a href="https://roulia.me/games/banqueroll/"><img src="games/banqueroll/cover.webp" width="150" alt="Banqueroll"></a>
<a href="https://roulia.me/games/mauvais-perdants/"><img src="games/mauvais-perdants/cover.webp" width="150" alt="Mauvais Perdants"></a>
<a href="https://roulia.me/games/mini-subway/"><img src="games/mini-subway/cover.webp" width="150" alt="Mini Subway"></a>
<a href="https://roulia.me/games/uno/"><img src="games/uno/cover.webp" width="150" alt="UNO"></a>
<a href="https://roulia.me/games/undercover/"><img src="games/undercover/cover.webp" width="150" alt="Undercover"></a>
</div>

---

## 🎮 Les jeux

### Soirées et gros groupes

| | Jeu | Joueurs | En deux mots |
|:-:|---|:-:|---|
| 💼 | **[Banqueroll](https://roulia.me/games/banqueroll/)** | 2–8 | Plateau financier : enchères, échanges, bots, présentateur IA et modes party |
| 🎤 | **[Mauvais Perdants](https://roulia.me/games/mauvais-perdants/)** | 1–8 | Une émission de télé des années 70 : un tournoi de mini-jeux (vitesse, mémoire, mots, chiffres…), un chat libre et un solo contre le présentateur |
| 🕵️ | **[Undercover](https://roulia.me/games/undercover/)** | 3–9 | Trouve l'imposteur avant qu'il ne te démasque |
| 🃏 | **[UNO](https://roulia.me/games/uno/)** | 2–6 | Pose tes cartes, bloque les autres et crie UNO |
| 🎰 | **[Roulette](https://roulia.me/games/roulette/)** | 2–8 | Misez vos jetons, la roue tourne |
| ⛳ | **[Mini Golf](https://roulia.me/games/mini-golf/)** | 2–4 | 9 trous, le moins de coups gagne |
| 🚇 | **[Mini Subway](https://roulia.me/games/mini-subway/)** | 1–4 | Trace des lignes de métro et achemine les passagers avant la saturation, seul, en coop ou en duel |

### Duels

| | Jeu | Joueurs | En deux mots |
|:-:|---|:-:|---|
| 🤔 | **[Qui est-ce ?](https://roulia.me/games/qui-est-ce/)** | 2 | Devine le personnage adverse |
| ⚓ | **[Bataille navale](https://roulia.me/games/bataille-navale/)** | 2 | Place ta flotte et coule celle de l'adversaire |
| 🔴 | **[Puissance 4](https://roulia.me/games/puissance4/)** | 2 | Aligne 4 jetons avant l'adversaire |

---

## 🧱 Architecture

- **Site statique.** HTML, CSS et JavaScript natifs, sans framework ni étape de build :
  GitHub Pages publie le dépôt tel quel à chaque `git push origin main`.
- **Firebase Realtime Database** synchronise les parties en temps réel, un nœud par jeu.
  Les [règles de la base](firebase/) sont versionnées avec leurs tests.
- **Sans compte.** Un code de salon suffit pour rejoindre une partie.
- **Intelligence artificielle sans clé côté navigateur.** Le présentateur de Banqueroll passe par un
  [Worker Cloudflare](games/banqueroll/ai-host/) gratuit.

```text
index.html        le hub (liste des jeux)
404.html          page introuvable, redirige aussi les anciennes adresses (/uno.html…)
games/<jeu>/      un dossier autonome par jeu
shared/           code commun
firebase/         règles de la base et leurs tests
icons/            favicon et icônes
tools/            vérifications communes
```

## 🚀 Lancer en local

```bash
python -m http.server 4173
# puis http://localhost:4173
```

## 🧪 Tests

Node 22+, sans dépendance npm ; Chrome pour les tests navigateur.

```bash
node tools/check-links.js                              # structure du site
node games/banqueroll/tests/check-static.js            # règles de Banqueroll, sans navigateur
node games/banqueroll/tests/test-browser.js            # parties réelles dans Chrome
node --test games/mauvais-perdants/tests/*.test.mjs    # règles de Mauvais Perdants, sans navigateur
```

Détails : [tools/](tools/README.md) · [tests de Banqueroll](games/banqueroll/tests/README.md).

## 📜 Droits

© 2026 XVIIIUUUU, tous droits réservés : le code est visible mais pas libre de
réutilisation (voir [LICENSE](LICENSE)). Les noms UNO, Qui est-ce ?, Puissance 4 et
les autres jeux classiques restent des marques de leurs éditeurs respectifs.

<div align="center">

<br>

**[▶ Jouer sur roulia.me](https://roulia.me)**

<sub>By XVIIIUUUU</sub>

</div>
