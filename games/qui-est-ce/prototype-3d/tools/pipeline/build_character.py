"""Orchestrateur : produit un personnage de data/roster.json, etape par etape.

    python tools/pipeline/build_character.py character-07            # enchaine ce qui est possible
    python tools/pipeline/build_character.py character-07 --list     # etat de chaque etape, sans rien lancer
    python tools/pipeline/build_character.py character-07 --from fit # reprend a une etape
    python tools/pipeline/build_character.py character-07 --hair hair-curly-v41 --bench

S'arrete proprement, avec la marche a suivre, aux etapes qui demandent le PC de
l'utilisateur : photos Gemini (data/prompts/<id>.md) et maillage Hunyuan3D-2mv (Space
Hugging Face). Ne touche jamais aux fichiers de character-01 : pour lui, utiliser les
scripts directement (voir HANDOFF.md).

Etapes : refs -> mv -> hunyuan -> register -> bake -> fit -> ict -> hair -> opt -> bench.
"""
import argparse
import json
import os
import subprocess
import sys

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from paths import DEFAULT, paths                                     # noqa: E402

VIEWS = ['front', 'three-quarter-left', 'three-quarter-right', 'profile-left', 'profile-right']
PY = sys.executable
# Recette d'optimisation candidate (lot L1, en attente de la validation G1 de l'utilisateur).
OPT = ['--drop-shells', '--tex', 'body=jpeg:85@0.5,scalp=jpeg:85@0.5', '--pack', '-vp 16 -vt 16 -cc']


def run(cmd):
    print('  $', ' '.join('python' if c == PY else os.path.relpath(c, PROTO) if c.startswith(PROTO) else c for c in cmd), flush=True)
    r = subprocess.run(cmd, cwd=PROTO)
    if r.returncode: raise SystemExit(f'echec ({r.returncode})')


class Stop(Exception):
    pass


def steps(ch, a, entry):
    opt_glb = ch.glb.replace('-ict.glb', '-ict-opt.glb')
    hair = os.path.join(ch.hair, (a.hair or '') + '.glb')

    def refs():
        missing = [v for v in VIEWS if not os.path.exists(os.path.join(ch.refs, v + '.jpg'))]
        if missing:
            raise Stop(f"photos manquantes dans {os.path.relpath(ch.refs, PROTO)}/ : {', '.join(v + '.jpg' for v in missing)}\n"
                       f"  -> suivre data/prompts/{ch.id}.md (Gemini, dans le navigateur du PC)")

    def mv():
        os.makedirs(ch.refs_mv, exist_ok=True)
        for v in VIEWS:                                              # carre central, 1024 px (comme refs/mv)
            img = cv2.imread(os.path.join(ch.refs, v + '.jpg'))
            h, w = img.shape[:2]
            s = min(h, w); x0, y0 = (w - s) // 2, (h - s) // 2
            sq = cv2.resize(img[y0:y0 + s, x0:x0 + s], (1024, 1024), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(ch.refs_mv, v + '.jpg'), sq, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f'  5 vues 1024 px dans {os.path.relpath(ch.refs_mv, PROTO)}/')

    def hunyuan():
        if not os.path.exists(ch.hunyuan):
            raise Stop(f"maillage Hunyuan absent : {os.path.relpath(ch.hunyuan, PROTO)}\n"
                       f"  -> sur le PC, Space Hugging Face Hunyuan3D-2mv avec les vues face, trois-quarts gauche et droite\n"
                       f"     de {os.path.relpath(ch.refs_mv, PROTO)}/ (comme models/hunyuan2mv-3views-shape.glb pour character-01) ;\n"
                       f"     garder la forme seule (sans texture) sous ce nom, puis relancer avec --from register")

    def hair_step():
        if entry['attributs']['coupe'] == 'chauve':
            print('  chauve : pas de coiffure'); return
        if not a.hair:
            raise Stop(f"coiffure : aucune pour l'instant ({entry['apparence']['coiffure']}).\n"
                       f"  -> proposer un style dans tools/hair/gen_cards.py (STYLES), puis relancer avec --from hair --hair <style>")
        run([PY, 'tools/hair/gen_cards.py', '--id', ch.id, a.hair])

    def opt():
        run([PY, 'tools/character-ict/optimize_character.py', ch.glb, opt_glb, *OPT])

    def bench():
        if not a.bench:
            print('  (banc saute : ajouter --bench ; serveur http://localhost:4173 et Chrome requis)'); return
        out = os.path.join('build', 'bench', ch.id)
        run(['node', 'tools/character-ict/bench_character.js', os.path.relpath(opt_glb if os.path.exists(opt_glb) else ch.glb, PROTO), out])
        sheet(os.path.join(PROTO, out), os.path.join(PROTO, 'reports', 'characters', ch.id + '.jpg'))

    return [
        ('refs', refs, None),
        ('mv', mv, ch.refs_mv),
        ('hunyuan', hunyuan, None),
        ('register', lambda: run([PY, 'tools/character/register.py', '--id', ch.id]), os.path.join(ch.build, 'registration.json')),
        ('bake', lambda: run([PY, 'tools/character/bake.py', '--id', ch.id]), os.path.join(ch.build, 'textured.npz')),
        ('fit', lambda: run([PY, 'tools/character-ict/fit.py', '--id', ch.id]), os.path.join(ch.fit, 'fit.npz')),
        ('ict', lambda: run([PY, 'tools/character-ict/build_ict.py', '--id', ch.id]), ch.glb),
        ('hair', hair_step, hair if a.hair else ch.hair),
        ('opt', opt, opt_glb),
        ('bench', bench, None),
    ]


