"""Lunettes procedurales ajustees au visage ICT du personnage.

    python tools/accessories/glasses.py acetate      # monture epaisse en acetate ecaille
    python tools/accessories/glasses.py metal        # monture fine en metal noir mat, plaquettes

Construction en centimetres dans un repere centre entre les yeux, puis passage dans l'espace
du modele : face de la monture galbee (cambrure) et inclinee (pantoscopique), verres dans la
rainure des cercles, pont pose sur l'arete du nez (lancer de rayon sur la peau), branches
qui longent les tempes a distance constante de la peau puis plongent derriere l'oreille.
Controle de degagement : distance signee monture / peau et cils pour le neutre et les
expressions extremes (sourcils leves, sourire, surprise, yeux fermes).

Sortie : models/accessories/glasses-<style>.glb (+ .json : mesures).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Glb, Mesh, circle, fbm, rounded_rect, sweep, smooth, resample, PROTO   # noqa: E402
from head import Head                                                                     # noqa: E402

STYLES = {
    'acetate': dict(name='Acétate écaille', lens_w=5.2, lens_h=4.0, n=3.4, lift=0.07, bridge=1.95, y_c=0.15,
                    nasal=0.9, rim_w=0.58, rim_d=0.44, temple_h=(0.62, 0.36), temple_t=0.32, wrap=0.016, tilt=9, z0=3.24),
    'metal': dict(name='Métal fin noir mat', lens_w=4.95, lens_h=4.15, n=2.35, lift=0.03, bridge=2.0, y_c=0.1,
                  nasal=0.35, rim_r=0.12, temple_r=0.095, wrap=0.014, tilt=8, z0=3.15),
}
EXPRESSIONS = {
    'neutre': {},
    'sourcils leves': {'browInnerUpLeft': 1, 'browInnerUpRight': 1, 'browOuterUpLeft': 1, 'browOuterUpRight': 1},
    'sourire': {'mouthSmileLeft': 1, 'mouthSmileRight': 1, 'cheekSquintLeft': 1, 'cheekSquintRight': 1, 'eyeSquintLeft': 1, 'eyeSquintRight': 1},
    'surprise': {'eyeWideLeft': 1, 'eyeWideRight': 1, 'browInnerUpLeft': 1, 'browInnerUpRight': 1, 'jawOpen': 0.6},
    'yeux fermes': {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1},
}


class Frame:
    def __init__(self, head, st):
        self.h, self.st, self.cm = head, st, head.cm

    def W(self, p):                                   # cm (repere des yeux) -> espace du modele
        return self.h.eye_mid + np.asarray(p) * self.cm

    def z(self, x, y):                                # face de la monture : cambree et inclinee
        st = self.st
        return st['z0'] - st['wrap'] * x ** 2 + (y - st['y_c']) * np.tan(np.radians(st['tilt']))

    def rim(self, side, m=180):
        """Contour d'un verre (superellipse, angle exterieur haut releve), dans le plan de face."""
        st = self.st
        a, b, n = st['lens_w'] / 2, st['lens_h'] / 2, st['n']
        t = np.linspace(0, 2 * np.pi, m, endpoint=False)
        x = a * np.sign(np.cos(t)) * np.abs(np.cos(t)) ** (2 / n)
        y = b * np.sign(np.sin(t)) * np.abs(np.sin(t)) ** (2 / n)
        y += st['lift'] * x * (y > 0)                                     # coin exterieur haut releve
        # decoupe nasale : le coin bas cote nez s'ecarte et remonte pour degager les flancs du nez
        nasal = np.clip(-x / a, 0, 1) ** 1.5 * np.clip(-y / b, 0, 1) ** 1.2
        x = x + st.get('nasal', 0.0) * nasal
        y = y + 0.3 * st.get('nasal', 0.0) * nasal
        cx = side * (st['bridge'] / 2 + a)
        X = cx + side * x; Y = st['y_c'] + y
        P = np.stack([X, Y, self.z(X, Y)], 1)
        if side < 0: P = P[::-1]                                          # meme sens de parcours a l'ecran
        return P

    def front_normal(self, P):
        st = self.st
        dzdx = -2 * st['wrap'] * P[:, 0]; dzdy = np.tan(np.radians(st['tilt']))
        n = np.stack([-dzdx, -np.full(len(P), dzdy), np.ones(len(P))], 1)
        return n / np.linalg.norm(n, axis=1, keepdims=True)


