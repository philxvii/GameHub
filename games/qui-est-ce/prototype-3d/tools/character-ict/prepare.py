"""Convertit le modele ICT-FaceKit (OBJ, licence MIT) en un fichier numpy compact.

Usage : python prepare.py <dossier FaceXModel>
Sortie : build-ict/ict.npz
  neutral (N,3), ids (100,N,3) et expr (55,N,3) en ecarts au neutre,
  uv (T,2), faces triangulees (sommets, uv, materiau), noms.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(PROTO, 'build-ict'); os.makedirs(OUT, exist_ok=True)
SRC = sys.argv[1]


def read_v(path):
    with open(path, encoding='utf8') as fh:
        return np.array([l.split()[1:4] for l in fh if l.startswith('v ')], np.float32)


def read_full(path):
    v, vt, fv, ft, fm, mats, cur = [], [], [], [], [], [], -1
    with open(path, encoding='utf8') as fh:
        for l in fh:
            if l.startswith('v '): v.append(l.split()[1:4])
            elif l.startswith('vt '): vt.append(l.split()[1:3])
            elif l.startswith('usemtl'):
                name = l.split()[1]
                if name not in mats: mats.append(name)
                cur = mats.index(name)
            elif l.startswith('f '):
                idx = [p.split('/') for p in l.split()[1:]]
                vi = [int(p[0]) - 1 for p in idx]; ti = [int(p[1]) - 1 for p in idx]
                for k in range(1, len(vi) - 1):            # eventail : quads -> 2 triangles
                    fv.append([vi[0], vi[k], vi[k + 1]]); ft.append([ti[0], ti[k], ti[k + 1]]); fm.append(cur)
    return (np.array(v, np.float32), np.array(vt, np.float32), np.array(fv, np.int32),
            np.array(ft, np.int32), np.array(fm, np.int16), mats)


neutral, uv, fv, ft, fm, mats = read_full(os.path.join(SRC, 'generic_neutral_mesh.obj'))
names = json.load(open(os.path.join(SRC, 'vertex_indices.json')))
expr_names = names['expressions']
id_names = sorted(f[:-4] for f in os.listdir(SRC) if f.startswith('identity') and f.endswith('.obj'))
ids = np.stack([read_v(os.path.join(SRC, n + '.obj')) - neutral for n in id_names])
expr = np.stack([read_v(os.path.join(SRC, n + '.obj')) - neutral for n in expr_names])
np.savez_compressed(os.path.join(OUT, 'ict.npz'), neutral=neutral, ids=ids, expr=expr, uv=uv,
                    fv=fv, ft=ft, fm=fm, mats=np.array(mats), expr_names=np.array(expr_names))
print(f'{len(neutral)} sommets, {len(fv)} triangles, {len(uv)} uv, materiaux {mats}')
print(f'{len(ids)} identites, {len(expr)} expressions ; etendue {neutral.min(0).round(1)} .. {neutral.max(0).round(1)}')
