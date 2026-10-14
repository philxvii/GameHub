"""Etape 3 : personnage anime -> GLB.

A partir du maillage texture (bake.py) et des 478 reperes du visage :
  - yeux separes : l'oeil peint est decoupe du maillage, remplace par un globe
    oculaire (iris a la couleur de la photo) dans une orbite sombre ;
  - blendshapes ARKit (noms standard) : clignement, plisse, yeux grands ouverts,
    sourcils, sourire, joues, pincement, machoire ;
  - squelette Hips > Spine2 > Neck > Head, poids lisses par plans inclines ;
  - export GLB : morph targets clairsemes, texture JPEG.

Repere : le personnage regarde +Z, sa gauche est +X (ARKit « Left » = +X).
"""
import json, os, struct, sys
import numpy as np, cv2
import pygltflib as G

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
BUILD = os.path.join(PROTO, 'build')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROTO, 'models', 'character-01.glb')

# Reperes MediaPipe Face Mesh (gauche/droite = du personnage)
EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
BROW_R = {'inner': [107, 55, 66], 'outer': [70, 46, 63], 'all': [70, 63, 105, 66, 107, 46, 53, 52, 65, 55]}
BROW_L = {'inner': [336, 285, 296], 'outer': [300, 276, 293], 'all': [300, 293, 334, 296, 336, 276, 283, 282, 295, 285]}
MOUTH_R, MOUTH_L = 61, 291
CHEEK_R, CHEEK_L = 50, 280
NOSE_R, NOSE_L = 49, 279
LIP_UP, LIP_LOW, CHIN = 13, 14, 152
IRIS = list(range(468, 478))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(p, c, r):
    return np.exp(-np.sum((p - c) ** 2, axis=1) / (2 * r * r))


def rot_axis(points, center, axis, angle):
    """Rotation de Rodrigues, angle par point."""
    k = axis / np.linalg.norm(axis)
    p = points - center
    c, s = np.cos(angle)[:, None], np.sin(angle)[:, None]
    return center + p * c + np.cross(k, p) * s + k * (p @ k)[:, None] * (1 - c)


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


# ───────────────────────────────────────────── donnees
reg = json.load(open(os.path.join(BUILD, 'registration.json')))
T = np.load(os.path.join(BUILD, 'textured.npz'))
V, F, UV, N = T['v'].astype(np.float64), T['f'].astype(np.int64), T['uv'], T['n']
L3 = np.load(os.path.join(BUILD, 'landmarks3d.npy'))
L2 = np.load(os.path.join(BUILD, 'landmarks2d-front.npy'))
front = reg['front']
eye_w = np.linalg.norm(L3[33] - L3[133])           # largeur d'un oeil : unite du visage
u = eye_w
print(f'largeur oeil = {u:.4f} (unite)')

# ───────────────────────────────────────────── 1. decoupe des yeux peints
Rf = rot_y(front['phi'])
cent = V[F].mean(1)
pc = cent @ Rf.T
cu, cvv = front['cx'] + front['s'] * pc[:, 0], front['cy'] - front['s'] * pc[:, 1]
fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
remove = np.zeros(len(F), bool)
eyes = {}
for side, idx in (('Left', EYE_L), ('Right', EYE_R)):
    poly = L2[idx].astype(np.float32)
    centre2 = poly.mean(0)
    poly = (centre2 + (poly - centre2) * np.array([0.94, 0.70])).astype(np.float32)  # en retrait : les paupieres couvrent le globe
    inside = np.array([cv2.pointPolygonTest(poly, (float(a), float(b)), False) >= 0 for a, b in zip(cu, cvv)])
    front_most = (fn @ Rf.T)[:, 2] > 0.15
    near = np.linalg.norm(cent - L3[idx].mean(0), axis=1) < 1.2 * u
    sel = inside & front_most & near
    remove |= sel
    # globe : sphere ajustee sur la marge des paupieres (moindres carres), rayon borne
    # Proportions humaines : globe de 24 mm pour une fente de ~30 mm -> R = 0,4 x largeur.
    # Le devant de la cornee affleure les paupieres (marge moyenne + 0,08 x largeur).
    margin = L3[idx]
    c0 = margin.mean(0)
    R = 0.40 * u
    centre = np.array([c0[0], c0[1], c0[2] + 0.03 * u - R])
    eyes[side] = {'centre': centre, 'R': R, 'faces': int(sel.sum()), 'idx': idx}
    print(f'oeil {side}: {sel.sum()} triangles retires, centre {centre.round(3)}, R={R:.4f}')
