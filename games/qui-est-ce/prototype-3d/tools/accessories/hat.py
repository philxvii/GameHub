"""Casquette ajustee a la tete ET a la coiffure du personnage.

    python tools/accessories/hat.py [models/hair/hair-curly-v41.glb]

La calotte suit l'enveloppe exterieure de la coiffure (cartes de cheveux au-dessus du bandeau)
plus un jeu de 2,5 mm : aucune boucle ne peut la traverser ; sous le bandeau, les boucles
depassent naturellement. Six panneaux (coutures et surpiqures dans la texture), bandeau
roule, visiere galbee, bouton au sommet. Coton : rugosite haute + reflet de tissu
(KHR_materials_sheen). Controle : sommets de la casquette dans la tete (5 expressions) et
cartes de cheveux qui sortent de la calotte au-dessus du bandeau.

Sortie : models/accessories/cap.glb (+ .json).
"""
import json
import os
import sys

import numpy as np
import pygltflib as G
from scipy.ndimage import gaussian_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Glb, Mesh, PROTO, fbm, orient          # noqa: E402
from head import Head, _reader                            # noqa: E402

FABRIC = np.array([155, 59, 42])          # rouge brique : se lit sur des cheveux sombres
STITCH = np.array([226, 196, 160])


def hair_points(path):
    g = G.GLTF2().load(path); arr = _reader(g)
    return np.vstack([arr(p.attributes.POSITION) for m in g.meshes for p in m.primitives])


def band_y(h, az):
    """Hauteur du bord du bandeau (cm, repere des yeux) selon l'azimut : front haut, nuque basse."""
    a = np.abs(az)
    return np.interp(a, [0, 60, 100, 140, 180], [4.1, 3.6, 1.9, 0.7, 0.2])