def sheet(bench_dir, path):
    """Planche du personnage : 6 etats et gros plans, JPEG < 600 Ko."""
    import numpy as np
    names = ['neutral', 'smile', 'suspicious', 'surprised', 'left', 'right', 'yeux-fermes',
             'gp-yeux', 'gp-yeux-fermes', 'gp-bouche-sourire', 'gp-bouche-surpris', 'profil']
    tiles = [cv2.resize(cv2.imread(os.path.join(bench_dir, n + '.png')), (300, 400), interpolation=cv2.INTER_AREA)
             for n in names if os.path.exists(os.path.join(bench_dir, n + '.png'))]
    while len(tiles) % 6: tiles.append(np.zeros_like(tiles[0]))
    img = np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(f'  planche : {os.path.relpath(path, PROTO)} ({os.path.getsize(path) // 1024} Ko)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id')
    ap.add_argument('--list', action='store_true', help='affiche l\'etat des etapes sans rien lancer')
    ap.add_argument('--from', dest='start', help='reprend a cette etape')
    ap.add_argument('--hair', help='style de tools/hair/gen_cards.py a generer pour ce personnage')
    ap.add_argument('--bench', action='store_true', help='banc et planche a la fin')
    a = ap.parse_args()
    if a.id == DEFAULT:
        raise SystemExit('character-01 est valide : utiliser les scripts directement (HANDOFF.md), jamais l\'orchestrateur')
    roster = json.load(open(os.path.join(PROTO, 'data', 'roster.json'), encoding='utf-8'))
    entry = next((c for c in roster['personnages'] if c['id'] == a.id), None)
    if not entry: raise SystemExit(f'{a.id} absent de data/roster.json')
    ch = paths(a.id)
    todo = steps(ch, a, entry)
    names = [n for n, _, _ in todo]
    if a.start and a.start not in names: raise SystemExit(f"etape inconnue : {a.start} ({', '.join(names)})")
    print(f"{entry['prenom']} ({a.id})")
    if a.list:
        for n, _, out in todo:
            done = out and os.path.exists(out)
            print(f"  {'fait   ' if done else '-      '} {n}" + (f'  ({os.path.relpath(out, PROTO)})' if out else ''))
        return
    started = not a.start
    for n, fn, _ in todo:
        started = started or n == a.start
        if not started: continue
        print(f'[{n}]', flush=True)
        try:
            fn()
        except Stop as e:
            print(f'ARRET a l\'etape {n} : {e}')
            sys.exit(3)
    print('termine')


if __name__ == '__main__':
    main()
