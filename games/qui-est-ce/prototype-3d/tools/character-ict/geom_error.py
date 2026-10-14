"""Erreur geometrique d'un personnage quantifie (gltfpack, sans compression) contre l'original :
positions de repos et deltas de chaque expression, apres dequantification, par materiau.

    python tools/character-ict/geom_error.py models/character-01-ict.glb build/ict-opt/x.glb

Unites : millimetres (1 cm = 0,05634 unite du modele, comme gen_cards.py). Chaque sommet
quantifie est apparie au sommet d'origine le plus proche (gltfpack fusionne les doublons,
reordonne les sommets et retire les UV des materiaux sans texture).
"""
import json
import sys

import numpy as np
import pygltflib as G
from scipy.spatial import cKDTree

MM = 0.005634          # 1 mm en unites du modele
DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
K = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
NORM = {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}


def reader(g):
    blob = g.binary_blob()

    def arr(i):
        a = g.accessors[i]; dt = DT[a.componentType]; k = K[a.type]
        out = np.zeros((a.count, k), np.float64)
        if a.bufferView is not None:
            bv = g.bufferViews[a.bufferView]
            stride = bv.byteStride or np.dtype(dt).itemsize * k
            raw = np.frombuffer(blob, np.uint8, bv.byteLength, (bv.byteOffset or 0))
            off = a.byteOffset or 0
            out = np.stack([np.frombuffer(raw[off + r * stride: off + r * stride + np.dtype(dt).itemsize * k].tobytes(), dt)
                            for r in range(a.count)]).astype(np.float64) if stride != np.dtype(dt).itemsize * k else \
                np.frombuffer(raw, dt, a.count * k, off).reshape(a.count, k).astype(np.float64)
        if a.sparse:
            s = a.sparse
            idt = DT[s.indices.componentType]
            ib, vb = g.bufferViews[s.indices.bufferView], g.bufferViews[s.values.bufferView]
            idx = np.frombuffer(blob, idt, s.count, (ib.byteOffset or 0) + (s.indices.byteOffset or 0))
            val = np.frombuffer(blob, dt, s.count * k, (vb.byteOffset or 0) + (s.values.byteOffset or 0)).reshape(s.count, k)
            out[idx] = val
        if a.normalized: out /= NORM[dt]
        return out
    return arr


def prims(path):
    g = G.GLTF2().load(path); arr = reader(g)
    out = {}
    for ni, n in enumerate(g.nodes):
        if n.mesh is None: continue
        sc = np.array(n.scale or [1, 1, 1]); tr = np.array(n.translation or [0, 0, 0])
        if n.name: sc, tr = np.ones(3), np.zeros(3)       # original : pas de transformation de dequantification
        m = g.meshes[n.mesh]
        for p in m.primitives:
            mat = g.materials[p.material].name
            P = arr(p.attributes.POSITION) * sc + tr
            T = [arr(t['POSITION']) * sc for t in p.targets or []]
            out.setdefault(mat, []).append((P, T, (m.extras or {}).get('targetNames')))
    return out


def main():
    a, b = prims(sys.argv[1]), prims(sys.argv[2])
    rep = {}
    for mat, lb in b.items():
        if mat not in a or mat == 'cornea': continue        # cornee : deux primitives identiques
        Pa, Ta, na = a[mat][0]
        Pb, Tb, nb = lb[0]
        tree = cKDTree(Pa)
        d, j = tree.query(Pb)
        r = {'pos_max_mm': round(float(d.max() / MM), 4), 'pos_mean_mm': round(float(d.mean() / MM), 4)}
        if Ta and Tb:
            errs = [np.linalg.norm(Tb[k] - Ta[na.index(nb[k])][j], axis=1) for k in range(len(Tb))]
            mags = [np.linalg.norm(Ta[na.index(nb[k])][j], axis=1).max() for k in range(len(Tb))]
            e = np.max(errs, axis=1)
            w = int(np.argmax(e))
            r.update(morph_max_mm=round(float(e.max() / MM), 4), morph_worst=nb[w],
                     morph_max_delta_mm=round(float(max(mags) / MM), 1))
        rep[mat] = r
    print(json.dumps(rep, indent=1))
    print(json.dumps({'pire_position_mm': max(r['pos_max_mm'] for r in rep.values()),
                      'pire_expression_mm': max(r.get('morph_max_mm', 0) for r in rep.values())}))


if __name__ == '__main__':
    main()