F = F[~remove]

# ───────────────────────────────────────────── 2. blendshapes
morphs = {}
side_mask = {'Left': smoothstep(-0.02, 0.06, V[:, 0]), 'Right': smoothstep(0.02, -0.06, V[:, 0])}
facing = smoothstep(-0.1, 0.4, N @ np.array([0, 0, 1.0]))      # surtout la face avant


def lid_angle(points, c):
    return np.arctan2(points[:, 1] - c[1], points[:, 2] - c[2])


for side in ('Left', 'Right'):
    e = eyes[side]; c = e['centre']; idx = e['idx']
    lm = L3[idx]
    # marge haute / basse : les reperes 9..15 (+0, +8) sont la paupiere superieure
    upper, lower = lm[[0] + list(range(9, 16)) + [8]], lm[0:9]
    ang_up, ang_low = lid_angle(upper, c).mean(), lid_angle(lower, c).mean()
    gap = ang_up - ang_low                                             # angle d'ouverture
    p = V
    d_up = np.min(np.linalg.norm(p[:, None, :] - upper[None], axis=2), axis=1)
    d_low = np.min(np.linalg.norm(p[:, None, :] - lower[None], axis=2), axis=1)
    above = (p[:, 1] - c[1]) > -0.05 * u
    region = side_mask[side] * facing * (np.linalg.norm(p[:, :2] - c[:2], axis=1) < 1.3 * u)
    w_up = smoothstep(0.55 * u, 0.12 * u, d_up) * above * region
    w_low = smoothstep(0.35 * u, 0.08 * u, d_low) * (~above) * region
    axis = np.array([1.0, 0, 0])
    # clignement : la paupiere superieure descend en glissant sur le globe (78 %),
    # la paupiere inferieure remonte un peu (22 %)
    blink = rot_axis(p, c, axis, w_up * gap * 0.80) - p
    blink += rot_axis(p, c, axis, -w_low * gap * 0.24) - p
    morphs['eyeBlink' + side] = blink
    morphs['eyeWide' + side] = rot_axis(p, c, axis, -w_up * 0.16) - p
    sq = rot_axis(p, c, axis, -w_low * gap * 0.32) - p
    sq += rot_axis(p, c, axis, w_up * gap * 0.12) - p
    cheek = L3[CHEEK_L if side == 'Left' else CHEEK_R]
    sq += np.array([0, 0.10 * u, 0.02 * u]) * gauss(p, cheek, 0.55 * u)[:, None] * side_mask[side][:, None]
    morphs['eyeSquint' + side] = sq
    morphs['eyeLookDown' + side] = rot_axis(p, c, axis, w_up * 0.18) - p
    morphs['eyeLookUp' + side] = rot_axis(p, c, axis, -w_up * 0.12) - p

    brow = BROW_L if side == 'Left' else BROW_R
    b_all, b_in, b_out = L3[brow['all']].mean(0), L3[brow['inner']].mean(0), L3[brow['outer']].mean(0)
    outward = 1 if side == 'Left' else -1
    morphs['browOuterUp' + side] = np.array([0, 0.26 * u, 0]) * (gauss(p, b_out, 0.42 * u) * facing)[:, None]
    morphs['browDown' + side] = np.array([-outward * 0.07 * u, -0.17 * u, 0.02 * u]) * (gauss(p, b_all, 0.55 * u) * facing * side_mask[side])[:, None]

    corner = L3[MOUTH_L if side == 'Left' else MOUTH_R]
    g = (gauss(p, corner, 0.42 * u) * facing)[:, None]
    morphs['mouthSmile' + side] = np.array([outward * 0.13 * u, 0.24 * u, -0.07 * u]) * g \
        + np.array([0, 0.09 * u, 0.03 * u]) * (gauss(p, cheek + np.array([0, -0.1 * u, 0]), 0.6 * u) * facing)[:, None]
    morphs['cheekSquint' + side] = np.array([0, 0.11 * u, 0.02 * u]) * (gauss(p, cheek, 0.5 * u) * facing)[:, None]
    morphs['mouthDimple' + side] = np.array([outward * 0.03 * u, 0, -0.06 * u]) * (gauss(p, corner, 0.22 * u))[:, None]
    morphs['mouthFrown' + side] = np.array([0, -0.14 * u, 0]) * g
    lipc = (L3[LIP_UP] + L3[LIP_LOW]) / 2
    press_c = (corner + lipc) / 2
    sgn = np.sign(p[:, 1] - lipc[1])
    morphs['mouthPress' + side] = (np.array([0, -0.035 * u, 0]) * sgn[:, None]) * (gauss(p, press_c, 0.32 * u) * facing)[:, None]
    morphs['mouthLowerDown' + side] = np.array([0, -0.1 * u, 0]) * (gauss(p, (L3[LIP_LOW] + corner) / 2, 0.3 * u) * (p[:, 1] < lipc[1]) * facing)[:, None]
    nose = L3[NOSE_L if side == 'Left' else NOSE_R]
    morphs['noseSneer' + side] = np.array([0, 0.08 * u, 0.01 * u]) * (gauss(p, nose, 0.28 * u) * facing)[:, None]

