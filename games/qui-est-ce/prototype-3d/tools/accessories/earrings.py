"""Boucles d'oreilles accrochees aux lobes du personnage.

    python tools/accessories/earrings.py hoops     # creoles en or (2,2 cm : lisibles sur une carte)
    python tools/accessories/earrings.py pearls    # puces perle (nacre irisee)

Le lobe est le point le plus bas de chaque pavillon (head.py). La creole traverse le lobe
(percage) et pend dans un plan presque parallele a la joue, legerement ouvert vers l'avant ;
la perle est posee sur la face avant du lobe. Controle : sommets dans la tete pour les
5 expressions, hors du percage (6 mm autour du point du lobe : son epaisseur).

Sortie : models/accessories/earrings-<style>.glb (+ .json).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Glb, Mesh, PROTO, circle, sweep, orient     # noqa: E402
from head import Head                                          # noqa: E402


def hoop(h, side, lobe):
    cm = h.cm
    R, r = 1.1, 0.12                                               # rayon de la creole, du fil (cm)
    out = np.array([side, 0, 0.0])                                 # plan presque parallele a la joue
    yaw = np.radians(-side * 15)                                   # moitie arriere vers l'exterieur (pas dans la nuque)
    tilt = np.radians(25)                                           # le bas de la creole s'ecarte de la machoire
    a1 = np.array([np.sin(yaw), 0, np.cos(yaw)]); a2 = np.array([-side * np.sin(tilt), np.cos(tilt), 0])
    a1 = a1 - a2 * (a1 @ a2); a1 /= np.linalg.norm(a1)
    pierce = lobe + out * 0.05 * cm
    c = pierce - a2 * R * cm                                       # le haut du cercle passe par le lobe
    t = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    P = c + (np.cos(t)[:, None] * a1 + np.sin(t)[:, None] * a2) * R * cm
    return sweep(P, circle(r * cm, 10), closed=True, up=np.cross(a1, a2))


def pearl(h, side, lobe):
    cm = h.cm
    _, i = h.tree.query(lobe); n = h.N[i]
    front = np.array([side * 0.35, -0.1, 1.0]); front /= np.linalg.norm(front)
    c = lobe + (n * 0.75 + front * 0.25) * 0.34 * cm
    u, v = np.meshgrid(np.linspace(0, np.pi, 12), np.linspace(0, 2 * np.pi, 20, endpoint=False), indexing='ij')
    d = np.stack([np.sin(u) * np.cos(v), np.cos(u), np.sin(u) * np.sin(v)], -1).reshape(-1, 3)
    P = c + d * 0.27 * cm
    idx = []
    for a in range(11):
        for b in range(20):
            p, q, r_, s = a * 20 + b, a * 20 + (b + 1) % 20, (a + 1) * 20 + b, (a + 1) * 20 + (b + 1) % 20
            idx += [(p, r_, q), (q, r_, s)]
    I = np.array(idx)
    return P, d, np.zeros((len(P), 2)), orient(P, d, I)


def build(style):
    h = Head(); glb = Glb(root=f'earrings-{style}')
    if style == 'hoops':
        mat = glb.material('gold', color=(0.98, 0.74, 0.36, 1), metal=1.0, rough=0.16)
    else:
        mat = glb.material('pearl', color=(0.93, 0.9, 0.85, 1), rough=0.22,
                           ext={'KHR_materials_iridescence': {'iridescenceFactor': 0.55, 'iridescenceIor': 1.6,
                                                               'iridescenceThicknessMinimum': 250, 'iridescenceThicknessMaximum': 420},
                                'KHR_materials_clearcoat': {'clearcoatFactor': 0.6, 'clearcoatRoughnessFactor': 0.1}})
    m = Mesh()
    # lobe gauche : point le plus bas du pavillon ; lobe droit : sommet de l'oreille droite le plus
    # proche du symetrique du gauche (la detection directe tombait a l'arriere du pavillon droit)
    left = h.ears[0]['lobe']
    mirror = left.copy(); mirror[0] = 2 * h.eye_mid[0] - left[0]
    ear_r = h.V[(h.V[:, 0] - h.eye_mid[0]) < -6 * h.cm]
    right = ear_r[np.argmin(np.linalg.norm(ear_r - mirror, axis=1))]
    for side, lobe in ((1, left), (-1, right)):
        m.add(*(hoop if style == 'hoops' else pearl)(h, side, lobe))
    tris = glb.mesh('earrings', m, mat)
    P = np.vstack(m.P)
    from glasses import EXPRESSIONS
    from scipy.spatial import cKDTree
    lobes = np.array([left, right])
    away = cKDTree(lobes).query(P)[0] > 0.6 * h.cm                    # hors percage (epaisseur du lobe)
    deg = {}
    for ex, w in EXPRESSIONS.items():
        V = h.posed(w); d, _ = cKDTree(V).query(P); cand = (d < 0.3 * h.cm) & away
        deg[ex] = int(h.inside(P[cand], V).sum()) if cand.any() else 0
    out = os.path.join((os.environ.get('QE_ACC_OUT') or os.path.join(PROTO, 'models', 'accessories')), f'earrings-{style}.glb')
    stats = {'style': style, 'triangles': tris, 'dans_la_tete_hors_percage': deg}
    stats['octets'] = glb.save(out, extras={'accessory': 'earrings', 'style': style, 'attach': 'Head'})
    json.dump(stats, open(out.replace('.glb', '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    for s in (sys.argv[1:] or ['hoops', 'pearls']): build(s)
