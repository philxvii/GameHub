"""Barbe courte et moustache en cartes de poils, enracinees sur la peau ICT du personnage.

    python tools/accessories/beard.py beard        # barbe courte (joues basses, menton, machoire)
    python tools/accessories/beard.py moustache    # moustache seule
    python tools/accessories/beard.py full         # barbe + moustache

Meme methode que tools/hair/gen_cards.py (cartes texturees, alpha teste, teinte racine ->
pointe), a l'echelle des poils de barbe. Les regions viennent du visage : centre de la bouche
(maillage de l'interieur), ellipse des levres laissee nue, base du nez, ligne de joue du flanc
du nez au lobe ; densite fondue sur les bords.

Chaque carte suit la peau pendant les expressions : elle recoit les deltas de sa racine
(interpoles sur les 3 sommets de peau les plus proches) pour chaque expression qui deplace la
zone ; le moteur les pilote par leur nom ARKit (js/rig.js les trouve seul). La machoire
suit l'os Head a 100 % : l'accessoire, rattache a Head, reste colle.

Sortie : models/accessories/<style>.glb (+ .json : mesures, degagement).
"""
import json
import os
import sys

import cv2
import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Glb, Mesh, PROTO                                    # noqa: E402
from head import Head                                                  # noqa: E402

ROOT_RGB = np.array([64, 45, 32]) / 255            # racines brun fonce
TIP_RGB = np.array([132, 98, 70]) / 255            # pointes plus claires (barbe brune de character-01)
STYLES = {
    'beard': dict(name='Barbe courte', parts=('beard',)),
    'moustache': dict(name='Moustache', parts=('moustache',)),
    'full': dict(name='Barbe et moustache', parts=('beard', 'moustache')),
}
PARTS = {   # nombre de cartes, longueur (cm), largeur racine / pointe (cm), segments, decollement
    'beard': dict(n=9500, length=(0.55, 1.0), width=(0.1, 0.03), seg=3, lift=0.2),
    'moustache': dict(n=2600, length=(0.7, 1.15), width=(0.1, 0.03), seg=4, lift=0.14),
}


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


class Face:
    """Reperes du bas du visage, en cm dans le repere des yeux."""

    def __init__(self, h):
        self.h = h
        self.R = (h.V - h.eye_mid) / h.cm
        mouth = Head(materials=('mouth',), landmarks=False).V
        self.mouth = (mouth.mean(0) - h.eye_mid) / h.cm
        mr = (mouth - h.eye_mid) / h.cm
        self.mouth_w = np.ptp(mr[:, 0]) / 2                              # demi-largeur de la bouche
        self.nose = (h.nose_tip - h.eye_mid) / h.cm
        self.lobes = [(e['lobe'] - h.eye_mid) / h.cm for e in h.ears]
        self.ear_front = [(e['front'] - h.eye_mid) / h.cm for e in h.ears]

    def density(self, part, P, Nn):
        """Densite 0..1 de la pilosite par point de peau (P, normales Nn, cm)."""
        x, y, z = P[:, 0] - self.mouth[0], P[:, 1], P[:, 2]
        my, mw = self.mouth[1], self.mouth_w
        # levres laissees nues : ellipse centree sur la bouche
        ry = np.where(y > my, 0.62, 1.15)                               # levre du haut fine, du bas plus pleine
        lips = ((x / (mw + 0.4)) ** 2 + ((y - my) / ry) ** 2) < 1.0
        front = Nn[:, 2] > -0.35
        if part == 'moustache':
            # arc le long de la levre superieure : epais au milieu, s'affine vers les commissures
            top = self.nose[1] - 0.8                                    # sous les narines
            u = np.clip(np.abs(x) / (mw + 0.4), 0, 1)
            lip = my + 0.62 - 0.45 * u ** 2                             # bord bas de la moustache (suit la levre)
            upper = top + 0.05 - 0.5 * u ** 2                           # bord haut, qui descend vers les coins
            d = smoothstep(upper + 0.1, upper - 0.25, y) * smoothstep(lip - 0.05, lip + 0.3, y)
            d *= smoothstep(1.0, 0.75, u) * (1 - 0.45 * u)
            return d * front * ~lips
        # barbe : sous la ligne de joue (du flanc du nez vers le lobe), au-dessus de la gorge
        side = np.sign(x)
        lobe_y = np.where(side > 0, self.lobes[0][1], self.lobes[1][1])
        lobe_z = np.where(side > 0, self.lobes[0][2], self.lobes[1][2])
        t = np.clip((self.nose[2] - z) / (self.nose[2] - lobe_z), 0, 1)   # 0 au nez, 1 au lobe
        cheek = (self.nose[1] - 1.3) + (lobe_y - 0.6 - (self.nose[1] - 1.3)) * t
        d = smoothstep(cheek + 0.2, cheek - 0.9, y)
        d *= smoothstep(my - 6.2, my - 4.6, y)                         # s'arrete sous la machoire
        d *= smoothstep(lobe_z + 0.3, lobe_z + 1.6, z)                 # pas derriere le lobe
        d *= ~((np.abs(x) < mw + 0.3) & (y > my + 0.2))                # la moustache est a part
        return d * front * ~lips