def lens_mesh(fr, rim, inset):
    """Verre : disque triangule dans le contour, legerement en retrait dans la rainure."""
    c = rim.mean(0)
    ring = c + (rim - c) * (1 - inset)
    rings = [c + (ring - c) * s for s in np.linspace(0, 1, 7)[1:]]
    P = np.vstack([c[None]] + rings)
    P[:, 2] = fr.z(P[:, 0], P[:, 1]) - 0.02
    m = len(rim); idx = [(0, 1 + j, 1 + (j + 1) % m) for j in range(m)]
    for r in range(5):
        a, b = 1 + r * m, 1 + (r + 1) * m
        for j in range(m):
            j2 = (j + 1) % m
            idx += [(a + j, b + j, b + j2), (a + j, b + j2, a + j2)]
    N = fr.front_normal(P)
    UV = (P[:, :2] - P[:, :2].min(0)) / np.ptp(P[:, :2], axis=0)
    return fr.W(P), N, UV, np.array(idx)


def side_surface(h, y, z, side, inside=False):
    """x de la peau du cote `side` (cm, repere des yeux), ou None. inside : rayon tire depuis
    l'interieur du crane vers l'exterieur (la surface du crane, pas le pavillon de l'oreille)."""
    if inside:
        hit = h.ray(h.eye_mid + np.array([0, y, z]) * h.cm, [side, 0, 0])
    else:
        hit = h.ray(h.eye_mid + np.array([side * 20, y, z]) * h.cm, [-side, 0, 0])
    return None if hit is None else (hit[0] - h.eye_mid[0]) / h.cm


def temple_path(fr, side, start):
    """Branche : de la charniere le long de la tempe, par-dessus le haut de l'oreille, puis
    derriere l'oreille contre le crane. Distance a la peau mesuree depuis le crane."""
    h, cm = fr.h, fr.cm
    ear = h.ears[0 if side > 0 else 1]
    rel = lambda p: (p - h.eye_mid) / cm
    top, front = rel(ear['top']), rel(ear['front'])
    y_over = top[1] + 0.3                                              # juste au-dessus de l'helix
    pts = []
    zs = np.linspace(start[2] - 0.5, top[2], 30)
    for z in zs:
        u = (start[2] - 0.5 - z) / (start[2] - 0.5 - top[2])
        y = start[1] + (y_over - start[1]) * np.clip(u * 1.4, 0, 1) ** 0.9
        s = side_surface(h, y, z, side, inside=z < front[2] + 0.8)
        x = side * max(abs(start[0]) * (1 - u) + (abs(s) + 0.4) * u if s is not None else abs(start[0]), (abs(s) + 0.4) if s is not None else 0)
        pts.append([x, y, z])
    for dy, dz in [(-0.45, -1.0), (-1.3, -1.7), (-2.3, -2.05), (-3.1, -2.15)]:   # plongee derriere l'oreille
        y, z = y_over + dy, top[2] + dz
        s = side_surface(h, y, z, side, inside=True)
        pts.append([side * ((abs(s) + 0.3) if s is not None else abs(pts[-1][0])), y, z])
    P = np.vstack([start, pts])
    return smooth(resample(smooth(P, 3), 64), 2)


def tortoise(rng):
    t = fbm((512, 512), rng, octaves=5, base=6)
    s = fbm((512, 512), rng, octaves=3, base=3)
    v = np.clip((t * 0.8 + s * 0.4 - 0.45) * 2.4, 0, 1)
    amber, brown, dark = np.array([186, 118, 52]), np.array([104, 56, 22]), np.array([34, 17, 8])
    c = np.where(v[..., None] < 0.5, amber + (brown - amber) * (v[..., None] * 2), brown + (dark - brown) * (v[..., None] * 2 - 1))
    return Image.fromarray(c.clip(0, 255).astype(np.uint8))