def build(hair_path):
    h = Head(); cm = h.cm
    centre = h.eye_mid + np.array([0, 4.0, -7.6]) * cm                 # centre approximatif de la boite cranienne
    H = hair_points(hair_path)
    rel = lambda P: (P - h.eye_mid) / cm
    # grille (azimut, elevation) sur la calotte ; rayon = enveloppe (cheveux et peau) + jeu
    na, ne = 96, 40
    az = np.linspace(-180, 180, na, endpoint=False)
    el = np.linspace(-40, 90, ne)
    def dirs(A, E):
        A, E = np.radians(A), np.radians(E)
        return np.stack([np.sin(A) * np.cos(E), np.sin(E), np.cos(A) * np.cos(E)], -1)
    D = dirs(*np.meshgrid(az, el, indexing='xy'))                         # (ne, na, 3)
    # Calotte : un dome lisse ajuste au CRANE (peau), plus l'epaisseur de cheveux tasses (1,1 cm).
    # Suivre l'enveloppe des boucles donnait un sac bossele : une casquette comprime les cheveux.
    raw = np.zeros((ne, na))
    v = h.V - centre; r = np.linalg.norm(v, axis=1); u = v / r[:, None]
    a_ = np.degrees(np.arctan2(u[:, 0], u[:, 2])); e_ = np.degrees(np.arcsin(np.clip(u[:, 1], -1, 1)))
    ia = np.clip(np.round((a_ + 180) / 360 * na).astype(int) % na, 0, na - 1)
    ie = np.clip(np.round((e_ + 40) / 130 * (ne - 1)).astype(int), 0, ne - 1)
    np.maximum.at(raw, (ie, ia), r)
    for _ in range(8):
        z = raw == 0
        if not z.any(): break
        pad = np.pad(raw, 1, mode='edge'); pad[1:-1, 0], pad[1:-1, -1] = raw[:, -1], raw[:, 0]
        nb = np.maximum.reduce([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]]); raw[z] = nb[z]
    env = gaussian_filter(raw, (3.0, 4.0), mode=('nearest', 'wrap')) + 1.1 * cm
    env = np.maximum(env, raw + 0.9 * cm)
    env = gaussian_filter(env, (1.2, 1.6), mode=('nearest', 'wrap'))
    P = centre + D * env[..., None]
    # bord du bandeau : on coupe la calotte a band_y(azimut), relatif aux yeux
    Prel = rel(P.reshape(-1, 3)).reshape(P.shape)
    by = band_y(h, az)[None, :]
    keep_rows = []
    crown = []
    for j in range(na):                                                  # par meridien, du bandeau au sommet
        col = Prel[:, j]; ys = col[:, 1]
        k0 = np.searchsorted(ys, by[0, j]) if np.all(np.diff(ys) > 0) else int(np.argmax(ys > by[0, j]))
        k0 = max(1, min(k0, ne - 2))
        t = (by[0, j] - ys[k0 - 1]) / max(ys[k0] - ys[k0 - 1], 1e-9)
        start = col[k0 - 1] + (col[k0] - col[k0 - 1]) * np.clip(t, 0, 1)
        pts = np.vstack([start, col[k0:]])
        # reechantillonne chaque meridien en 24 points (du bandeau au sommet)
        L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
        s = np.linspace(0, L[-1], 24)
        crown.append(np.stack([np.interp(s, L, pts[:, i]) for i in range(3)], 1))
    C = np.stack(crown, 1)                                                # (24, na, 3), cm
    C[-1] = C[-1].mean(0)                                                # sommet unique
    Cw = h.eye_mid + C * cm
    # maillage de la calotte (double epaisseur : exterieur + interieur decale)
    m = Mesh(); n_r, n_c = C.shape[:2]
    def grid(Pw, flip):
        Nn = np.zeros_like(Pw)
        du = np.roll(Pw, -1, 1) - np.roll(Pw, 1, 1); dv = np.gradient(Pw, axis=0)
        Nn = np.cross(du, dv) * (-1 if flip else 1)
        Nn /= np.linalg.norm(Nn, axis=2, keepdims=True) + 1e-12
        out = (Pw - centre); Nn *= np.sign(np.einsum('ijk,ijk->ij', Nn, out))[..., None] * (-1 if flip else 1)
        uv = np.stack(np.meshgrid(np.arange(n_c) / n_c * 6, np.linspace(0, 1, n_r)), -1)    # 6 panneaux
        idx = []
        for i in range(n_r - 1):
            for j in range(n_c):
                a, b, c, d = i * n_c + j, i * n_c + (j + 1) % n_c, (i + 1) * n_c + j, (i + 1) * n_c + (j + 1) % n_c
                idx += [(a, c, b), (b, c, d)]
        return Pw.reshape(-1, 3), Nn.reshape(-1, 3), uv.reshape(-1, 2), np.array(idx)
    pos, nor, uv, I = grid(Cw, False); m.add(pos, nor, uv, orient(pos, nor, I))
    inner = Cw - (Cw - centre) / np.linalg.norm(Cw - centre, axis=2, keepdims=True) * 0.18 * cm
    pos, nor, uv, I = grid(inner, True); m.add(pos, nor, uv * [1, 0.02], orient(pos, nor, I))
    # bandeau roule (tube le long du bord)
    from common import sweep, circle, smooth
    rim = smooth(Cw[0], 3, closed=True)
    pos, nor, uvb, I = sweep(rim, circle(0.16 * cm, 8), closed=True, up=(0, 1, 0), u_scale=0.0)
    m.add(pos, nor, uvb * 0 + [0.02, 0.02], I)
    # visiere : surface galbee devant, posee sur le bord avant du bandeau
    front = [j for j in range(n_c) if abs(az[j]) <= 62]
    base = C[0][front]
    vis = []
    for k, dz in enumerate(np.linspace(0, 7.2, 14)):
        f = (dz / 7.2)
        row = base.copy()
        row[:, 2] += dz * np.cos(np.radians(18)); row[:, 1] -= dz * np.sin(np.radians(18)) * 0.55 + 0.35 * f ** 2
        row[:, 0] *= 1 - 0.18 * f                                        # se resserre vers l'avant
        row[:, 1] += 0.55 * (row[:, 0] / max(np.abs(base[:, 0]).max(), 1e-6)) ** 2 * f * -1   # galbe : bords plus bas
        vis.append(row)
    Vz = np.stack(vis)                                                    # (14, nf, 3) cm
    under = Mesh()
    for flip, off in ((False, 0.0), (True, -0.22)):
        Pw = h.eye_mid + (Vz + np.array([0, off, 0])) * cm
        nr, nf = Vz.shape[:2]
        Nn = np.tile([0, -1.0 if flip else 1.0, 0.0], (nr * nf, 1))
        uv = np.stack(np.meshgrid(np.linspace(0, 1, nf), np.linspace(0, 1, nr)), -1).reshape(-1, 2) * [0.02, 0.02]
        idx = []
        for i in range(nr - 1):
            for j in range(nf - 1):
                a, b, c, d = i * nf + j, i * nf + j + 1, (i + 1) * nf + j, (i + 1) * nf + j + 1
                idx += [(a, c, b), (b, c, d)]
        pos = Pw.reshape(-1, 3); (under if flip else m).add(pos, Nn, uv, orient(pos, Nn, np.array(idx)))
    edge = np.vstack([Vz[:, 0], Vz[-1], Vz[::-1, -1]])                    # tranche de la visiere
    pos, nor, uve, I = sweep(h.eye_mid + smooth(edge, 2) * cm, circle(0.11 * cm, 6), up=(0, 1, 0), u_scale=0)
    m.add(pos, nor, uve * 0 + [0.02, 0.02], I)
    # bouton au sommet
    top = C[-1, 0]; k = np.linspace(0, np.pi / 2, 5); a = np.linspace(0, 2 * np.pi, 12, endpoint=False)
    bt = np.array([[0.45 * np.cos(t) * np.cos(b), 0.22 * np.sin(t), 0.45 * np.cos(t) * np.sin(b)] for t in k for b in a]) + top + [0, 0.05, 0]
    btn = h.eye_mid + bt * cm; bn = (bt - top) / (np.linalg.norm(bt - top, axis=1, keepdims=True) + 1e-9)
    idx = [(i * 12 + j, (i + 1) * 12 + j, i * 12 + (j + 1) % 12) for i in range(4) for j in range(12)] + \
          [(i * 12 + (j + 1) % 12, (i + 1) * 12 + j, (i + 1) * 12 + (j + 1) % 12) for i in range(4) for j in range(12)]
    m.add(btn, bn, np.full((len(btn), 2), 0.02), orient(btn, bn, np.array(idx)))
    # texture : coton (bruit fin), 6 coutures doubles surpiquees, bandeau un ton plus sombre
    rng = np.random.default_rng(3)
    T = 512; img = np.ones((T, T, 3)) * FABRIC
    img *= (0.92 + 0.12 * fbm((T, T), rng, 4, 32))[..., None]
    u = (np.arange(T) / T * 6) % 1
    seam = (np.abs(u - 0.5) > 0.485)[None, :]                            # couture au bord de chaque panneau
    img[np.broadcast_to(seam, (T, T))] *= 0.72
    for off in (0.03, 0.97):
        st = (np.abs(u - off) < 0.004)[None, :] & ((np.arange(T) // 6) % 2 == 0)[:, None]
        img[st] = STITCH
    img[: int(T * 0.05)] *= 0.85
    glb = Glb(root='cap')
    tex = glb.image(np.clip(img, 0, 255).astype(np.uint8), 'image/jpeg')
    mat = glb.material('cotton', rough=0.92, tex=tex, double=False,
                       ext={'KHR_materials_sheen': {'sheenColorFactor': [0.35, 0.25, 0.22], 'sheenRoughnessFactor': 0.6}})
    tris = glb.mesh('cap', m, mat)
    under_mat = glb.material('visor-under', color=(0.16, 0.2, 0.17, 1), rough=0.9)          # dessous de visiere vert gris
    tris += glb.mesh('visor-under', under, under_mat)
    # controles
    allP = np.vstack(m.P + under.P)
    from glasses import EXPRESSIONS
    from scipy.spatial import cKDTree
    deg = {}
    for ex, w in EXPRESSIONS.items():
        V = h.posed(w); d, _ = cKDTree(V).query(allP); cand = d < 0.3 * cm
        deg[ex] = int(h.inside(allP[cand], V).sum()) if cand.any() else 0
    hr = rel(H); ha = np.degrees(np.arctan2(hr[:, 0] - 0, hr[:, 2] + 7.6))
    above = hr[:, 1] > band_y(h, ha) + 0.3
    hv = H[above] - centre; hd = np.linalg.norm(hv, axis=1); hu = hv / hd[:, None]
    ca = np.degrees(np.arctan2(hu[:, 0], hu[:, 2])); ce = np.degrees(np.arcsin(np.clip(hu[:, 1], -1, 1)))
    ia = np.round((ca + 180) / 360 * na).astype(int) % na; ie = np.clip(np.round((ce + 40) / 130 * (ne - 1)).astype(int), 0, ne - 1)
    poke = int((hd > env[ie, ia] - 0.05 * cm).sum())
    # Coiffure sous la casquette : on retire les cartes dont la racine est sous la calotte
    # (cachees) et celles qui en sortiraient au-dessus du bandeau ; les boucles sous le bandeau restent.
    VPC = 26
    cards_r = hr.reshape(-1, VPC, 3); n_cards = len(cards_r)
    cv = H.reshape(-1, VPC, 3) - centre; cd = np.linalg.norm(cv, axis=2); cu = cv / cd[..., None]
    ca2 = np.degrees(np.arctan2(cu[..., 0], cu[..., 2])); ce2 = np.degrees(np.arcsin(np.clip(cu[..., 1], -1, 1)))
    ia2 = np.round((ca2 + 180) / 360 * na).astype(int) % na; ie2 = np.clip(np.round((ce2 + 40) / 130 * (ne - 1)).astype(int), 0, ne - 1)
    az2 = np.degrees(np.arctan2(cards_r[..., 0], cards_r[..., 2] + 7.6))
    above2 = cards_r[..., 1] > band_y(h, az2) - 0.2
    root_under = above2[:, :2].all(1)
    pokes = (above2 & (cd > env[ie2, ia2] - 0.1 * cm)).any(1)
    keep = ~(root_under | pokes)
    mask_path = os.path.join(PROTO, 'build', 'opt', 'cap-hair-keep.npy'); os.makedirs(os.path.dirname(mask_path), exist_ok=True)
    np.save(mask_path, keep)
    import subprocess
    q = os.path.join(PROTO, 'build', 'opt', 'cap-hair-q.glb'); hair_out = os.path.join(PROTO, 'models', 'accessories', 'cap-hair-curly-v41.glb')
    subprocess.run([sys.executable, os.path.join(PROTO, 'tools', 'hair', 'optimize_hair.py'), hair_path, q, '--drop-tangent',
                    '--cull', os.path.join(PROTO, 'tools', 'hair', 'data', 'hair-curly-v41-vis.json'), '--cull-least', '0.20', '--cull-views', 'all',
                    '--tex-format', 'png-la', '--quantize', '--keep-mask', mask_path], check=True, capture_output=True)
    subprocess.run(['node', os.path.join(PROTO, 'tools', 'hair', 'meshopt_pack.mjs'), q, hair_out, '--v1'], check=True, capture_output=True)
    out = os.path.join(PROTO, 'models', 'accessories', 'cap.glb')
    stats = {'nom': 'Casquette coton rouge brique', 'triangles': tris, 'dans_la_tete': deg,
             'cheveux_qui_traversent': poke, 'cartes_gardees_sous_casquette': f'{int(keep.sum())}/{n_cards}',
             'cartes_qui_traversent_apres_tri': int((pokes & keep).sum()), 'coiffure_sous_casquette': os.path.relpath(hair_out, PROTO),
             'coiffure_octets': os.path.getsize(hair_out)}
    stats['octets'] = glb.save(out, extras={'accessory': 'cap', 'attach': 'Head', 'hides_hair_above_band': True})
    json.dump(stats, open(out.replace('.glb', '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROTO, 'models', 'hair', 'hair-curly-v41.glb'))