def roots(h, face, part, n, rng):
    """Racines tirees sur les triangles de peau, ponderees par aire x densite."""
    V, F, N = h.V, h.F, h.N
    tri = V[F]; area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    cen = (tri.mean(1) - h.eye_mid) / h.cm
    nc = N[F].mean(1); nc /= np.linalg.norm(nc, axis=1, keepdims=True)
    w = area * face.density(part, cen, nc)
    p = w / w.sum()
    t = rng.choice(len(F), n, p=p)
    r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
    bc = np.stack([1 - s, s * (1 - r2), s * r2], 1)
    P = np.einsum('nk,nkd->nd', bc, V[F[t]])
    Nn = np.einsum('nk,nkd->nd', bc, N[F[t]]); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    dens = face.density(part, (P - h.eye_mid) / h.cm, Nn)
    return P, Nn, dens


def strands(h, face, part, rng):
    pr = PARTS[part]; cm = h.cm
    P0, N0, dens = roots(h, face, part, pr['n'], rng)
    n, m = len(P0), pr['seg'] + 1
    R0 = (P0 - h.eye_mid) / cm
    L = rng.uniform(*pr['length'], n) * (0.55 + 0.45 * dens) * cm       # plus courts en bordure
    # peignage : vers le bas le long de la peau ; moustache vers le bas et vers l'exterieur
    want = np.tile([0.0, -1.0, 0.25], (n, 1))
    if part == 'moustache': want[:, 0] = np.sign(R0[:, 0] - face.mouth[0]) * 0.9
    else: want[:, 0] = np.sign(R0[:, 0] - face.mouth[0]) * 0.15
    want += rng.normal(0, 0.28, (n, 3))
    d = want - N0 * np.einsum('ij,ij->i', want, N0)[:, None]
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    lift = pr['lift'] * rng.uniform(0.6, 1.4, n)
    pts = np.zeros((n, m, 3)); pts[:, 0] = P0 + N0 * 0.012 * cm
    tree = cKDTree(h.V)
    for k in range(1, m):
        t = k / (m - 1)
        step = (d * (1 - lift[:, None] * (1 - t)) + N0 * lift[:, None] * (1 - t) * 1.2)
        step /= np.linalg.norm(step, axis=1, keepdims=True)
        bend = rng.normal(0, 0.18, (n, 3)) * t                          # poil frise, pas une aiguille
        pts[:, k] = pts[:, k - 1] + (step + bend) * (L / (m - 1))[:, None]
        # garde le poil hors de la peau (au moins 0,06 cm, plus vers la pointe)
        _, nn = tree.query(pts[:, k])
        sd = np.einsum('ij,ij->i', pts[:, k] - h.V[nn], h.N[nn])
        need = (0.06 + 0.12 * t) * cm
        low = sd < need
        pts[low, k] += h.N[nn][low] * (need - sd[low])[:, None]
    return pts, N0, dens, P0


