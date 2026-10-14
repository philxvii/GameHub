"""Personnage a partir du modele de tete ICT-FaceKit ajuste aux photos -> GLB.

Entrees : build-ict/ict.npz, build-ict/fit.npz (ajustement), et, du pipeline
Hunyuan : build/registration.json (cameras des 5 vues), build/landmarks3d.npy,
build/textured.npz + build/albedo.png (buste, cheveux en volume).

Etapes : alignement ICT -> repere Hunyuan, volume des cheveux, raccord du cou
sur le buste, texture photo (face + crane), iris photo, materiaux de la bouche,
cils, film lacrymal, 53 expressions sculptees, squelette, export GLB.
"""
import json, os, sys
import numpy as np, cv2
from scipy.spatial import cKDTree
import pygltflib as G
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
BUILD, ICT = os.path.join(PROTO, 'build'), os.path.join(PROTO, 'build-ict')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROTO, 'models', 'character-01-ict.glb')
TEX = 2048
sys.path.insert(0, HERE)
from fit import ICT68, MP68                                        # noqa: E402

# Plages de sommets ICT (README) ─────────────────────────────────────────────
R_FACE, R_HEAD = (0, 9408), (9409, 11247)
R_MOUTH, R_SOCK_L, R_SOCK_R = (11248, 13293), (13294, 13677), (13678, 14061)
R_GUMS, R_TEETH = (14062, 17038), (17039, 21450)
R_EYE_L, R_EYE_R = (21451, 23020), (23021, 24590)
R_LACRI, R_BLEND, R_OCCL, R_LASH = (24591, 24998), (24999, 25046), (25047, 25350), (25351, 26718)


def rng(r): return np.arange(r[0], r[1] + 1)


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    S, D = src - mu_s, dst - mu_d
    U, sig, Vt = np.linalg.svd(D.T @ S / len(src))
    E = np.eye(3); E[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ E @ Vt
    s = (sig * np.diag(E)).sum() / (S ** 2).sum() * len(src)
    return s, R, mu_d - s * R @ mu_s


# ───────────────────────────────────────────── donnees
d = np.load(os.path.join(ICT, 'ict.npz'))
fit = np.load(os.path.join(ICT, 'fit.npz'))
fv, ft, fm, UVt = d['fv'], d['ft'], d['fm'], d['uv']
mats = list(d['mats']); expr_names = list(d['expr_names'])
reg = json.load(open(os.path.join(BUILD, 'registration.json')))
L3 = np.load(os.path.join(BUILD, 'landmarks3d.npy'))
H = np.load(os.path.join(BUILD, 'textured.npz'))
HV, HF, HUV = H['v'].astype(np.float64), H['f'], H['uv']

# 1. alignement sur les reperes internes (sourcils, nez, yeux, bouche)
inner = list(range(17, 68))
s_al, R_al, t_al = umeyama(fit['verts'][np.array(ICT68)[inner]], L3[np.array(MP68)[inner]])
V = (s_al * (R_al @ fit['verts'].T)).T + t_al
EX = np.einsum('ij,enj->eni', s_al * R_al, d['expr'].astype(np.float64))       # ecarts d'expression
res = np.linalg.norm(V[np.array(ICT68)[inner]] - L3[np.array(MP68)[inner]], axis=1)
cm = s_al                                                                     # 1 cm ICT en unites Hunyuan
print(f'alignement : 1 cm = {cm:.4f} u, ecart moyen des reperes {res.mean() / cm:.2f} cm')

# Normales de sommets (sur la tete + cou)
def vnormals(v, f):
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    n = np.zeros_like(v)
    for k in range(3): np.add.at(n, f[:, k], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)


skin_faces = fv[np.isin(fm, [mats.index('M_Face'), mats.index('M_BackHead')])]
N = vnormals(V, skin_faces)

# ───────────────────────────────────────────── photos et masques yeux/bouche
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(PROTO, 'tools', 'models', 'face_landmarker.task')), num_faces=1))
EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
photos, holes = {}, {}
for name in reg:
    img = cv2.imread(os.path.join(PROTO, 'refs', name + '.jpg'))
    Hh, Ww = img.shape[:2]; x0 = (Ww - Hh) / 2; k = Hh / 1024
    photos[name] = (img, x0, k)
    hole = np.zeros(img.shape[:2], np.uint8)
    res_ = det.detect(mp.Image.create_from_file(os.path.join(PROTO, 'refs', 'mv', name + '.jpg')))
    if res_.face_landmarks and 'profile' not in name:
        lm = np.array([[q.x, q.y] for q in res_.face_landmarks[0]]) * 1024
        for poly in (EYE_L, EYE_R, LIPS_IN):
            pts = np.stack([x0 + lm[poly, 0] * k, lm[poly, 1] * k], 1).astype(np.int32)
            cv2.fillPoly(hole, [pts], 255)
        hole = cv2.dilate(hole, np.ones((9, 9), np.uint8))
    holes[name] = hole


