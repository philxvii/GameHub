"""Coiffures en cartes de cheveux, generees sur la tete du personnage -> GLB attachable.

Technique des moteurs de jeu : des milliers de rubans (« cartes ») portant chacun une
texture de meches fines en transparence. Racines plantees sur la zone chevelue du
crane, trajectoire integree dans un champ de direction propre a la coupe, repoussee
hors du crane, ruban oriente le long de la surface. Couleur racine -> pointe par
sommet, reflets anisotropes (KHR_materials_anisotropy), ombres portees.

Usage : python gen_cards.py           (toutes les coupes)
Sortie : models/hair/<id>.glb + models/hair/hairs.json
"""
import json, os
import numpy as np, cv2
from scipy.spatial import cKDTree
import pygltflib as G

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
import sys                                                           # noqa: E402
sys.path.insert(0, os.path.join(PROTO, 'tools', 'pipeline'))
from paths import take_id, paths                                     # noqa: E402
CH = paths(take_id())                                                # --id <personnage> (defaut character-01)
OUT = CH.hair; os.makedirs(OUT, exist_ok=True)
CHARACTER = CH.glb
ROOT_RGB = np.array([58, 42, 30]) / 255           # racines (sRGB)
TIP_RGB = np.array([128, 97, 70]) / 255            # pointes, un peu plus claires


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


# ───────────────────────────────────────────── tete du personnage
def load_head():
    g = G.GLTF2().load(CHARACTER); blob = g.binary_blob()
    def arr(i, n, dt):
        a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
        return np.frombuffer(blob, dt, a.count * n, bv.byteOffset + (a.byteOffset or 0)).reshape(a.count, n).astype(np.float64 if dt == np.float32 else np.int64)
    mats = [m.name for m in g.materials]
    head = [m for m in g.meshes if m.name == 'head'][0]
    V, Fs, base = [], [], 0
    for p in head.primitives:
        if mats[p.material] not in ('skin', 'scalp'): continue
        v = arr(p.attributes.POSITION, 3, np.float32); f = arr(p.indices, 1, np.uint32).reshape(-1, 3)
        V.append(v); Fs.append(f + base); base += len(v)
    V, F = np.vstack(V), np.vstack(Fs)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    nodes = {n.name: n for n in g.nodes}
    head_w = sum(np.array(nodes[n].translation) for n in ('Hips', 'Spine2', 'Neck', 'Head'))
    eL = head_w + np.array(nodes['eyeLeft'].translation); eR = head_w + np.array(nodes['eyeRight'].translation)
    return V, F, N, eL, eR


V, F, N, eL, eR = load_head()
cm = np.linalg.norm(eL - eR) / 6.3                       # ecart interpupillaire ~6,3 cm
eye_y = (eL[1] + eR[1]) / 2
top = V[:, 1].max()
centre = np.array([(eL[0] + eR[0]) / 2, eye_y + 0.35 * (top - eye_y), np.median(V[V[:, 1] > eye_y, 2]) - 1.0 * cm])
tree = cKDTree(V)
H_ = top - eye_y
band = (V[:, 1] > eye_y - 0.25 * (top - eye_y)) & (V[:, 1] < eye_y + 0.2 * (top - eye_y))
ears = []
for sgn in (1, -1):
    xs = sgn * (V[:, 0] - centre[0])
    sel = band & (xs > np.percentile(xs[band], 97))
    ears.append(V[sel].mean(0))
ears = np.array(ears)
print(f'1 cm = {cm:.4f} u ; yeux -> sommet = {H_ / cm:.1f} cm')


def azimuth(P):                                          # 0 devant (+Z), +90 a gauche du personnage (+X)
    return np.degrees(np.arctan2(P[:, 0] - centre[0], P[:, 2] - centre[2]))