def clearance(h, P_model, extra=None):
    """Par expression : nombre de sommets DANS la tete (parite de rayons, sur les sommets a moins
    de 2 mm de la peau) et distance minimale (cm) des autres a la peau."""
    out = {}
    from scipy.spatial import cKDTree
    for name, w in EXPRESSIONS.items():
        V = h.posed(w); d, _ = cKDTree(V).query(P_model)
        cand = d < 0.2 * h.cm
        n_in = int(h.inside(P_model[cand], V).sum()) if cand.any() else 0
        out[name] = {'dedans': n_in, 'min_cm': round(float(d.min() / h.cm), 3)}
    if extra is not None:
        d, _ = cKDTree(extra).query(P_model)
        out['cils (distance mini)'] = round(float(d.min() / h.cm), 3)
    return out


def build(style):
    st = STYLES[style]; h = Head(); fr = Frame(h, st); rng = np.random.default_rng(7)
    glb = Glb(root=f'glasses-{style}')
    # verres traites antireflet : presque invisibles de face, un reflet net quand la tete tourne
    lens_mat = glb.material('lens', color=(0.93, 0.97, 1.0, 0.035), rough=0.02, blend=True, double=True,
                            ext={'KHR_materials_ior': {'ior': 1.5}, 'KHR_materials_specular': {'specularFactor': 0.55}})
    frame_m, lens_m = Mesh(), Mesh()
    rims = {s: fr.rim(s) for s in (1, -1)}
    if style == 'acetate':
        tex = glb.image(tortoise(rng), 'image/jpeg')
        mat = glb.material('acetate', color=(1, 1, 1, 1), rough=0.32, tex=tex,
                           ext={'KHR_materials_clearcoat': {'clearcoatFactor': 1.0, 'clearcoatRoughnessFactor': 0.06}})
        prof = rounded_rect(st['rim_w'], st['rim_d'], 0.12)
        prof[:, 0] += st['rim_w'] * 0.32                                  # surtout a l'exterieur du verre
        for s, R in rims.items():
            Bn = fr.front_normal(R); T = np.roll(R, -1, 0) - np.roll(R, 1, 0); T /= np.linalg.norm(T, axis=1, keepdims=True)
            Nn = np.cross(T, Bn); c = R.mean(0)
            # repere direct garde ; si N pointe vers l'interieur, profil miroir (ordre inverse : reste trigo)
            p_s = prof if np.einsum('ij,ij->i', Nn, R - c).mean() > 0 else (prof * [-1, 1])[::-1]
            pos, nor, uv, I = sweep(R, p_s, closed=True, frame=(Nn, Bn), u_scale=0.35)
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        # pont plein, pose sur l'arete du nez
        inner = {s: rims[s][np.argmin(np.abs(rims[s][:, 0]) + 3 * np.abs(rims[s][:, 1] - (st['y_c'] + 0.75)))] for s in (1, -1)}
        xs = np.linspace(inner[-1][0], inner[1][0], 20)
        B = np.stack([xs, np.full_like(xs, st['y_c'] + 0.6), fr.z(xs, st['y_c'] + 0.6) + 0.04], 1)
        pos, nor, uv, I = sweep(B, rounded_rect(0.62, st['rim_d'], 0.14), up=(0, 0, 1), u_scale=0.35)   # hauteur 0,62 x profondeur
        frame_m.add(h.eye_mid + pos * h.cm, nor, uv + [0.37, 0.0], I)
        th0, th1 = st['temple_h']
        temple_prof = lambda: rounded_rect(st['temple_t'], 1.0, 0.12)
    else:
        mat = glb.material('metal', color=(0.045, 0.045, 0.05, 1), metal=0.55, rough=0.42)   # noir mat : se lit a la taille d'une carte
        tip_mat = glb.material('temple-tips', color=(0.10, 0.07, 0.05, 1), rough=0.35)
        tips = Mesh()
        for s, R in rims.items():
            pos, nor, uv, I = sweep(R, circle(st['rim_r'], 10), closed=True, up=(0, 0, 1))
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        # pont en arc au-dessus du nez, et plaquettes sur les flancs du nez
        top_in = {s: rims[s][np.argmin(np.abs(rims[s][:, 0]) + 2 * np.abs(rims[s][:, 1] - (st['y_c'] + 1.2)))] for s in (1, -1)}
        xs = np.linspace(top_in[-1][0], top_in[1][0], 24)
        ys = st['y_c'] + 1.2 + 0.28 * np.cos(np.pi * xs / (xs[-1] - xs[0]))
        Bp = np.stack([xs, ys, fr.z(xs, ys) + 0.05], 1)
        pos, nor, uv, I = sweep(Bp, circle(st['rim_r'] * 0.95, 10), up=(0, 0, 1))
        frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        for s in (1, -1):
            hit = h.ray(h.eye_mid + np.array([s * 0.62, -0.75, 20]) * h.cm, [0, 0, -1])
            pad = (hit - h.eye_mid) / h.cm; nrm = np.array([s * 0.8, 0.1, 0.6]); nrm /= np.linalg.norm(nrm)
            pad = pad + nrm * 0.26
            disc = np.array([pad - nrm * 0.045, pad + nrm * 0.045])               # plaquette : ovale plein, epaisseur 0,9 mm
            oval = circle(1.0, 16) * [0.36, 0.2]
            pos, nor, uv, I = sweep(resample(disc, 3), oval, up=(0, 1, 0))
            lens_m.add(h.eye_mid + pos * h.cm, nor, uv, I)                 # plaquette transparente
            arm = np.array([pad + np.array([0, 0.25, 0.1]), pad + np.array([0, 0.45, 0.45]), rims[s][np.argmin(np.linalg.norm(rims[s] - (pad + [s * 0.4, 0.4, 0.6]), axis=1))]])
            pos, nor, uv, I = sweep(smooth(resample(arm, 12), 2), circle(0.045, 8), up=(0, 0, 1))
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        temple_prof = None
    # charnieres et branches
    stats = {}
    for s, R in rims.items():
        ends = R[np.argsort(-s * R[:, 0])[:12]]
        hinge = ends[np.argmax(ends[:, 1])] + np.array([s * 0.15, -0.35, -0.25])
        P = temple_path(fr, s, hinge)
        if style == 'acetate':
            n = len(P); u = np.linspace(0, 1, n)
            hh = th0 + (th1 - th0) * np.clip(u * 2.2, 0, 1)
            pos, nor, uv, I = sweep(P, rounded_rect(st['temple_t'], 1.0, 0.12), up=(0, 1, 0), scale=np.stack([np.ones(n), hh], 1), u_scale=0.35)
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
            blk = np.array([R[np.argmax(s * R[:, 0])] + [0, 0.3, 0], hinge + [s * 0.05, 0, 0.05]])
            pos, nor, uv, I = sweep(resample(blk, 6), rounded_rect(0.5, 0.75, 0.12), up=(0, 1, 0), u_scale=0.35)
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        else:
            cut = int(len(P) * 0.7)
            pos, nor, uv, I = sweep(P[:cut + 1], circle(st['temple_r'], 8), up=(0, 1, 0))
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
            pos, nor, uv, I = sweep(P[cut:], circle(st['temple_r'] * 1.9, 10), up=(0, 1, 0))
            tips.add(h.eye_mid + pos * h.cm, nor, uv, I)
            blk = np.array([R[np.argmax(s * R[:, 0])], hinge])
            pos, nor, uv, I = sweep(resample(blk, 6), circle(st['rim_r'] * 1.25, 10), up=(0, 1, 0))
            frame_m.add(h.eye_mid + pos * h.cm, nor, uv, I)
        pos, nor, uv, I = lens_mesh(fr, R, 0.012 if style == 'metal' else -0.02)   # bord du verre cache dans le cercle
        lens_m.add(pos, nor, uv, I)
    tris = glb.mesh('frame', frame_m, mat)
    if style == 'metal': tris += glb.mesh('temple-tips', tips, tip_mat)
    tris += glb.mesh('lenses', lens_m, lens_mat)
    allP = np.vstack(frame_m.P + lens_m.P)
    lashes = Head(materials=('lashes',), landmarks=False).V
    stats = {'style': style, 'nom': st['name'], 'triangles': tris, 'degagement_cm': clearance(h, allP, lashes),
             'largeur_face_cm': round(float(np.ptp(allP[:, 0]) / h.cm), 2)}
    out = os.path.join(PROTO, 'models', 'accessories', f'glasses-{style}.glb')
    stats['octets'] = glb.save(out, extras={'accessory': 'glasses', 'style': style, 'attach': 'Head'})
    json.dump(stats, open(out.replace('.glb', '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    for s in (sys.argv[1:] or list(STYLES)): build(s)