def project(name, P):
    r = reg[name]; img, x0, k = photos[name]
    p = P @ rot_y(r['phi']).T
    u, v = r['cx'] + r['s'] * p[:, 0], r['cy'] - r['s'] * p[:, 1]
    return x0 + u * k, v * k, p[:, 2]


def sample(img, x, y):
    pad = (-len(x)) % 2048
    gx = np.pad(x, (0, pad)).reshape(-1, 2048).astype(np.float32); gy = np.pad(y, (0, pad)).reshape(-1, 2048).astype(np.float32)
    return cv2.remap(img, gx, gy, cv2.INTER_LINEAR).reshape(-1, img.shape[2] if img.ndim == 3 else 1)[:len(x)].astype(np.float64)


axis_xz = np.array([np.median(V[rng(R_FACE)][:, 0]), np.median(V[rng(R_HEAD)][:, 2])])


def azimuth(P): return np.degrees(np.arctan2(P[:, 0] - axis_xz[0], P[:, 2] - axis_xz[1]))


# ───────────────────────────────────────────── 2. cheveux en volume
head_ids = np.concatenate([rng(R_FACE), rng(R_HEAD)])
brow_y = L3[[105, 334, 66, 296]][:, 1].mean()
P = V[head_ids]
best = np.full(len(P), -1.0); col = np.zeros((len(P), 3))
for name in reg:
    x, y, _ = project(name, P)
    w = np.cos(np.radians(azimuth(P) + reg[name]['phi']))
    c = sample(photos[name][0], x, y)
    upd = w > best; best[upd] = w[upd]; col[upd] = c[upd]
lum = col.mean(1)
ear_y = (L3[234][1] + L3[454][1]) / 2
az_v = azimuth(P)
front_zone = np.abs(az_v) < 55
# de face : la photo dit ou commence la chevelure ; ailleurs : tout ce qui est au-dessus
# des oreilles (la vue de face ne voit le sommet du crane que de biais, sur le fond gris)
hair = np.where(front_zone, (lum < 110) & (P[:, 1] > brow_y + 1.5 * cm), P[:, 1] > ear_y + 1.5 * cm)
ear_dist = np.minimum(np.linalg.norm(P - L3[234], axis=1), np.linalg.norm(P - L3[454], axis=1))
hair &= ear_dist > 3.2 * cm
# lissage du masque sur le maillage (moyenne des voisins)
adj = [[] for _ in range(len(V))]
for f in skin_faces:
    for a_, b_ in ((0, 1), (1, 2), (2, 0)): adj[f[a_]].append(f[b_])
idx_of = {g: i for i, g in enumerate(head_ids)}
m = hair.astype(float)
for _ in range(6):
    m = np.array([np.mean([m[idx_of[j]] for j in adj[g] if j in idx_of] + [m[i]]) for i, g in enumerate(head_ids)])
hair_w = smoothstep(0.35, 0.8, m)
tree = cKDTree(HV)
_, nn = tree.query(P)
push = np.einsum('ij,ij->i', HV[nn] - P, N[head_ids])
push = np.clip(push, -1.5 * cm, 3.0 * cm)
# la chevelure epouse la surface Hunyuan (qui suit les silhouettes des 5 photos : la
# houppe sur le dessus) ; lissage du deplacement pour garder une surface propre
disp = N[head_ids] * (push * hair_w)[:, None]
for _ in range(4):
    disp = np.array([np.mean([disp[idx_of[j]] for j in adj[g] if j in idx_of] + [disp[i]], axis=0) for i, g in enumerate(head_ids)])
V[head_ids] += disp
print(f'cheveux : {int((hair_w > 0.5).sum())} sommets, ajustement median {np.median(push[hair_w > 0.5]) / cm:.2f} cm')
hair_vertex_w = np.zeros(len(V)); hair_vertex_w[head_ids] = hair_w
hair_col = np.zeros((len(V), 3)); hair_col[head_ids] = col