def cards(h, pts, N0, dens, part, rng):
    pr = PARTS[part]; cm = h.cm
    n, m = pts.shape[:2]
    tang = np.gradient(pts, axis=1); tang /= np.linalg.norm(tang, axis=2, keepdims=True) + 1e-9
    nrm = np.repeat(N0[:, None], m, 1)
    wdir = np.cross(tang, nrm); wdir /= np.linalg.norm(wdir, axis=2, keepdims=True) + 1e-9
    twist = rng.normal(0, 0.6, (n, 1, 1))
    wdir = wdir * np.cos(twist) + nrm * np.sin(twist)
    t = np.linspace(0, 1, m)[None, :, None]
    w = (pr['width'][0] + (pr['width'][1] - pr['width'][0]) * t) * cm * rng.uniform(0.8, 1.2, (n, 1, 1))
    P = np.stack([pts - wdir * w / 2, pts + wdir * w / 2], 2).reshape(-1, 3)
    Nm = np.repeat(nrm, 2, axis=1).reshape(-1, 3)
    col = rng.integers(0, 4, n); u0 = col / 4
    U = np.stack([np.repeat(u0[:, None], m, 1), np.repeat(u0[:, None] + 0.25, m, 1)], 2).reshape(-1)
    Vv = np.broadcast_to(t[..., 0][..., None], (n, m, 2)).reshape(-1)
    shade = rng.uniform(0.8, 1.15, n)[:, None]
    rgb = (ROOT_RGB[None, None] + (TIP_RGB - ROOT_RGB)[None, None] * t ** 0.8) * shade[..., None]
    a = 0.55 + 0.45 * dens                                              # bordures plus clairsemees
    C = np.concatenate([np.repeat(np.clip(rgb, 0, 1) ** 2.2, 2, axis=1).reshape(-1, 3), np.repeat(a[:, None], m * 2, 1).reshape(-1, 1)], 1)
    idx = []; base = (np.arange(n) * m * 2)[:, None]
    for k in range(m - 1):
        a0, b0, c0, d0 = base + 2 * k, base + 2 * k + 1, base + 2 * (k + 1), base + 2 * (k + 1) + 1
        idx += [np.concatenate([a0, c0, b0], 1), np.concatenate([b0, c0, d0], 1)]
    return P, Nm, np.stack([U, Vv], 1), C, np.concatenate(idx, 0)