def hairline(az):
    """Hauteur de la limite de la chevelure selon l'azimut (devant, tempes, oreilles, nuque)."""
    a = np.abs(az)
    keys = np.array([0, 30, 55, 80, 105, 140, 180])
    ys = np.array([0.50, 0.48, 0.30, 0.12, 0.05, -0.30, -0.42]) * H_ + eye_y
    return np.interp(a, keys, ys)


# ───────────────────────────────────────────── racines
def sample_roots(n, rng, extra_up=0.0):
    tri = V[F]; area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    cen = tri.mean(1); az = azimuth(cen)
    ok = cen[:, 1] > hairline(az) + extra_up
    # pas sur les oreilles : elles depassent lateralement sous la ligne des cheveux
    ok &= ~((np.abs(az) > 70) & (np.abs(az) < 115) & (cen[:, 1] < eye_y + 0.12 * H_))
    ok &= np.min(np.linalg.norm(cen[:, None, :] - ears[None], axis=2), axis=1) > 4.0 * cm   # pas de racine sur l'oreille
    p = area * ok; p /= p.sum()
    t = rng.choice(len(F), n, p=p)
    r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
    bc = np.stack([1 - s, s * (1 - r2), s * r2], 1)
    P = np.einsum('nk,nkd->nd', bc, V[F[t]])
    Nn = np.einsum('nk,nkd->nd', bc, N[F[t]]); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
    return P, Nn


def push_out(P, min_off):
    """Garde les points hors du crane d'au moins min_off (distance signee approchee)."""
    _, nn = tree.query(P)
    d = np.einsum('ij,ij->i', P - V[nn], N[nn])
    low = d < min_off
    P[low] += N[nn][low] * (min_off[low] - d[low])[:, None]
    return P


# ───────────────────────────────────────────── styles : champ de direction
def tangent_to(dirs, normals):
    t = dirs - normals * np.einsum('ij,ij->i', dirs, normals)[:, None]
    return t / (np.linalg.norm(t, axis=1, keepdims=True) + 1e-9)


STYLES = {
    'hair-short': dict(name='ICT + coupe courte texturée', note='cartes générées, peignée vers l\'arrière',
                       n=12000, seg=6, length=(2.5, 5.0), width=(0.42, 0.15), lift=0.10, wave=0.0, curl=0.0, gravity=0.3, comb='back', edge_w=0.35, edge_a=0.42),
    'hair-wavy': dict(name='ICT + mi-longue ondulée', note='cartes générées, raie sur le côté',
                      n=6500, seg=10, length=(8.0, 14.0), width=(0.5, 0.2), lift=0.10, wave=0.6, curl=0.0, gravity=0.6, comb='side'),
    'hair-curly': dict(name='ICT + volume bouclé', note='cartes générées, boucles serrées',
                       n=8000, seg=12, length=(6.0, 10.0), width=(0.5, 0.22), lift=0.75, wave=0.0, curl=1.3, gravity=0.1, comb='out'),
    # V4.1 : meme silhouette que #4 ; boucles variees, meches groupees, rebelles, front naturel, mat
    'hair-curly-v41': dict(name='B — #4 V4.1', note='mat, boucles variées, mèches groupées et rebelles',
                           n=8000, seg=12, length=(6.0, 10.0), width=(0.5, 0.22), lift=0.75, wave=0.0, curl=1.3, gravity=0.1, comb='out',
                           v41=True, rough=0.85, spec=0.06, aniso=0.0),
    # Propositions pour les autres personnages (planche reports/accessories/coiffures.jpg) :
    # jamais attachees au personnage 01, dont la coiffure reste la V4.1.
    'prop-buzz': dict(name='Rasée', note='proposition', n=26000, seg=3, length=(0.28, 0.5), width=(0.13, 0.06), lift=0.02,
                      wave=0.0, curl=0.0, gravity=0.0, comb='back', edge_w=0.4, edge_a=0.35, rough=0.85, spec=0.08, aniso=0.0,
                      root=(26, 21, 18), tip=(58, 47, 40)),
    'prop-short-grey': dict(name='Courte grise', note='proposition', n=12000, seg=6, length=(2.5, 5.0), width=(0.42, 0.15), lift=0.10,
                            wave=0.0, curl=0.0, gravity=0.3, comb='back', edge_w=0.35, edge_a=0.42, rough=0.8, spec=0.1, aniso=0.0,
                            root=(96, 93, 90), tip=(186, 183, 178)),
    'prop-wavy-red': dict(name='Mi-longue ondulée rousse', note='proposition', n=6500, seg=10, length=(8.0, 14.0), width=(0.5, 0.2),
                          lift=0.10, wave=0.6, curl=0.0, gravity=0.6, comb='side', rough=0.78, spec=0.1, aniso=0.0,
                          root=(104, 40, 18), tip=(176, 88, 42)),
    'prop-long-blond': dict(name='Longue raide blonde', note='proposition', n=7500, seg=14, length=(15.0, 21.0), width=(0.55, 0.22),
                            lift=0.08, wave=0.08, curl=0.0, gravity=1.0, comb='side', rough=0.72, spec=0.12, aniso=0.0,
                            root=(140, 104, 62), tip=(214, 178, 118)),
}


