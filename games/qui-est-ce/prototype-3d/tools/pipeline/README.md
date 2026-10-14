# Pipeline des personnages

Produire un personnage du Qui est-ce ? 3D = une suite de commandes, depuis
`games/qui-est-ce/prototype-3d/`. Rien ici ne touche à `character-01` (validé) : ses fichiers
gardent leurs chemins historiques (`refs/`, `build/`, `build-ict/`, `models/`).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `data/roster.json` | les 24 personnages fictifs, leurs attributs de jeu et leur apparence |
| `tools/pipeline/check_roster.py` | contrôle de la distribution (équilibre 3-12 sur 24, paires, questions moyennes) |
| `tools/pipeline/make_prompts.py` | régénère `data/prompts/<id>.md` (consignes Gemini, 5 vues) depuis le roster |
| `tools/pipeline/paths.py` | chemins d'un personnage ; `--id` commun à tous les scripts |
| `tools/pipeline/build_character.py` | orchestrateur |

Arborescence d'un personnage `<id>` autre que `character-01` :

```text
characters/<id>/refs/{front,three-quarter-left,three-quarter-right,profile-left,profile-right}.jpg   photos Gemini
characters/<id>/refs/mv/*.jpg            carrés centraux 1024 px (étape mv)
models/<id>/hunyuan2mv-shape.glb         forme Hunyuan3D-2mv (PC)
build/<id>/                              recalage, buste texturé, repères (register, bake)
build/<id>/ict/fit.npz                   ajustement ICT (fit)
models/<id>/<id>-ict.glb                 personnage complet (build_ict)
models/<id>/<id>-ict-opt.glb             personnage optimisé (recette L1, en attente de G1)
models/<id>/hair/<style>.glb             coiffure en cartes (gen_cards)
reports/characters/<id>.jpg              planche (bench)
```

## Produire un personnage

```bash
# 1. Sur le PC : photos Gemini selon data/prompts/<id>.md -> characters/<id>/refs/
python tools/pipeline/build_character.py <id>                 # s'arrête à l'étape hunyuan
# 2. Sur le PC : Space Hugging Face Hunyuan3D-2mv (face + trois-quarts de refs/mv) -> models/<id>/hunyuan2mv-shape.glb
python tools/pipeline/build_character.py <id> --from register # register, bake, fit, build_ict ; s'arrête à la coiffure
# 3. Coiffure : un style de tools/hair/gen_cards.py (STYLES), puis :
python tools/pipeline/build_character.py <id> --from hair --hair <style> --bench
python tools/pipeline/build_character.py <id> --list          # état des étapes
```

Chaque script accepte aussi `--id <id>` seul, par exemple
`python tools/character-ict/fit.py --id character-07`. Sans `--id`, il produit les fichiers
de `character-01` à l'octet près (vérifié le 2026-10-14 : `register.py`, `bake.py`, `fit.py`
identiques à la version sans `--id` ; `build_ict.py` et `gen_cards.py hair-curly-v41`
identiques aux modèles versionnés).

## Limites connues

- `register.py`, `bake.py` et `fit.py` sont déterministes, mais relancés aujourd'hui ils ne
  redonnent pas les intermédiaires versionnés de `character-01` (lacet des vues jusqu'à 6,5°
  d'écart dans `registration.json`) : ces fichiers viennent d'un état antérieur des scripts.
  Pour `character-01`, garder les intermédiaires versionnés.
- `gen_cards.py` n'a qu'une teinte (brun de `character-01`) et un style validé (`hair-curly-v41`) :
  les coiffures des autres personnages (couleur, longueur, raides / bouclées) restent à concevoir.
- Lunettes, chapeau, boucles d'oreilles, barbe et moustache viendront de la bibliothèque
  d'accessoires (lot L4) ; ils ne figurent jamais sur les photos.