p = V
inner = (L3[BROW_L['inner']].mean(0) + L3[BROW_R['inner']].mean(0)) / 2
morphs['browInnerUp'] = np.array([0, 0.24 * u, 0]) * (
    (gauss(p, L3[BROW_L['inner']].mean(0), 0.4 * u) + gauss(p, L3[BROW_R['inner']].mean(0), 0.4 * u)).clip(0, 1) * facing)[:, None]
lipc = (L3[LIP_UP] + L3[LIP_LOW]) / 2
mw = np.linalg.norm(L3[MOUTH_L] - L3[MOUTH_R])
mouth_zone = (gauss(p, lipc, 0.75 * mw) * facing)[:, None]
morphs['mouthLeft'] = np.array([0.16 * u, 0, 0]) * mouth_zone
morphs['mouthRight'] = np.array([-0.16 * u, 0, 0]) * mouth_zone
morphs['mouthFunnel'] = (np.array([0, 0, 0.06 * u]) - (p - lipc) * np.array([0.12, 0, 0])) * (gauss(p, lipc, 0.4 * mw) * facing)[:, None]
# machoire : rotation autour d'un axe sous les oreilles, levres soudees
ear_y = (L3[234][1] + L3[454][1]) / 2 - 0.25 * u
hinge = np.array([0, ear_y, (L3[234][2] + L3[454][2]) / 2])
below = smoothstep(lipc[1] - 0.02 * u, lipc[1] - 0.45 * u, p[:, 1])
jaw_w = below * smoothstep(hinge[2] - 0.2 * u, hinge[2] + 0.6 * u, p[:, 2]) * (np.abs(p[:, 0]) < 2.6 * u)
morphs['jawOpen'] = rot_axis(p, hinge, np.array([1.0, 0, 0]), jaw_w * np.radians(13)) - p
for k in list(morphs):
    morphs[k][np.abs(morphs[k]).max(1) < 1e-6] = 0
print(f'{len(morphs)} blendshapes')