# ───────────────────────────────────────────── 3. buste Hunyuan sous le cou ICT
# Le cou ICT descend jusqu'a la clavicule : on le coupe a mi-hauteur (7 cm sous
# le menton) et le buste Hunyuan (epaules, pull) prend le relais.
neck_cut = L3[152][1] - 7.0 * cm
skin_ids = np.concatenate([rng(R_FACE), rng(R_HEAD)])
drop = np.isin(fv, skin_ids).all(1) & (V[fv][:, :, 1].max(1) < neck_cut)
neck = skin_ids[V[skin_ids][:, 1] < L3[152][1] - 2 * cm]
neck_bottom = neck_cut
ring = neck[(V[neck][:, 1] < neck_bottom + 2.5 * cm)]
_, nn = tree.query(V[ring])
wr = smoothstep(neck_bottom + 2.5 * cm, neck_bottom, V[ring][:, 1])
V[ring] += (HV[nn] - V[ring]) * (wr * 0.85)[:, None]               # le bas du cou epouse le buste
cut = neck_bottom + 1.5 * cm                                       # recouvrement de 1,5 cm
keep = (HV[HF][:, :, 1].max(1) < cut)
fnb = np.cross(HV[HF[:, 1]] - HV[HF[:, 0]], HV[HF[:, 2]] - HV[HF[:, 0]]); fnb /= np.linalg.norm(fnb, axis=1, keepdims=True) + 1e-12
keep &= HV[HF][:, :, 1].min(1) > HV[:, 1].min() + 0.12             # bande du bas, dechiree par le remaillage
BF = HF[keep]
used = np.unique(BF); remap = -np.ones(len(HV), int); remap[used] = np.arange(len(used))
BV, BUV, BF = HV[used], HUV[used], remap[BF]
print(f'buste Hunyuan : {len(BF)} triangles sous y={cut:.3f}')

