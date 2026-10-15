"""Lecture de la tete du personnage pour les accessoires : peau (positions, faces, normales),
expressions de la peau (deltas par sommet), yeux, reperes du visage, echelle en cm.

Les accessoires sont ecrits dans l'espace du modele du personnage (pose de liaison), comme
la coiffure V4.1 : le moteur les rattache a l'os Head en gardant leur place (Head.attach).
Repere : +Y haut, +Z devant (le personnage regarde +Z), +X = gauche du personnage.
"""
import os

import numpy as np
import pygltflib as G
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
CHARACTER = os.environ.get('QE_HEAD') or os.path.join(PROTO, 'models', 'character-01-ict.glb')   # QE_HEAD : une autre tete (casting)
DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
K = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def _reader(g):
    blob = g.binary_blob()

    def arr(i):
        a = g.accessors[i]; dt = DT[a.componentType]; k = K[a.type]
        out = np.zeros((a.count, k), np.float64)
        if a.bufferView is not None:
            bv = g.bufferViews[a.bufferView]
            out = np.frombuffer(blob, dt, a.count * k, (bv.byteOffset or 0) + (a.byteOffset or 0)).reshape(a.count, k).astype(np.float64)
        if a.sparse:
            s = a.sparse
            ib, vb = g.bufferViews[s.indices.bufferView], g.bufferViews[s.values.bufferView]
            idx = np.frombuffer(blob, DT[s.indices.componentType], s.count, (ib.byteOffset or 0) + (s.indices.byteOffset or 0))
            out[idx] = np.frombuffer(blob, dt, s.count * k, (vb.byteOffset or 0) + (s.values.byteOffset or 0)).reshape(s.count, k)
        return out
    return arr


