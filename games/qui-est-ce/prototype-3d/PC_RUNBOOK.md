# Dossier PC : ce qui ne peut pas se faire dans le cloud

Toutes les commandes partent de la **racine du dépôt** (`GameHub/`) sauf mention contraire,
sur la branche `proto/qui-est-ce-3d`. Rien ici n'est déjà fait. Mis à jour à chaque lot.

| # | À faire | Par qui | Commande ou geste | Durée |
| --- | --- | --- | --- | --- |
| 1 | Récupérer le travail du cloud | session locale | `git fetch && git switch proto/qui-est-ce-3d && git pull` | 1 min |
| 2 | Lire le résumé | toi | `games/qui-est-ce/prototype-3d/FIN_DE_MISSION_3.md` (mission 3, 5 min), puis `DECISIONS.md` et `QUESTIONS.md` | 15 min |
| 3 | Mesures GPU (Iris Xe) | session locale | `node games/qui-est-ce/prototype-3d/tools/measure_pc.js` → `reports/pc/résumé.md` | 15 min |
| 4 | Regarder le jeu en vrai | toi | `python -m http.server 4173` (racine du dépôt), puis **http://localhost:4173/games/qui-est-ce/v3d/** (jeu, mode en ligne) ou **http://localhost:4173/games/qui-est-ce/prototype-3d/board.html** (même jeu, bot seulement) → « Jouer contre le bot » ; survole les visages : la carte prend vie | 10 min |
| 5 | Partie en ligne à deux, contre l'émulateur | toi + session locale | § « Jeu en ligne » ci-dessous | 20 min |
| 6 | Photos des 23 personnages | toi | § « Photos Gemini » ; contrôle : `python tools/pipeline/check_refs.py <id>` | ~10 min par personnage |
| 7 | Fabriquer les personnages prêts | session locale | `python tools/pipeline/build_character.py --all-ready --bench` (depuis `prototype-3d/`) | ~20 min par personnage + Hunyuan |
| 8 | Mise en ligne | toi, quand tout est validé | § « Mise en ligne » (jamais depuis le cloud) | 1 h |
| 9 | Après tout changement de personnage, coiffure, accessoire ou studio | session locale | `node games/qui-est-ce/prototype-3d/tools/bake_portraits.js [ids…]` (portraits du plateau, 4 expressions) | 1 min par personnage (GPU) |
| 10 | Tests d'image et de partie | session locale | `node games/qui-est-ce/prototype-3d/tools/test-board-pixels.js` puis `tools/test-board.js` (même dossier) | 5 min |

## 1. Mesures GPU

```bash
python -m http.server 4173          # racine du dépôt, dans un autre terminal (sinon le script le lance)
node games/qui-est-ce/prototype-3d/tools/measure_pc.js
```

Enchaîne `test-proto.js`, le banc du personnage optimisé (`build/pc/banc/`), le plateau dans
une **fenêtre visible** (chargement des 24 portraits, images par seconde au repos et pendant que
la souris balaie les cartes, temps d'allumage d'une carte vivante : premier personnage, autre
personnage, personnage déjà vu) et une partie complète contre le bot. Écrit
`reports/pc/résumé.md` avec les seuils : survol ≥ 50 images/s, repos ≥ 55, chargement ≤ 6 s,
allumage ≤ 1,5 s (≤ 120 ms déjà vu), image du personnage seul ≤ 8 ms. Garder le Gestionnaire des
tâches → Performances → GPU ouvert (mémoire GPU réelle). Essai rapide : `… measure_pc.js --plateau`.

Si une mesure est « À revoir » : `setPixelRatio` de la carte vivante (`js/game/live.js`, ×2 pour
égaler les portraits), la taille de la carte d'ombre du studio (1024, `js/game/cast.js`), puis le
nombre de personnages gardés en mémoire (`KEEP = 4`).

## 2. Jeu en ligne (émulateur, deux navigateurs)

Le cloud n'a pas pu le faire (le SDK Firebase de gstatic y est bloqué). Les règles et le
module réseau sont, eux, testés : 342/342 (`firebase/tests/qec3.test.js`).

```bash
cd firebase
npm test                                                            # 342 tests attendus
npx firebase emulators:start --only database,auth --project undercover-game-b0d2a
# autre terminal, depuis firebase/ : servir les pages vers l'émulateur, publier les règles finales
node tests/serve-emulated.js 4174
curl -X PUT -H "Authorization: Bearer owner" --data-binary @database.rules.phase2.json \
  "http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb"
```

1. Chrome, profil A : **http://localhost:4174/games/qui-est-ce/v3d/?emu** → nom → « Créer un salon en ligne » → le code s'affiche dans le carnet (bouton « Copier le code » dans la barre).
2. Chrome, **profil B** (ou fenêtre Invités : un même profil partage un seul compte anonyme
   entre ses onglets) : même adresse avec `?emu` → nom → code → « Rejoindre ».
3. Jouer une manche entière, puis « Revanche » des deux côtés, puis fermer un des onglets.
4. Triche : les tentatives (lire le secret adverse, jouer hors de son tour, répondre à sa
   propre question, entrer dans un salon plein) sont faites par
   `node --test tests/qec3.test.js` (depuis `firebase/`, émulateur lancé) et doivent toutes
   être refusées. Dans le navigateur, vérifier seulement que l'onglet « Network » ne montre
   jamais le secret de l'autre avant la révélation.