# ───────────────────────────────────────────── 4. texture photo (face + crane)
def bake(face_sel, uv_off, tex_size):
    F = fv[face_sel]; T = ft[face_sel]
    uvp = (UVt - uv_off) * (tex_size - 1); uvp[:, 1] = (tex_size - 1) - uvp[:, 1]
    tid = np.zeros((tex_size, tex_size), np.int32)
    pts = np.round(uvp[T] * 4).astype(np.int32)
    for i in range(len(T)): cv2.fillPoly(tid, [pts[i]], i + 1, shift=2)
    ys, xs = np.nonzero(tid); t = tid[ys, xs] - 1
    a, b, c = uvp[T[t, 0]], uvp[T[t, 1]], uvp[T[t, 2]]
    Pp = np.stack([xs, ys], 1).astype(np.float64)
    v0, v1, v2 = b - a, c - a, Pp - a
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; den[den == 0] = 1e-12
    w1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den; w2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
    bary = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1); bary /= bary.sum(1, keepdims=True)
    pos = np.einsum('nk,nkd->nd', bary, V[F[t]])
    az = azimuth(pos)
    acc = np.zeros((len(t), 3)); ws = np.zeros(len(t))
    allF = fv[np.isin(fm, [mats.index('M_Face'), mats.index('M_BackHead')])]
    for name, r in reg.items():
        img, x0, k = photos[name]
        # tampon de profondeur de la tete ICT dans cette vue (peintre)
        pv = V @ rot_y(r['phi']).T
        uvv = np.stack([x0 + (r['cx'] + r['s'] * pv[:, 0]) * k, (r['cy'] - r['s'] * pv[:, 1]) * k], 1) / 2
        dm = np.full((img.shape[0] // 2, img.shape[1] // 2), -1e9, np.float32)
        tz = pv[allF, 2].mean(1); tp = np.round(uvv[allF] * 4).astype(np.int32)
        for i in np.argsort(tz): cv2.fillPoly(dm, [tp[i]], float(tz[i]), shift=2)
        x, y, z = project(name, pos)
        xi, yi = np.clip((x / 2).astype(int), 0, dm.shape[1] - 1), np.clip((y / 2).astype(int), 0, dm.shape[0] - 1)
        vis = (z >= dm[yi, xi] - 0.012) & (holes[name][np.clip(y.astype(int), 0, img.shape[0] - 1), np.clip(x.astype(int), 0, img.shape[1] - 1)] == 0)
        w = vis * np.clip(np.cos(np.radians(az + r['phi'])), 0, 1) ** 8 * (1.7 if name == 'front' else 1.0)
        acc += sample(img, x, y) * w[:, None]; ws += w
    tex = np.zeros((tex_size, tex_size, 3), np.float32)
    have = ws > 0.02
    tex[ys[have], xs[have]] = acc[have] / ws[have, None]
    known = np.zeros((tex_size, tex_size), np.uint8); known[ys[have], xs[have]] = 1
    _, lab = cv2.distanceTransformWithLabels((known == 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    src = np.argwhere(known > 0); lut = np.zeros((lab.max() + 1, 2), np.int64); lut[lab[known > 0]] = src
    near = lut[lab]
    tex = np.where(known[..., None] > 0, tex, tex[near[..., 0], near[..., 1]])
    tex = cv2.GaussianBlur(tex, (3, 3), 0) * 0.35 + tex * 0.65 if False else tex
    print(f'texture {mats[fm[face_sel][0]] if face_sel.any() else ""} : {int(have.sum())} texels vus sur {len(t)}')
    return np.clip(tex, 0, 255).astype(np.uint8)


# Prises et cavites recoivent leur propre materiau (sinon la photo s'y projette)
vid_mat = np.full(len(V), -1)
MAT_MOUTH, MAT_SOCKET = 100, 101
face_mat = fm.astype(int).copy()
face_mat[drop] = -1                                               # cou sous la coupe
in_mouth = np.isin(fv, rng(R_MOUTH)).all(1)
in_sock = np.isin(fv, np.concatenate([rng(R_SOCK_L), rng(R_SOCK_R)])).all(1)
face_mat[in_mouth] = MAT_MOUTH; face_mat[in_sock] = MAT_SOCKET
tex_face = bake(face_mat == mats.index('M_Face'), np.array([0, 0]), TEX)
tex_back = bake(face_mat == mats.index('M_BackHead'), np.array([1, 0]), 1024)
cv2.imwrite(os.path.join(ICT, 'tex_face.jpg'), tex_face); cv2.imwrite(os.path.join(ICT, 'tex_back.jpg'), tex_back)

# Oeil (style Unreal Digital Human, comme ICT) : M_Iris est le globe interieur peint
# (iris + sclere), M_Sclera la cornee exterieure transparente. Texture du globe calculee
# par l'angle 3D a l'axe du regard ; motif de l'iris preleve en polaire sur la photo.
IRIS_C = {'Left': 473, 'Right': 468}
EYE_POLY = {'Left': EYE_L, 'Right': EYE_R}
res_front = det.detect(mp.Image.create_from_file(os.path.join(PROTO, 'refs', 'mv', 'front.jpg')))
LMF = np.array([[q.x, q.y] for q in res_front.face_landmarks[0]]) * 1024


def bake_eyeball(side_range, side, size=1024, iris_deg=29.0):
    ids_ = rng(side_range)
    sv = np.unique(fv[(fm == mats.index('M_Sclera' + side)) & np.isin(fv, ids_).all(1)])
    centre = V[sv].mean(0)
    front_pt = V[sv][np.argmax(V[sv] @ np.array([0, 0, 1.0]))]
    fwd = (front_pt - centre) / np.linalg.norm(front_pt - centre)
    up = np.array([0, 1.0, 0]) - fwd * fwd[1]; up /= np.linalg.norm(up); right = np.cross(up, fwd)
    sel = (fm == mats.index('M_Iris' + side)) & np.isin(fv, ids_).all(1)
    F = fv[sel]; T = ft[sel]
    uvp = UVt * (size - 1); uvp[:, 1] = (size - 1) - uvp[:, 1]
    tid = np.zeros((size, size), np.int32)
    pts = np.round(uvp[T] * 4).astype(np.int32)
    for i in range(len(T)): cv2.fillPoly(tid, [pts[i]], i + 1, shift=2)
    ys, xs = np.nonzero(tid); t = tid[ys, xs] - 1
    a_, b_, c_ = uvp[T[t, 0]], uvp[T[t, 1]], uvp[T[t, 2]]
    Pp = np.stack([xs, ys], 1).astype(np.float64)
    v0, v1, v2 = b_ - a_, c_ - a_, Pp - a_
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; den[den == 0] = 1e-12
    w1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den; w2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
    bary = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1); bary /= bary.sum(1, keepdims=True)
    pos = np.einsum('nk,nkd->nd', bary, V[F[t]]) - centre
    dn = pos / np.linalg.norm(pos, axis=1, keepdims=True)
    ang = np.degrees(np.arccos(np.clip(dn @ fwd, -1, 1)))
    az = np.arctan2(dn @ up, dn @ right)
    img, x0, k = photos['front']
    ci = LMF[IRIS_C[side]]
    rad = np.mean(np.linalg.norm(LMF[IRIS_C[side] + 1: IRIS_C[side] + 5] - ci, axis=1))
    poly = LMF[EYE_POLY[side]].astype(np.float32)
    rr = np.clip(ang / iris_deg, 0, 1) * rad * 0.98
    px, py = ci[0] + rr * np.cos(az), ci[1] - rr * np.sin(az)
    # partie de l'iris cachee par la paupiere sur la photo : symetrique verticale
    hidden = np.array([cv2.pointPolygonTest(poly, (float(a), float(b)), False) < 0 for a, b in zip(px, py)])
    py = np.where(hidden, ci[1] + rr * np.abs(np.sin(az)), py)
    iris_col = sample(img, x0 + px * k, py * k)
    # sclere : mediane des pixels clairs de l'ouverture, hors iris
    yy, xx = np.mgrid[0:1024, 0:1024]
    m_ = np.zeros((1024, 1024), np.uint8); cv2.fillPoly(m_, [poly.astype(np.int32)], 1)
    ring = (m_ > 0) & (np.hypot(xx - ci[0], yy - ci[1]) > rad * 1.15)
    sq = cv2.resize(img[:, int(x0):int(x0) + img.shape[0]], (1024, 1024))[ring].astype(np.float64)
    bright = sq[sq.mean(1) > np.percentile(sq.mean(1), 85)]          # le blanc, pas la caroncule
    sclera_c = np.median(bright, 0); sclera_c = 0.5 * sclera_c + 0.5 * sclera_c.mean()   # desature de moitie
    sclera_c = sclera_c * min(1.25, 205 / max(1, sclera_c.mean()))
    col = np.where((ang < iris_deg)[:, None], iris_col, sclera_c[None] * (1 - 0.3 * smoothstep(35, 100, ang))[:, None])
    col = col * (1 - 0.5 * np.exp(-((ang - iris_deg) / 2.0) ** 2))[:, None]   # anneau limbique
    tex = np.zeros((size, size, 3), np.uint8); tex[ys, xs] = np.clip(col, 0, 255)
    known = (tid > 0).astype(np.uint8)
    _, lab = cv2.distanceTransformWithLabels((known == 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    src = np.argwhere(known > 0); lut = np.zeros((lab.max() + 1, 2), np.int64); lut[lab[known > 0]] = src
    near = lut[lab]; tex = np.where(known[..., None] > 0, tex, tex[near[..., 0], near[..., 1]])
    print(f'oeil {side} : rayon iris photo {rad:.1f} px, sclere BGR {sclera_c.round()}, {int(hidden.mean() * 100)} % des texels iris completes')
    return tex


eye_L = bake_eyeball(R_EYE_L, 'Left'); eye_R = bake_eyeball(R_EYE_R, 'Right')
cv2.imwrite(os.path.join(ICT, 'eye_left.jpg'), eye_L)


def strand_texture(size=512):
    """Meches pour les coquilles de cheveux : bruit allonge selon v (du front vers la nuque)."""
    rngd = np.random.default_rng(11)
    a = np.zeros((size, size), np.float32)
    for _ in range(5000):
        x, y = rngd.uniform(0, size, 2); L = rngd.uniform(6, 26)
        cv2.line(a, (int(x), int(y)), (int(x + rngd.normal(0, 1.5)), int(y + L)), float(rngd.uniform(0.5, 1)), 1)
    a = cv2.GaussianBlur(a, (3, 3), 0)
    rgba = np.full((size, size, 4), 255, np.uint8); rgba[..., 3] = np.clip(a * 255, 0, 255)
    return rgba


def lash_texture(w=512, h=64):
    """Cils : brins sombres, effiles vers la pointe (v = 1)."""
    rngd = np.random.default_rng(3)
    a = np.zeros((h, w), np.float32)
    for x in rngd.uniform(0, w, 110):
        L = rngd.uniform(0.45, 0.9) * h; curve = rngd.uniform(-6, 6)
        for yy in range(int(L)):
            xx = int(x + curve * (yy / h) ** 2)
            if 0 <= xx < w: a[h - 1 - yy, xx] = max(a[h - 1 - yy, xx], 0.6 * (1 - yy / L))
    a = cv2.GaussianBlur(a, (3, 1), 0)
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = (18, 20, 24); rgba[..., 3] = np.clip(a * 255, 0, 255)
    return rgba


# ───────────────────────────────────────────── 5. squelette, poids
chin = L3[152]
J = {
    'Hips': np.array([0, BV[:, 1].min(), np.median(BV[:, 2])]),
    'Spine2': np.array([0, cut - 0.25, np.median(BV[BV[:, 1] > cut - 0.3, 2])]),
    'Neck': np.array([0, neck_bottom + 1.5 * cm, np.median(V[ring][:, 2])]),
    'Head': np.array([0, chin[1] - 0.5 * cm, V[rng(R_HEAD)][:, 2].mean() + 1.0 * cm]),
}
for k_ in J: J[k_][0] = axis_xz[0]
JOINTS = ['Hips', 'Spine2', 'Neck', 'Head']


def weights_for(P):
    def side(o, n, band): return 1 / (1 + np.exp(-((P - o) @ (n / np.linalg.norm(n))) / band))
    h = side(J['Head'], np.array([0, 1, 0.85]), 0.6 * cm)
    n = side(J['Neck'] - np.array([0, 1.0 * cm, 0]), np.array([0, 1, 0.2]), 1.0 * cm) * (1 - h)
    s = side(J['Spine2'] - np.array([0, 0.1, 0]), np.array([0, 1, 0]), 0.05) * (1 - h - n)
    hp = np.clip(1 - h - n - s, 0, 1)
    W = np.stack([hp, s, n, h], 1); return W / W.sum(1, keepdims=True)


# ───────────────────────────────────────────── 6. export glTF
buf = bytearray()
gltf = G.GLTF2(asset=G.Asset(version='2.0', generator='GameHub prototype-3d build_ict.py (ICT-FaceKit, MIT)'))
gltf.scene = 0


def view(data, target=None):
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf.extend(data)
    gltf.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target)); return len(gltf.bufferViews) - 1


def acc(arr, ct, typ, target=None, mm=False):
    arr = np.ascontiguousarray(arr); bv = view(arr.tobytes(), target)
    a = G.Accessor(bufferView=bv, componentType=ct, count=len(arr), type=typ)
    if mm: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    gltf.accessors.append(a); return len(gltf.accessors) - 1


def sparse(delta):
    nz = np.nonzero(np.abs(delta).max(1) > 1e-7)[0].astype(np.uint32)
    if len(nz) == 0: nz = np.array([0], np.uint32)
    vals = delta[nz].astype(np.float32)
    a = G.Accessor(componentType=G.FLOAT, count=len(delta), type=G.VEC3, min=vals.min(0).tolist(), max=vals.max(0).tolist(),
                   sparse=G.Sparse(count=len(nz), indices=G.AccessorSparseIndices(bufferView=view(nz.tobytes()), componentType=G.UNSIGNED_INT),
                                   values=G.AccessorSparseValues(bufferView=view(vals.tobytes()))))
    gltf.accessors.append(a); return len(gltf.accessors) - 1


def image(arr, mime='image/jpeg', q=90):
    ok, enc = cv2.imencode('.png' if mime == 'image/png' else '.jpg', arr, [] if mime == 'image/png' else [cv2.IMWRITE_JPEG_QUALITY, q])
    gltf.images.append(G.Image(bufferView=view(enc.tobytes()), mimeType=mime))
    gltf.samplers.append(G.Sampler(magFilter=G.LINEAR, minFilter=G.LINEAR_MIPMAP_LINEAR))
    gltf.textures.append(G.Texture(source=len(gltf.images) - 1, sampler=len(gltf.samplers) - 1)); return len(gltf.textures) - 1


def material(name, color=(1, 1, 1, 1), tex=None, rough=0.6, blend=False, double=False, mask=False):
    pbr = G.PbrMetallicRoughness(baseColorFactor=list(color), metallicFactor=0.0, roughnessFactor=rough,
                                 baseColorTexture=G.TextureInfo(index=tex) if tex is not None else None)
    gltf.materials.append(G.Material(name=name, pbrMetallicRoughness=pbr, doubleSided=double,
                                     alphaMode='MASK' if mask else 'BLEND' if blend else 'OPAQUE',
                                     alphaCutoff=0.5 if mask else None)); return len(gltf.materials) - 1


M = {
    'face': material('skin', tex=image(tex_face), rough=0.72),
    'back': material('scalp', tex=image(tex_back), rough=0.8),
    'body': material('body', tex=image(cv2.imread(os.path.join(BUILD, 'albedo.png'))), rough=0.75, double=True),
    'mouth': material('mouth', (0.16, 0.05, 0.05, 1), rough=0.8),
    'socket': material('eye-socket', (0.05, 0.03, 0.03, 1), rough=0.9),
    'gums': material('gums', (0.62, 0.26, 0.27, 1), rough=0.45),
    'teeth': material('teeth', (0.86, 0.82, 0.74, 1), rough=0.3),
    'eyeballLeft': material('eyeball-left', tex=image(eye_L), rough=0.3),
    'eyeballRight': material('eyeball-right', tex=image(eye_R), rough=0.3),
    'cornea': material('cornea', (1, 1, 1, 0.06), rough=0.04, blend=True),
    'hair': material('hair-shells', tex=image(strand_texture(), 'image/png'), rough=0.65, double=True, mask=True),
    'lacri': material('tear', (0.9, 0.85, 0.85, 0.22), rough=0.05, blend=True),
    'lash': material('lashes', tex=image(lash_texture(), 'image/png'), rough=0.8, blend=True, double=True),
}

# primitives : (materiau, faces) ; les globes oculaires vont dans des noeuds a part
L_ = mats.index
prims_body = [
    ('face', face_mat == L_('M_Face'), np.array([0, 0])),
    ('back', face_mat == L_('M_BackHead'), np.array([1, 0])),
    ('mouth', face_mat == MAT_MOUTH, np.array([0, 0])),
    ('socket', face_mat == MAT_SOCKET, np.array([0, 0])),
    ('gums', face_mat == L_('M_GumsTongue'), np.array([2, 0])),
    ('teeth', face_mat == L_('M_Teeth'), np.array([3, 0])),
    ('lacri', face_mat == L_('M_LacrimalFluid'), np.array([4, 0])),
    ('lash', face_mat == L_('M_EyeLashes'), np.array([6, 0])),
]
eye_ids = np.concatenate([rng(R_EYE_L), rng(R_EYE_R)])
names_ex = [n for n in expr_names]
canon = [n.replace('_L', 'Left').replace('_R', 'Right') for n in names_ex]
prims = []
for key, sel, off in prims_body:
    F = fv[sel]; T = ft[sel]
    # un sommet glTF par couple (position, uv)
    pairs, inv = np.unique(np.stack([F.ravel(), T.ravel()], 1), axis=0, return_inverse=True)
    pv, pt = pairs[:, 0], pairs[:, 1]
    P = V[pv]; Nn = vnormals(V, fv[np.isin(fm, [L_('M_Face'), L_('M_BackHead'), L_('M_GumsTongue'), L_('M_Teeth'), L_('M_LacrimalFluid'), L_('M_EyeLashes')])])[pv]
    Wt = weights_for(P)
    targets = []
    for e in range(len(names_ex)):
        dlt = EX[e][pv].copy(); dlt[np.isin(pv, eye_ids)] = 0
        targets.append({'POSITION': sparse(dlt.astype(np.float32))})
    prim = G.Primitive(attributes=G.Attributes(
        POSITION=acc(P.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=acc(Nn.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TEXCOORD_0=acc(((UVt[pt] - off) * np.array([1, -1]) + np.array([0, 1])).astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
        JOINTS_0=acc(np.tile(np.arange(4, dtype=np.uint16), (len(P), 1)), G.UNSIGNED_SHORT, G.VEC4, G.ARRAY_BUFFER),
        WEIGHTS_0=acc(Wt.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)),
        indices=acc(inv.reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER),
        material=M[key], targets=targets)
    prims.append(prim)
# Coquilles de cheveux : 8 couches decalees le long de la normale, meches en alpha
# (MASK), couleur de la photo par sommet ; les couches externes sont plus clairsemees.
hair_faces = fv[np.isin(fm, [L_('M_Face'), L_('M_BackHead')]) & (face_mat >= 0)]
hair_faces = hair_faces[(hair_vertex_w[hair_faces] > 0.3).all(1)]
hv = np.unique(hair_faces); hremap = -np.ones(len(V), int); hremap[hv] = np.arange(len(hv))
hc = V[rng(R_HEAD)].mean(0)
dirs = V[hv] - hc; dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
huv = np.stack([(np.degrees(np.arctan2(dirs[:, 0], dirs[:, 2])) + 180) / 360 * 6,
                np.degrees(np.arccos(np.clip(dirs[:, 1], -1, 1))) / 180 * 5], 1)
lin = (hair_col[hv][:, ::-1] / 255.0) ** 2.2                          # sRGB -> lineaire, BGR -> RGB
NS = 8
hair_prims = []
for i in range(1, NS + 1):
    off = 0.16 * cm * i
    P = V[hv] + N[hv] * off
    colA = np.concatenate([lin * (0.85 + 0.03 * i), np.full((len(hv), 1), 1.0 - 0.055 * i)], 1)
    hair_prims.append(G.Primitive(attributes=G.Attributes(
        POSITION=acc(P.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=acc(N[hv].astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TEXCOORD_0=acc((huv * np.array([1, 1]) + np.array([0.13 * i, 0.07 * i])).astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
        COLOR_0=acc(np.clip(colA, 0, 1).astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER),
        JOINTS_0=acc(np.tile(np.arange(4, dtype=np.uint16), (len(hv), 1)), G.UNSIGNED_SHORT, G.VEC4, G.ARRAY_BUFFER),
        WEIGHTS_0=acc(weights_for(P).astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)),
        indices=acc(hremap[hair_faces].reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER),
        material=M['hair']))
print(f'cheveux : {NS} coquilles de {len(hair_faces)} triangles')
# buste : pas d'expressions, cibles nulles (meme nombre de cibles par primitive)
Wb = weights_for(BV)
torso_prim = (G.Primitive(attributes=G.Attributes(
    POSITION=acc(BV.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
    NORMAL=acc(H['n'][used].astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
    TEXCOORD_0=acc((BUV * np.array([1, -1]) + np.array([0, 1])).astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
    JOINTS_0=acc(np.tile(np.arange(4, dtype=np.uint16), (len(BV), 1)), G.UNSIGNED_SHORT, G.VEC4, G.ARRAY_BUFFER),
    WEIGHTS_0=acc(Wb.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)),
    indices=acc(BF.reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER),
    material=M['body']))
gltf.meshes.append(G.Mesh(name='head', primitives=prims, weights=[0.0] * len(names_ex), extras={'targetNames': canon}))
gltf.meshes.append(G.Mesh(name='hair', primitives=hair_prims))
gltf.meshes.append(G.Mesh(name='torso', primitives=[torso_prim]))


def eye_mesh(side, rr, iris_mat):
    ids_ = rng(rr)
    centre = V[ids_].mean(0)
    sub = []
    for key, matname in (('eyeball' + side, 'M_Iris' + side), ('cornea', 'M_Sclera' + side)):
        sel = (fm == L_(matname)) & np.isin(fv, ids_).all(1)
        F = fv[sel]; T = ft[sel]
        pairs, inv = np.unique(np.stack([F.ravel(), T.ravel()], 1), axis=0, return_inverse=True)
        pv, pt = pairs[:, 0], pairs[:, 1]
        Nn = vnormals(V, fv[np.isin(fv, ids_).all(1)])[pv]
        sub.append(G.Primitive(attributes=G.Attributes(
            POSITION=acc((V[pv] - centre).astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
            NORMAL=acc(Nn.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
            TEXCOORD_0=acc((UVt[pt] * np.array([1, -1]) + np.array([0, 1])).astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER)),
            indices=acc(inv.reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER), material=M[key]))
    gltf.meshes.append(G.Mesh(name='eye' + side, primitives=sub)); return len(gltf.meshes) - 1, centre


gltf.nodes.append(G.Node(name='character-01-ict', children=[1, 2, 3, 4]))
gltf.nodes.append(G.Node(name='head', mesh=0, skin=0))
gltf.nodes.append(G.Node(name='hair', mesh=1, skin=0))
gltf.nodes.append(G.Node(name='torso', mesh=2, skin=0))
jidx, parent = {}, np.zeros(3)
for i, n in enumerate(JOINTS):
    jidx[n] = len(gltf.nodes); gltf.nodes.append(G.Node(name=n, translation=(J[n] - parent).tolist(), children=[]))
    if i: gltf.nodes[jidx[JOINTS[i - 1]]].children.append(jidx[n])
    parent = J[n]
for side, rr, im in (('Left', R_EYE_L, 'irisL'), ('Right', R_EYE_R, 'irisR')):
    mi, c = eye_mesh(side, rr, im)
    gltf.nodes.append(G.Node(name='eye' + side, mesh=mi, translation=(c - J['Head']).tolist()))
    gltf.nodes[jidx['Head']].children.append(len(gltf.nodes) - 1)
ibm = np.stack([np.linalg.inv(np.array([[1, 0, 0, J[n][0]], [0, 1, 0, J[n][1]], [0, 0, 1, J[n][2]], [0, 0, 0, 1.]])).T.reshape(-1) for n in JOINTS]).astype(np.float32)
gltf.skins.append(G.Skin(name='rig', joints=[jidx[n] for n in JOINTS], skeleton=jidx['Hips'], inverseBindMatrices=acc(ibm, G.FLOAT, G.MAT4)))
gltf.scenes.append(G.Scene(name='Scene', nodes=[0]))
gltf.buffers.append(G.Buffer(byteLength=len(buf)))
gltf.set_binary_blob(bytes(buf)); gltf.save_binary(OUT)
print(f'GLB : {OUT} ({os.path.getsize(OUT) / 1e6:.2f} Mo), tete ICT {len(V)} sommets + buste {len(BV)}, {len(canon)} expressions')