def texture(seed=11, w=256, h=512):
    """4 colonnes de poils fins, alpha fort au centre, pointes effilees (comme gen_cards.py)."""
    rng = np.random.default_rng(seed)
    a = np.zeros((h, w), np.float32); lum = np.full((h, w), 0.7, np.float32)
    for c in range(4):
        x0, x1 = c * w // 4, (c + 1) * w // 4
        for _ in range(20):                                             # assez de poils pour se lire, la peau passe encore
            x = rng.uniform(x0 + 3, x1 - 3); L = rng.uniform(0.75, 1.0) * h; amp = rng.uniform(0, 4)
            ys = np.arange(int(L)); xs = np.clip((x + amp * np.sin(ys / h * 5 + rng.uniform(0, 6))).astype(int), x0, x1 - 1)
            fade = np.clip(1 - (ys / L) ** 2.5, 0, 1)
            a[ys, xs] = np.maximum(a[ys, xs], fade * rng.uniform(0.8, 1)); lum[ys, xs] = rng.uniform(0.5, 1.0)
    a = cv2.GaussianBlur(a, (3, 1), 0); a = np.clip(a * 1.8, 0, 1)
    u = (np.arange(w) % (w // 4)) / (w // 4); a *= (np.sin(np.pi * u) ** 0.5)[None, :]
    a *= smoothstep(0.0, 0.08, np.arange(h) / h)[:, None]
    g = (np.clip(lum, 0, 1) * 255).astype(np.uint8)
    return np.dstack([g, g, g, (a * 255).astype(np.uint8)])


def morphs(h, P_roots, card_count, m, min_cm=0.1):
    """Deltas des expressions recopies de la peau sur chaque carte (deplacement de sa racine),
    seulement pour les expressions que le jeu pilote (js/expressions.js) et qui deplacent la zone :
    chaque expression gardee coute (sommets x 12 octets) dans le fichier et en memoire GPU."""
    sys.path.insert(0, os.path.join(PROTO, 'tools', 'character-ict'))
    from optimize_character import driven_targets
    driven = driven_targets()
    d, i = cKDTree(h.V).query(P_roots, k=3)
    wts = 1 / (d + 1e-6); wts /= wts.sum(1, keepdims=True)
    names, targets = [], []
    for ti, name in enumerate(h.target_names):
        if name not in driven: continue
        delta = np.einsum('nk,nkd->nd', wts, h.T[ti][i])                 # (cartes, 3)
        if np.abs(delta).max() < min_cm * h.cm: continue                  # expression sans effet ici
        names.append(name); targets.append(np.repeat(delta, m * 2, axis=0))
    return names, targets


def clearance(h, P, names, targets, m):
    """Corps des poils (racines exclues : elles sortent de la peau) dans la tete, pour les
    expressions extremes, cartes deformees comme la peau."""
    from glasses import EXPRESSIONS
    out = {}
    body = (np.arange(len(P)) % (m * 2)) >= 2                            # tout sauf la rangee de la racine
    for ex, w in EXPRESSIONS.items():
        V = h.posed(w); Q = P.copy()
        for k, v in w.items():
            if k in names: Q += v * targets[names.index(k)]
        Q = Q[body]
        dist, _ = cKDTree(V).query(Q)
        cand = np.where(dist < 0.04 * h.cm)[0]
        sample = cand[:: max(1, len(cand) // 1500)]                     # echantillon des plus proches
        n_in = int(h.inside(Q[sample], V).sum()) if len(sample) else 0
        out[ex] = {'proches': int(len(cand)), 'dedans_echantillon': f'{n_in}/{len(sample)}'}
    return out


def build(style):
    st = STYLES[style]; h = Head(); face = Face(h); rng = np.random.default_rng(23)
    glb = Glb(root=style)
    tex = glb.image(texture(), 'image/png')
    mat = glb.material('facial-hair', color=(1, 1, 1, 1), rough=0.8, tex=tex, double=True, mask=0.35,
                       ext={'KHR_materials_specular': {'specularFactor': 0.1}})
    stats = {'style': style, 'nom': st['name'], 'parties': {}}
    for part in st['parts']:
        pts, N0, dens, P0 = strands(h, face, part, rng)
        P, Nm, UV, C, I = cards(h, pts, N0, dens, part, rng)
        names, targets = morphs(h, P0, len(P0), pts.shape[1])
        mesh = Mesh().add(P, Nm, UV, I)
        tris = glb.mesh(part, mesh, mat, targets=targets, target_names=names, colors=C)
        stats['parties'][part] = {'cartes': len(P0), 'triangles': tris, 'expressions': len(names),
                                  'degagement': clearance(h, P, names, targets, pts.shape[1])}
    out = os.path.join(PROTO, 'models', 'accessories', f'{style}.glb')
    stats['octets'] = glb.save(out, extras={'accessory': 'facial-hair', 'style': style, 'attach': 'Head'}, vp=12)   # 12 bits : 0,03 mm sur la zone
    json.dump(stats, open(out.replace('.glb', '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    for s in (sys.argv[1:] or ['full']): build(s)