# ───────────────────────────────────────────── 3. squelette et poids
chin = L3[CHIN]
ys = V[:, 1]
# largeur du maillage par tranche pour situer la base du cou (epaules)
rows = np.linspace(ys.min(), chin[1], 60)
widths = np.array([np.ptp(V[np.abs(ys - y) < 0.01, 0]) if np.any(np.abs(ys - y) < 0.01) else 0 for y in rows])
neck_w = widths[rows > chin[1] - 0.35].min() if np.any(rows > chin[1] - 0.35) else widths.min()
shoulder_y = rows[np.argmax(widths < neck_w * 1.6)] if np.any(widths < neck_w * 1.6) else chin[1] - 0.3
zc = lambda y, band=0.02: V[np.abs(ys - y) < band, 2].mean()
J = {
    'Hips': np.array([0, ys.min(), zc(ys.min() + 0.02, 0.04)]),
    'Spine2': np.array([0, shoulder_y - 0.18, zc(shoulder_y - 0.18)]),
    'Neck': np.array([0, shoulder_y + 0.02, zc(shoulder_y + 0.02) - 0.02]),
    'Head': np.array([0, (chin[1] + L3[234][1]) / 2 - 0.05 * u, zc(chin[1] - 0.05) - 0.05]),
}


def side_of(p, origin, normal, band):
    return 1 / (1 + np.exp(-((p - origin) @ (normal / np.linalg.norm(normal))) / band))


h = side_of(V, J['Head'], np.array([0, 1, 0.85]), 0.022)        # menton et barbe restent a la tete
n_ = side_of(V, J['Neck'] + np.array([0, 0.02, 0]), np.array([0, 1, 0.2]), 0.03) * (1 - h)
s_ = side_of(V, J['Spine2'] - np.array([0, 0.1, 0]), np.array([0, 1, 0]), 0.05) * (1 - h - n_)
hips = np.clip(1 - h - n_ - s_, 0, 1)
W = np.stack([hips, s_, n_, h], 1); W /= W.sum(1, keepdims=True)
JOINT_NAMES = ['Hips', 'Spine2', 'Neck', 'Head']
print('poids tete', int((h > 0.5).sum()), 'cou', int((n_ > 0.5).sum()), 'buste', int((s_ > 0.5).sum()), 'hanches', int((hips > 0.5).sum()))

# ───────────────────────────────────────────── 4. globes oculaires
img_front = cv2.imread(os.path.join(PROTO, 'refs', 'mv', 'front.jpg'))
iris_px = L2[IRIS].astype(int)
iris_col = np.median(np.stack([img_front[y - 2:y + 3, x - 2:x + 3].reshape(-1, 3) for x, y in iris_px[[1, 2, 3, 4, 6, 7, 8, 9]]]).reshape(-1, 3), 0)
print('couleur iris (BGR)', iris_col.round())


def eye_texture(size=512):
    """Texture du globe en coordonnees (theta, phi) : pole avant = centre de l'iris."""
    yy, xx = np.mgrid[0:size, 0:size]
    theta = (yy + 0.5) / size * np.pi                     # 0 = devant
    phi = (xx + 0.5) / size * 2 * np.pi
    tex = np.zeros((size, size, 3), np.float32)
    sclera = np.array([150, 162, 178], np.float32)        # BGR : blanc chaud, jamais blanc pur
    tex[:] = sclera * (1 - 0.35 * smoothstep(0.35, 1.3, theta))[..., None]   # ombre vers les coins
    rng = np.random.default_rng(7)
    streak = (np.sin(phi * 70 + rng.normal(0, 1, (size, size)) * 0.6) * 0.5 + 0.5)
    iris = np.clip(iris_col * 0.8 * (0.85 + 0.3 * streak[..., None]) * (1 - 0.2 * smoothstep(0.30, 0.5, theta))[..., None], 0, 255)
    iris_r, pupil_r = np.radians(31), np.radians(10)
    a = smoothstep(iris_r + 0.02, iris_r - 0.02, theta)[..., None]
    tex = tex * (1 - a) + iris * a
    ring = np.exp(-((theta - iris_r) / 0.025) ** 2)[..., None]   # anneau limbique
    tex *= 1 - 0.35 * ring
    pa = smoothstep(pupil_r + 0.015, pupil_r - 0.015, theta)[..., None]
    tex = tex * (1 - pa) + np.array([12, 12, 14]) * pa
    return np.clip(tex, 0, 255).astype(np.uint8)