def grow(style, rng):
    st = STYLES[style]
    P0, N0 = sample_roots(st['n'], rng)
    n, seg = len(P0), st['seg']
    az = azimuth(P0)
    height = (P0[:, 1] - hairline(az)) / (top - hairline(az) + 1e-9)          # 0 a la limite, 1 au sommet
    side = np.clip(np.abs(az) / 110, 0, 1)
    L = (st['length'][0] + (st['length'][1] - st['length'][0]) * (0.35 + 0.65 * height) * (1 - 0.45 * side)) * cm
    L *= rng.uniform(0.8, 1.15, n)
    v41 = st.get('v41', False)
    if v41:                                                                    # limite irreguliere, transition plus large
        ph1, ph2 = rng.uniform(0, 6.3, 2)
        height = height + 0.06 * np.sin(np.radians(az) * 5 + ph1) + 0.04 * np.sin(np.radians(az) * 13 + ph2) + rng.normal(0, 0.03, n)
        edge = smoothstep(0.0, 0.32, height)
    else:
        edge = smoothstep(0.0, 0.2, height)                                    # 0 sur la limite du front
    L *= 0.45 + 0.55 * edge
    if style == 'hair-short':                                                  # nuque et cotes degages
        L *= np.where(np.abs(az) > 100, 0.55, 1.0) * np.where(np.abs(az) > 60, 0.7, 1.0)
        L *= np.where((np.abs(az) > 65) & (np.abs(az) < 125) & (P0[:, 1] < eye_y + 0.45 * H_), 0.35, 1.0)
        L *= 0.3 + 0.7 * edge                                                   # front : duvet court
    back = np.array([0, 0, -1.0]); down = np.array([0, -1.0, 0])
    if st['comb'] == 'back':
        d0 = tangent_to(np.tile(back + np.array([0, 0.25, 0]), (n, 1)), N0)
    elif st['comb'] == 'side':                                                 # raie a gauche du personnage
        part_x = centre[0] + 2.2 * cm
        away = np.where((P0[:, 0] > part_x)[:, None], np.array([1.0, 0, 0]), np.array([-1.0, 0, 0]))
        d0 = tangent_to(0.6 * away + 0.3 * back + 0.6 * down, N0)
    else:
        d0 = tangent_to(np.tile(back, (n, 1)), N0)
    lift = st['lift'] * (0.4 + 0.6 * edge)
    curl_amp = np.full(n, st['curl']); curl_freq = np.full(n, 8.0); fly = np.zeros(n, bool)
    if v41:
        curl_amp = st['curl'] * np.clip(rng.lognormal(0, 0.28, n), 0.55, 1.7)
        curl_freq = rng.uniform(6.0, 10.5, n)
        fly = (rng.random(n) < 0.035) & (height > 0.2)                       # meches rebelles
        L = np.where(fly, L * 1.35, L)
        curl_amp = np.where(fly, curl_amp * 0.35, curl_amp)
        lift = lift + 0.5 * fly
    if style == 'hair-short':                                                  # houppe : le devant se releve
        lift = lift + 0.25 * (np.abs(az) < 45) * smoothstep(0.15, 0.55, height)
    d0 = (d0 + lift[:, None] * N0); d0 /= np.linalg.norm(d0, axis=1, keepdims=True)
    jitter = rng.normal(0, 0.18, (n, 3)); d0 += jitter - N0 * np.einsum('ij,ij->i', jitter, N0)[:, None]
    d0 /= np.linalg.norm(d0, axis=1, keepdims=True)
    phase = rng.uniform(0, 2 * np.pi, n)
    side_v = np.cross(d0, N0); side_v /= np.linalg.norm(side_v, axis=1, keepdims=True) + 1e-9
    pts = np.zeros((n, seg + 1, 3)); pts[:, 0] = P0 + N0 * 0.05 * cm
    d = d0.copy()
    for k in range(1, seg + 1):
        t = k / seg
        step = L / seg
        g = st['gravity'] * (0.4 + 0.6 * t)
        dk = d + g * down
        if st['wave']:
            dk = dk + st['wave'] * np.sin(phase + t * 7.0)[:, None] * side_v * 0.6
        if st['curl']:
            ang = phase + t * curl_freq
            dk = dk + curl_amp[:, None] * (np.cos(ang)[:, None] * side_v + np.sin(ang)[:, None] * N0) * 0.9
        dk /= np.linalg.norm(dk, axis=1, keepdims=True)
        pts[:, k] = pts[:, k - 1] + dk * step[:, None]
        pts[:, k] = push_out(pts[:, k], np.full(n, (0.15 + 0.35 * t * (st['lift'] + 0.3)) * cm))
        d = pts[:, k] - pts[:, k - 1]; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    clump = np.zeros(n, int)
    if v41:
        lead = rng.choice(n, n // 10, replace=False)
        _, near = cKDTree(P0[lead]).query(P0)
        clump = near
        c = rng.uniform(0.35, 0.7, n) * (~fly)
        lp = pts[lead[near]]
        for k in range(1, seg + 1):
            tk = k / seg
            target = lp[:, k] + (P0 - P0[lead[near]]) * (1 - tk) * 0.6
            pts[:, k] += (c * tk ** 1.3)[:, None] * (target - pts[:, k])
            pts[:, k] = push_out(pts[:, k], np.full(n, (0.15 + 0.35 * tk * (st['lift'] + 0.3)) * cm))
    st = dict(st, _fly=fly, _clump=clump)
    return pts, N0, L, st, edge


# ───────────────────────────────────────────── geometrie des cartes
def cards(pts, N0, st, rng, edge):
    n, m = pts.shape[0], pts.shape[1]
    tang = np.gradient(pts, axis=1); tang /= np.linalg.norm(tang, axis=2, keepdims=True) + 1e-9
    # largeur le long de la surface : perpendiculaire a la meche et a la normale du crane
    _, nn = tree.query(pts.reshape(-1, 3)); nrm = N[nn].reshape(n, m, 3)
    wdir = np.cross(tang, nrm); wdir /= np.linalg.norm(wdir, axis=2, keepdims=True) + 1e-9
    t = np.linspace(0, 1, m)[None, :, None]
    w0 = rng.uniform(0.8, 1.2, (n, 1, 1)) * st['width'][0] * cm * (st.get('edge_w', 0.55) + (1 - st.get('edge_w', 0.55)) * edge)[:, None, None]
    if st.get('v41'):
        w0 = w0 * np.where(st['_fly'], 0.5, 1.0)[:, None, None]
    w = w0 + (st['width'][1] * cm - w0) * t
    # leger vrillage pour casser les surfaces trop planes
    twist = rng.normal(0, 0.35, (n, 1, 1)) * t
    wdir = wdir * np.cos(twist) + nrm * np.sin(twist)
    left, right = pts - wdir * w / 2, pts + wdir * w / 2
    P = np.stack([left, right], 2).reshape(-1, 3)                       # n*m*2
    Nm = nrm.repeat(2, axis=1).reshape(-1, 3)
    Tg = np.concatenate([tang.repeat(2, axis=1).reshape(-1, 3), np.ones((n * m * 2, 1))], 1)
    col = rng.integers(0, 4, n)                                          # 4 colonnes de meches dans la texture
    u0 = col / 4.0
    U = np.stack([u0[:, None].repeat(m, 1), (u0 + 0.25)[:, None].repeat(m, 1)], 2).reshape(-1)
    Vv = np.broadcast_to(t[..., 0][..., None], (n, m, 2)).reshape(-1)
    UV = np.stack([U, Vv], 1)
    shade = rng.uniform(0.75, 1.15, n)[:, None]
    if st.get('v41'):                                                          # teinte par meche groupee
        per_clump = rng.uniform(0.82, 1.18, st['_clump'].max() + 1)
        shade = (per_clump[st['_clump']] * rng.uniform(0.92, 1.08, n))[:, None]
    root_rgb = np.array(st['root']) / 255 if 'root' in st else ROOT_RGB      # teinte par style (propositions)
    tip_rgb = np.array(st['tip']) / 255 if 'tip' in st else TIP_RGB
    rgb = (root_rgb[None, None] + (tip_rgb - root_rgb)[None, None] * t ** 0.7) * shade[..., None]
    lin = np.clip(rgb, 0, 1) ** 2.2
    a0 = st.get('edge_a', 0.6)
    av = a0 + (1 - a0) * edge
    if st.get('v41'):
        av = np.where(st['_fly'], av * 0.7, av)
    alpha = np.repeat(av[:, None], m * 2, axis=1).reshape(-1, 1)   # limite plus clairsemee
    C = np.concatenate([lin.repeat(2, axis=1).reshape(-1, 3), alpha], 1)
    idx = []
    base = (np.arange(n) * m * 2)[:, None]
    for k in range(m - 1):
        a, b, c, d = base + 2 * k, base + 2 * k + 1, base + 2 * (k + 1), base + 2 * (k + 1) + 1
        idx += [np.concatenate([a, c, b], 1), np.concatenate([b, c, d], 1)]
    Fq = np.concatenate(idx, 0)
    return P, Nm, Tg, UV, C, Fq


def strand_texture(w=512, h=1024, seed=5):
    """4 colonnes de meches fines : alpha fort au centre de chaque fibre, pointes effilees."""
    rng = np.random.default_rng(seed)
    a = np.zeros((h, w), np.float32); lum = np.full((h, w), 0.6, np.float32)
    for c in range(4):
        x0, x1 = c * w // 4, (c + 1) * w // 4
        for _ in range(110):
            x = rng.uniform(x0 + 3, x1 - 3); L = rng.uniform(0.7, 1.0) * h; amp = rng.uniform(0, 3)
            ys = np.arange(int(L))
            xs = (x + amp * np.sin(ys / h * 6 + rng.uniform(0, 6))).astype(int)
            fade = np.clip(1 - (ys / L) ** 3, 0, 1)
            a[ys, np.clip(xs, x0, x1 - 1)] = np.maximum(a[ys, np.clip(xs, x0, x1 - 1)], fade * rng.uniform(0.75, 1))
            lum[ys, np.clip(xs, x0, x1 - 1)] = rng.uniform(0.45, 1.0)
    a = cv2.GaussianBlur(a, (3, 1), 0)
    a = np.clip(a * 1.6, 0, 1)
    # bords de chaque colonne effiles : la carte n'a plus d'arete rectiligne
    u = (np.arange(w) % (w // 4)) / (w // 4)
    a *= (np.sin(np.pi * u) ** 0.6)[None, :]
    v = np.arange(h) / h
    a *= smoothstep(0.0, 0.12, v)[:, None]                                   # racine fondue dans le cuir chevelu
    rgb = (np.clip(lum, 0, 1) * 255)
    img = np.dstack([rgb, rgb, rgb, a * 255]).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA)


def write_glb(path, P, Nm, Tg, UV, C, Fq, tex, st=None):
    st = st or {}
    buf = bytearray()
    g = G.GLTF2(asset=G.Asset(version='2.0', generator='GameHub gen_cards.py')); g.scene = 0
    def view(data, target=None):
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(data)
        g.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target)); return len(g.bufferViews) - 1
    def acc(a, ct, typ, target=None, mm=False):
        a = np.ascontiguousarray(a); x = G.Accessor(bufferView=view(a.tobytes(), target), componentType=ct, count=len(a), type=typ)
        if mm: x.min = a.min(0).tolist(); x.max = a.max(0).tolist()
        g.accessors.append(x); return len(g.accessors) - 1
    ok, enc = cv2.imencode('.png', tex)
    g.images.append(G.Image(bufferView=view(enc.tobytes()), mimeType='image/png'))
    g.samplers.append(G.Sampler(magFilter=G.LINEAR, minFilter=G.LINEAR_MIPMAP_LINEAR))
    g.textures.append(G.Texture(source=0, sampler=0))
    mat = G.Material(name='hair-cards', doubleSided=True, alphaMode='MASK', alphaCutoff=0.35,
                     pbrMetallicRoughness=G.PbrMetallicRoughness(baseColorTexture=G.TextureInfo(index=0), metallicFactor=0.0, roughnessFactor=st.get('rough', 0.68)),
                     extensions={'KHR_materials_specular': {'specularFactor': st.get('spec', 0.18)}})
    # Anisotropie : dans Three.js elle renforce le reflet de l'environnement sur les cartes
    # (bande « mouillee » sur le dessus) ; la V4.1 s'en passe.
    if st.get('aniso', 0.4) > 0:
        mat.extensions['KHR_materials_anisotropy'] = {'anisotropyStrength': st.get('aniso', 0.4), 'anisotropyRotation': 1.5708}
    g.extensionsUsed = list(mat.extensions)
    g.materials.append(mat)
    prim = G.Primitive(attributes=G.Attributes(
        POSITION=acc(P.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=acc(Nm.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TANGENT=acc(Tg.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER),
        TEXCOORD_0=acc(UV.astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
        COLOR_0=acc(C.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)),
        indices=acc(Fq.reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER), material=0)
    g.meshes.append(G.Mesh(name='hair', primitives=[prim]))
    g.nodes.append(G.Node(name=os.path.basename(path)[:-4], mesh=0)); g.scenes.append(G.Scene(nodes=[0]))
    g.buffers.append(G.Buffer(byteLength=len(buf))); g.set_binary_blob(bytes(buf)); g.save_binary(path)


def main(only=None):
    tex = strand_texture()
    out = []
    for i, sid in enumerate(STYLES):
        if only and sid not in only: continue
        rng = np.random.default_rng(100 + i)
        pts, N0, L, st, edge = grow(sid, rng)
        P, Nm, Tg, UV, C, Fq = cards(pts, N0, st, rng, edge)
        path = os.path.join(OUT, sid + '.glb')
        write_glb(path, P, Nm, Tg, UV, C, Fq, tex, st)
        print(f'{sid:11s} {len(pts)} cartes, {len(Fq)} triangles, longueur {np.median(L) / cm:.1f} cm, {os.path.getsize(path) / 1024:.0f} Ko')
        out.append({'id': sid, 'name': st['name'], 'note': st['note'], 'file': f'{CH.hair_url}{sid}.glb'})
    if not only:
        json.dump(out, open(os.path.join(OUT, 'hairs.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    import sys
    main(sys.argv[1:] or None)