class Head:
    """Peau du visage et du crane (materiaux skin + scalp) et ses expressions."""

    def __init__(self, path=CHARACTER, materials=('skin', 'scalp'), landmarks=True):
        g = G.GLTF2().load(path); arr = _reader(g)
        mats = [m.name for m in g.materials]
        mesh = [m for m in g.meshes if m.name == 'head'][0]
        self.target_names = mesh.extras['targetNames']
        V, Fs, T, base, part = [], [], [], 0, []
        for p in mesh.primitives:
            if mats[p.material] not in materials: continue
            v = arr(p.attributes.POSITION); f = arr(p.indices).astype(np.int64).reshape(-1, 3)
            V.append(v); Fs.append(f + base); base += len(v); part += [mats[p.material]] * len(v)
            T.append(np.stack([arr(t['POSITION']) for t in p.targets]))        # (cibles, sommets, 3)
        self.V, self.F = np.vstack(V), np.vstack(Fs)
        self.T = np.concatenate(T, axis=1)                                 # (53, n, 3)
        self.part = np.array(part)
        self.N = self.normals(self.V)
        nodes = {n.name: n for n in g.nodes}
        head_w = sum(np.array(nodes[n].translation) for n in ('Hips', 'Spine2', 'Neck', 'Head'))
        self.head_bone = head_w
        self.eL = head_w + np.array(nodes['eyeLeft'].translation)          # centre du globe (pivot)
        self.eR = head_w + np.array(nodes['eyeRight'].translation)
        self.cm = np.linalg.norm(self.eL - self.eR) / 6.3                  # ecart interpupillaire ~6,3 cm
        self.eye_mid = (self.eL + self.eR) / 2
        self.tree = cKDTree(self.V)
        if landmarks: self._landmarks()

    def normals(self, V):
        F = self.F
        fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        N = np.zeros_like(V)
        for k in range(3): np.add.at(N, F[:, k], fn)
        return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)

    def posed(self, weights):
        """Peau deformee par des expressions {nom: poids}."""
        V = self.V.copy()
        for name, w in weights.items():
            V += w * self.T[self.target_names.index(name)]
        return V

    def ray(self, origin, direction, V=None):
        """Premier impact d'un rayon sur la peau (Moller-Trumbore vectorise), ou None."""
        V = self.V if V is None else V
        d = np.asarray(direction, float); d /= np.linalg.norm(d)
        p0, p1, p2 = V[self.F[:, 0]], V[self.F[:, 1]], V[self.F[:, 2]]
        e1, e2 = p1 - p0, p2 - p0
        h = np.cross(d, e2); a = np.einsum('ij,ij->i', e1, h)
        ok = np.abs(a) > 1e-12
        f = np.where(ok, 1 / np.where(ok, a, 1), 0)
        s = origin - p0; u = f * np.einsum('ij,ij->i', s, h)
        q = np.cross(s, e1); v = f * (q @ d); t = f * np.einsum('ij,ij->i', e2, q)
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
        if not hit.any(): return None
        return origin + d * t[hit].min()

    def hits(self, P, d, V=None, chunk=64):
        """Nombre d'intersections de rayons partant de chaque point de P dans la direction d."""
        V = self.V if V is None else V
        d = np.asarray(d, float); d /= np.linalg.norm(d)
        p0, p1, p2 = V[self.F[:, 0]], V[self.F[:, 1]], V[self.F[:, 2]]
        e1, e2 = p1 - p0, p2 - p0
        h = np.cross(d, e2); a = np.einsum('ij,ij->i', e1, h)
        ok = np.abs(a) > 1e-12; f = np.where(ok, 1 / np.where(ok, a, 1), 0)
        out = np.zeros(len(P), int)
        for k in range(0, len(P), chunk):
            s = P[k:k + chunk, None, :] - p0[None]                       # (c, faces, 3)
            u = f * np.einsum('cfi,fi->cf', s, h)
            q = np.cross(s, e1[None]); v = f * (q @ d); t = f * np.einsum('fi,cfi->cf', e2, q)
            out[k:k + chunk] = (ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-9)).sum(1)
        return out

    def inside(self, P, V=None):
        """Points a l'interieur de la tete : parite des intersections sur 3 rayons, vote majoritaire
        (la peau n'est pas fermee : yeux, bouche, cou ; le vote ecarte les rayons qui s'y perdent)."""
        votes = sum((self.hits(P, d, V) % 2) for d in ([0, 1, 0], [0, 0, 1], [0.6, 0.5, -0.62]))
        return votes >= 2

    def _landmarks(self):
        V, cm, m = self.V, self.cm, self.eye_mid
        front = V[:, 2] > m[2]
        # bout du nez : point le plus en avant pres de l'axe, sous les yeux
        sel = front & (np.abs(V[:, 0] - m[0]) < 1.0 * cm) & (V[:, 1] < m[1]) & (V[:, 1] > m[1] - 6 * cm)
        self.nose_tip = V[sel][np.argmax(V[sel][:, 2])]
        # arete du nez a la hauteur des lunettes (un peu sous les yeux) : rayon depuis l'avant
        self.bridge = self.ray(np.array([m[0], m[1] - 0.3 * cm, m[2] + 20 * cm]), [0, 0, -1])
        # oreilles : sommets les plus lateraux a hauteur des yeux (comme gen_cards.py)
        band = (V[:, 1] > m[1] - 3.5 * cm) & (V[:, 1] < m[1] + 1.5 * cm)
        self.ears = []
        for sgn in (1, -1):
            xs = sgn * (V[:, 0] - m[0])
            sel = band & (xs > np.percentile(xs[band], 97))
            c = V[sel].mean(0)
            near = (np.linalg.norm(V - c, axis=1) < 3.5 * cm) & (sgn * (V[:, 0] - m[0]) > sgn * (c[0] - m[0]) - 1.5 * cm)
            ear = V[near]
            self.ears.append({'centre': c, 'top': ear[np.argmax(ear[:, 1])], 'lobe': ear[np.argmin(ear[:, 1])],
                              'back': ear[np.argmin(ear[:, 2])], 'front': ear[np.argmax(ear[:, 2])]})
        self.top = V[np.argmax(V[:, 1])]
        self.half_width = (np.percentile(V[band][:, 0], 99.5) - np.percentile(V[band][:, 0], 0.5)) / 2

    def summary(self):
        c = self.cm
        r = lambda p: [round(float(x / c), 2) for x in (p - self.eye_mid)]
        return {'cm_u': round(float(c), 5), 'nose_tip': r(self.nose_tip), 'bridge': r(self.bridge),
                'ear_L': {k: r(v) for k, v in self.ears[0].items()}, 'top': r(self.top),
                'half_width_cm': round(float(self.half_width / c), 2), 'eye_L': r(self.eL), 'targets': len(self.target_names)}


if __name__ == '__main__':
    import json
    print(json.dumps(Head().summary(), indent=1))