def sphere(R, nlat=28, nlon=40, inward=False):
    """Sphere UV, pole sur +Z (devant). inward : normales et enroulement inverses."""
    th = np.linspace(0, np.pi, nlat + 1); ph = np.linspace(0, 2 * np.pi, nlon + 1)
    T_, P_ = np.meshgrid(th, ph, indexing='ij')
    dirs = np.stack([np.sin(T_) * np.cos(P_), np.sin(T_) * np.sin(P_), np.cos(T_)], -1).reshape(-1, 3)
    uv = np.stack([P_ / (2 * np.pi), T_ / np.pi], -1).reshape(-1, 2)
    f = []
    for i in range(nlat):
        for j in range(nlon):
            a, b = i * (nlon + 1) + j, i * (nlon + 1) + j + 1
            c_, d = a + nlon + 1, b + nlon + 1
            f += [[a, c_, b], [b, c_, d]]
    f = np.array(f)
    if inward:
        f = f[:, ::-1]; nrm = -dirs
    else:
        nrm = dirs
    return dirs * R, nrm, uv, f


# ───────────────────────────────────────────── 5. export glTF
buf = bytearray()
gltf = G.GLTF2(asset=G.Asset(version='2.0', generator='GameHub prototype-3d build_glb.py'))
gltf.scene = 0


def add_view(data, target=None):
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf.extend(data)
    gltf.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target))
    return len(gltf.bufferViews) - 1


def add_acc(arr, ctype, typ, target=None, minmax=False, normalized=False):
    arr = np.ascontiguousarray(arr)
    bv = add_view(arr.tobytes(), target)
    a = G.Accessor(bufferView=bv, componentType=ctype, count=len(arr), type=typ, normalized=normalized or None)
    if minmax:
        a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    gltf.accessors.append(a)
    return len(gltf.accessors) - 1


def add_sparse_target(delta):
    nz = np.nonzero(np.abs(delta).max(1) > 1e-6)[0].astype(np.uint32)
    vals = delta[nz].astype(np.float32)
    ib = add_view(nz.tobytes()); vb = add_view(vals.tobytes())
    a = G.Accessor(componentType=G.FLOAT, count=len(delta), type=G.VEC3,
                   min=(vals.min(0) if len(vals) else np.zeros(3)).tolist(),
                   max=(vals.max(0) if len(vals) else np.zeros(3)).tolist(),
                   sparse=G.Sparse(count=len(nz), indices=G.AccessorSparseIndices(bufferView=ib, componentType=G.UNSIGNED_INT),
                                   values=G.AccessorSparseValues(bufferView=vb)))
    gltf.accessors.append(a)
    return len(gltf.accessors) - 1, len(nz)


def add_image(img_bgr, name, quality=88):
    ok, enc = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    bv = add_view(enc.tobytes())
    gltf.images.append(G.Image(bufferView=bv, mimeType='image/jpeg', name=name))
    gltf.samplers.append(G.Sampler(magFilter=G.LINEAR, minFilter=G.LINEAR_MIPMAP_LINEAR))
    gltf.textures.append(G.Texture(source=len(gltf.images) - 1, sampler=len(gltf.samplers) - 1))
    return len(gltf.textures) - 1


# materiaux
skin_tex = add_image(cv2.imread(os.path.join(BUILD, 'albedo.png')), 'albedo')
# doubleSided : la reconstruction a des replis locaux dont la face arriere, masquee, faisait des trous
gltf.materials.append(G.Material(name='skin', doubleSided=True, pbrMetallicRoughness=G.PbrMetallicRoughness(
    baseColorTexture=G.TextureInfo(index=skin_tex), metallicFactor=0.0, roughnessFactor=0.62)))
eye_tex = add_image(eye_texture(), 'eye', 92)
gltf.materials.append(G.Material(name='eye', pbrMetallicRoughness=G.PbrMetallicRoughness(
    baseColorTexture=G.TextureInfo(index=eye_tex), metallicFactor=0.0, roughnessFactor=0.22)))
gltf.materials.append(G.Material(name='eye-socket', pbrMetallicRoughness=G.PbrMetallicRoughness(
    baseColorFactor=[0.035, 0.022, 0.02, 1], metallicFactor=0.0, roughnessFactor=0.9)))