Si `emulators:start` échoue au chargement des règles (proxy d'entreprise), lancer le jar
directement : `java -jar ~/.cache/firebase/emulators/firebase-database-emulator-v4.11.2.jar --port 9000`.

## 3. Photos Gemini (23 personnages)

Pour chaque personnage `character-02` … `character-24` :

1. Ouvrir `games/qui-est-ce/prototype-3d/data/prompts/<id>.md` : il contient les 5 consignes
   prêtes à coller dans Gemini (même personne, même lumière, fond gris clair uni, sans
   lunettes, chapeau ni bijoux : ce sont des accessoires 3D).
2. Enregistrer les 5 images **en JPEG** dans `games/qui-est-ce/prototype-3d/characters/<id>/refs/`
   sous ces noms exacts :
   `front.jpg`, `three-quarter-left.jpg`, `three-quarter-right.jpg`, `profile-left.jpg`, `profile-right.jpg`.
   Les trois-quarts et profils se tournent comme ceux de `character-01` (`prototype-3d/refs/`).
3. Contrôler : `python tools/pipeline/check_refs.py <id>` (depuis `prototype-3d/`). Il dit
   précisément quelle vue refaire : absente, trop petite (< 1024 px), fond pas uni ou trop
   sombre, aucun visage, visage tourné du mauvais côté. `--all` contrôle tout le roster.

Règle (CLOUD_LOG, « écart de 6,5° ») : **toute la chaîne d'un personnage sur la même
machine** (le PC), de `register` à `build_ict`.

## 4. Fabrication

Depuis `games/qui-est-ce/prototype-3d/` :

```bash
python tools/pipeline/build_character.py --all-ready --bench   # tous ceux dont les 5 photos sont là
python tools/pipeline/build_character.py character-07 --list   # où en est un personnage
```

L'orchestrateur s'arrête proprement (code 3) aux deux gestes manuels :

- **Hunyuan3D-2mv** (Space Hugging Face, dans le navigateur) : déposer les vues face,
  trois-quarts gauche et droite de `characters/<id>/refs/mv/` (carrés 1024 px, produits par
  l'étape `mv`), générer la **forme seule** (sans texture), télécharger le GLB sous
  `models/<id>/hunyuan2mv-shape.glb`, puis
  `python tools/pipeline/build_character.py <id> --from register`.
  Erreurs courantes : file d'attente pleine ou quota GPU épuisé (« You have exceeded your GPU
  quota ») → réessayer plus tard ou se connecter à Hugging Face ; GLB texturé à la place de
  la forme → reprendre la sortie « shape ». Aucun jeton n'est nécessaire ni à versionner.
- **Coiffure** : `--from hair --hair <style>` avec un style de `tools/hair/gen_cards.py`
  (`hair-curly-v41` validé ; `prop-buzz`, `prop-short-grey`, `prop-wavy-red`,
  `prop-long-blond` en proposition, voir `reports/accessories/coiffures.jpg`).

À la fin, l'étape `roster` passe le personnage à `statut: "modelise"` avec son `glb` (et sa
`coiffure`) dans `data/roster.json` ; la planche de validation est dans
`reports/characters/<id>.jpg`. Le jeu prend le `glb` de la fiche dès qu'il existe
(`js/game/cast.js`) ; refaire alors ses portraits : `node tools/bake_portraits.js <id>`. Un
personnage réel remplace aussi un visage provisoire de `data/casting/` (enlever ce fichier).

## 5. Mise en ligne (procédure, non exécutée)

À faire depuis le PC, **jamais depuis le cloud**, une fois G1 à G5 validés par toi.

1. **Préparer** : `git switch proto/qui-est-ce-3d && git pull`, puis sur une branche de
   fusion : déplacer `prototype-3d/{css,js,models,data}` utiles au jeu dans `v3d/` (ou garder
   la balise `<base>` de `v3d/index.html`, générée par `tools/make_v3d.py`) ; ne pas publier
   `build/`, `reports/`, `tools/` lourds.
2. **Tests** :
   - `node tools/check-links.js` (13/13) ;
   - `cd firebase && npm test` (342/342) ;
   - `QE_PAGE=v3d node games/qui-est-ce/prototype-3d/tools/test-board.js` (12/12) ;
   - `node games/qui-est-ce/prototype-3d/tools/measure_pc.js` (seuils OK) ;
   - la partie à deux du § 2.
3. **Règles** : `firebase/firebase.json` publie aujourd'hui `database.rules.transition.json`,
   qui contient déjà `qec3` (et garde `qec2` intact). Puis, depuis `firebase/` :
   `npx firebase deploy --only database --project undercover-game-b0d2a`. Jamais
   `firebase deploy` sans `--only`.
4. **Fusion** dans `main` (pull request relue), lien vers `games/qui-est-ce/v3d/` depuis le hub
   si tu le veux (le jeu actuel `games/qui-est-ce/index.html` reste en place).
5. **Vérifier la production** : `CDP_PORT=9333 node firebase/tests/smoke-prod.cjs` (à étendre à `qec3`), puis une partie à deux
   sur le site.
6. **Retour arrière** : revenir au commit précédent de `main` (revert de la fusion) ; les
   règles `qec3` peuvent rester (nœud inutilisé) ou être retirées en republiant le fichier
   de règles précédent (`git show <commit>:firebase/database.rules.transition.json`).