# maillage principal skinne + blendshapes
names = sorted(morphs)
targets, total_sparse = [], 0
for k in names:
    acc, n_nz = add_sparse_target(morphs[k].astype(np.float32)); total_sparse += n_nz
    targets.append({'POSITION': acc})
joints = np.tile(np.arange(4, dtype=np.uint16), (len(V), 1))
prim = G.Primitive(
    attributes=G.Attributes(
        POSITION=add_acc(V.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=add_acc(N.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TEXCOORD_0=add_acc(UV.astype(np.float32) * np.array([1, -1], np.float32) + np.array([0, 1], np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
        JOINTS_0=add_acc(joints, G.UNSIGNED_SHORT, G.VEC4, G.ARRAY_BUFFER),
        WEIGHTS_0=add_acc(W.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)),
    indices=add_acc(F.astype(np.uint32).reshape(-1), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER),
    material=0, targets=targets)
gltf.meshes.append(G.Mesh(name='body', primitives=[prim], weights=[0.0] * len(names), extras={'targetNames': names}))


def add_simple_mesh(name, pos, nrm, uv, faces, material):
    prim = G.Primitive(attributes=G.Attributes(
        POSITION=add_acc(pos.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=add_acc(nrm.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TEXCOORD_0=add_acc(uv.astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER)),
        indices=add_acc(faces.astype(np.uint32).reshape(-1), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER),
        material=material)
    gltf.meshes.append(G.Mesh(name=name, primitives=[prim]))
    return len(gltf.meshes) - 1


# noeuds : 0 racine, 1 corps, 2.. articulations, puis yeux
gltf.nodes.append(G.Node(name='character-01', children=[1, 2]))
gltf.nodes.append(G.Node(name='body', mesh=0, skin=0))
jidx = {}
parent_pos = np.zeros(3)
for i, name in enumerate(JOINT_NAMES):
    jidx[name] = len(gltf.nodes)
    gltf.nodes.append(G.Node(name=name, translation=(J[name] - parent_pos).tolist(), children=[]))
    if i: gltf.nodes[jidx[JOINT_NAMES[i - 1]]].children.append(jidx[name])
    parent_pos = J[name]
head = jidx['Head']
for side in ('Left', 'Right'):
    e = eyes[side]
    pos, nrm, uv, f = sphere(e['R'])
    m_eye = add_simple_mesh('eye' + side, pos, nrm, uv, f, 1)
    pos2, nrm2, uv2, f2 = sphere(e['R'] * 1.02, 16, 24, inward=True)
    m_sock = add_simple_mesh('eyeSocket' + side, pos2, nrm2, uv2, f2, 2)
    node_eye = len(gltf.nodes)
    gltf.nodes.append(G.Node(name='eye' + side, mesh=m_eye, translation=(e['centre'] - J['Head']).tolist()))
    gltf.nodes.append(G.Node(name='eyeSocket' + side, mesh=m_sock, translation=(e['centre'] - J['Head']).tolist()))
    gltf.nodes[head].children += [node_eye, node_eye + 1]
ibm = np.stack([np.linalg.inv(np.array([[1, 0, 0, J[n][0]], [0, 1, 0, J[n][1]], [0, 0, 1, J[n][2]], [0, 0, 0, 1.0]])).T.reshape(-1)
                for n in JOINT_NAMES]).astype(np.float32)
gltf.skins.append(G.Skin(name='rig', joints=[jidx[n] for n in JOINT_NAMES], skeleton=jidx['Hips'],
                         inverseBindMatrices=add_acc(ibm, G.FLOAT, G.MAT4)))
gltf.scenes.append(G.Scene(name='Scene', nodes=[0]))
gltf.buffers.append(G.Buffer(byteLength=len(buf)))
gltf.set_binary_blob(bytes(buf))
gltf.save_binary(OUT)
print(f'GLB : {OUT} ({os.path.getsize(OUT) / 1e6:.2f} Mo), {len(V)} sommets, {len(F)} triangles, '
      f'{len(names)} blendshapes ({total_sparse} deltas non nuls), squelette {JOINT_NAMES}, yeux separes')
