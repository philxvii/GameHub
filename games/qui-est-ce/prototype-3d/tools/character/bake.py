"""Etape 2 : depliage UV et texture photo projetee depuis les 5 vues.

Pour chaque texel : position et normale sur le maillage, puis, pour chaque vue,
la couleur de la photo la ou ce point se projette, s'il y est visible (tampon de
profondeur) et dans le detourage. Les vues sont melangees selon l'angle entre la
normale et la direction de la camera ; la vue de face prime sur le visage.

Sortie : build/textured.npz (sommets, faces, uv, normales), build/albedo.png,
         build/landmarks3d.npy (478 points MediaPipe projetes sur le maillage).
"""
import json, os
import numpy as np, cv2, xatlas, trimesh
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
import sys                                                           # noqa: E402
sys.path.insert(0, os.path.join(PROTO, 'tools', 'pipeline'))
from paths import take_id, paths                                     # noqa: E402
CH = paths(take_id())                                                # --id <personnage> (defaut character-01)
BUILD = CH.build
TEX = 2048
VIEW_BIAS = {'front': 1.7, 'three-quarter-left': 1.0, 'three-quarter-right': 1.0,
             'profile-left': 0.8, 'profile-right': 0.8}


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def depth_map(v, f, r, size):
    """Profondeur (z vers la camera) par peintre : triangles du plus loin au plus proche."""
    p = v @ rot_y(r['phi']).T
    uv = np.stack([r['cx'] + r['s'] * p[:, 0], r['cy'] - r['s'] * p[:, 1]], 1)
    tri_z = p[f, 2].mean(1)
    dm = np.full((size, size), -1e9, np.float32)
    pts = np.round(uv[f] * 4).astype(np.int32)
    for i in np.argsort(tri_z):
        cv2.fillPoly(dm, [pts[i]], float(tri_z[i]), shift=2)
    return dm


def original_view(name):
    """Photo source pleine resolution et passage des coordonnees du carre 1024."""
    img = cv2.imread(os.path.join(CH.refs, name + '.jpg'))
    H, W = img.shape[:2]
    x0 = (W - H) / 2
    return img, (lambda u, v: ((x0 + u * H / 1024).astype(np.float32), (v * H / 1024).astype(np.float32)))


def main():
    reg = json.load(open(os.path.join(BUILD, 'registration.json')))
    d = np.load(os.path.join(BUILD, 'mesh.npz'))
    mesh = trimesh.Trimesh(d['v'], d['f'], process=False)
    # La surface Hunyuan est bruitee a l'echelle du sommet : un lissage leger
    # (Taubin, sans retrecissement) pour la peau, et des normales tres lissees
    # pour ponderer les vues — sinon le melange des 5 photos devient aleatoire.
    # Pointes et replis isoles (artefacts de reconstruction, ex. sur l'arete du nez) :
    # un sommet tres loin de la moyenne de ses voisins y est ramene.
    for _ in range(4):
        nb = mesh.vertex_neighbors
        mean = np.array([mesh.vertices[n].mean(0) if len(n) else mesh.vertices[i] for i, n in enumerate(nb)])
        dev = np.linalg.norm(mesh.vertices - mean, axis=1)
        spikes = dev > 3.0 * np.median(dev)
        mesh.vertices[spikes] = mean[spikes]
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=12)
    vn = mesh.vertex_normals.copy()
    soft = mesh.copy(); trimesh.smoothing.filter_taubin(soft, lamb=0.5, nu=-0.53, iterations=80)
    wn = soft.vertex_normals.copy()

    # ── Depliage ──
    vmap, faces, uvs = xatlas.parametrize(mesh.vertices, mesh.faces)
    V, N, WN = mesh.vertices[vmap], vn[vmap], wn[vmap]
    print(f'depliage : {len(V)} sommets UV, {len(faces)} triangles')

    # ── Rasterisation en espace UV : indice de triangle par texel ──
    tid = np.zeros((TEX, TEX), np.int32)
    uvpx = uvs * (TEX - 1); uvpx[:, 1] = (TEX - 1) - uvpx[:, 1]
    pts = np.round(uvpx[faces] * 4).astype(np.int32)
    for i in range(len(faces)):
        cv2.fillPoly(tid, [pts[i]], i + 1, shift=2)
    ys, xs = np.nonzero(tid)
    t = tid[ys, xs] - 1
    a, b, c = uvpx[faces[t, 0]], uvpx[faces[t, 1]], uvpx[faces[t, 2]]
    P = np.stack([xs, ys], 1).astype(np.float64)
    v0, v1, v2 = b - a, c - a, P - a
    den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; den[den == 0] = 1e-12
    w1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den
    w2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
    w0 = 1 - w1 - w2
    bary = np.clip(np.stack([w0, w1, w2], 1), 0, 1); bary /= bary.sum(1, keepdims=True)
    pos = np.einsum('nk,nkd->nd', bary, V[faces[t]])
    nor = np.einsum('nk,nkd->nd', bary, WN[faces[t]]); nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-9
    print(f'texels couverts : {len(t)}')

    # Choix des vues par azimut autour de l'axe vertical de la tete, pas par les
    # normales : la surface reconstruite a des faces localement retournees qui
    # rendent les normales incoherentes, et le melange devenait flou.
    axis_xz = np.array([np.median(mesh.vertices[:, 0]), np.median(mesh.vertices[mesh.vertices[:, 1] > 0, 2])])
    az = np.degrees(np.arctan2(pos[:, 0] - axis_xz[0], pos[:, 2] - axis_xz[1]))
    # ── Reperes du visage en 3D depuis la vue de face ──
    opt = vision.FaceLandmarkerOptions(base_options=BaseOptions(
        model_asset_path=os.path.join(PROTO, 'tools', 'models', 'face_landmarker.task')), num_faces=1)
    det = vision.FaceLandmarker.create_from_options(opt)
    res = det.detect(mp.Image.create_from_file(os.path.join(CH.refs_mv, 'front.jpg')))
    lm = np.array([[q.x, q.y] for q in res.face_landmarks[0]]) * 1024
    r = reg['front']
    dm = depth_map(mesh.vertices, mesh.faces, r, r['size'])
    zi = dm[np.clip(lm[:, 1].astype(int), 0, 1023), np.clip(lm[:, 0].astype(int), 0, 1023)]
    pr = np.stack([(lm[:, 0] - r['cx']) / r['s'], (r['cy'] - lm[:, 1]) / r['s'], zi], 1)
    l3 = pr @ rot_y(r['phi'])                       # retour au repere du maillage
    np.save(os.path.join(BUILD, 'landmarks3d.npy'), l3)
    np.save(os.path.join(BUILD, 'landmarks2d-front.npy'), lm)

    # ── Recalage des vues 3/4 par les reperes du visage ──
    # La silhouette de la tete varie peu entre 45 et 65 degres : un 3/4 mal cale
    # peint son oeil sur la joue. On ajuste (phi, s, cx, cy) pour que les reperes
    # 3D (issus de la vue de face) retombent sur les reperes detectes dans la photo.
    KEYS = [1, 4, 6, 33, 133, 263, 362, 61, 291, 13, 14, 152, 168, 70, 300, 105, 334, 50, 280, 49, 279]
    for name in ('three-quarter-left', 'three-quarter-right'):
        res = det.detect(mp.Image.create_from_file(os.path.join(CH.refs_mv, name + '.jpg')))
        if not res.face_landmarks: continue
        tgt = np.array([[q.x, q.y] for q in res.face_landmarks[0]])[KEYS] * 1024
        r = reg[name]; best = None
        for phi in np.arange(r['phi'] - 35, r['phi'] + 35.01, 0.5):
            pp = l3[KEYS] @ rot_y(phi).T
            # u = cx + s*x ; v = cy - s*y : moindres carres lineaires en (s, cx, cy)
            A = np.zeros((2 * len(KEYS), 3)); bvec = np.zeros(2 * len(KEYS))
            A[0::2, 0] = pp[:, 0]; A[0::2, 1] = 1; bvec[0::2] = tgt[:, 0]
            A[1::2, 0] = -pp[:, 1]; A[1::2, 2] = 1; bvec[1::2] = tgt[:, 1]
            sol, *_ = np.linalg.lstsq(A, bvec, rcond=None)
            err = np.sqrt(np.mean((A @ sol - bvec) ** 2))
            if best is None or err < best[0]: best = (err, phi, sol)
        err, phi, (sc, cx, cy) = best
        print(f'{name:22s} recale par reperes : phi {r["phi"]:.1f} -> {phi:.1f}, erreur {err:.1f} px')
        reg[name].update({'phi': float(phi), 's': float(sc), 'cx': float(cx), 'cy': float(cy), 'landmark_rms_px': round(float(err), 2)})
    json.dump(reg, open(os.path.join(BUILD, 'registration.json'), 'w'), indent=1)

    acc = np.zeros((len(t), 3)); wsum = np.zeros(len(t))
    for name, r in reg.items():
        size = r['size']
        dm = depth_map(mesh.vertices, mesh.faces, r, size)
        mask = cv2.imread(os.path.join(BUILD, 'masks', name + '.png'), 0)
        mask = cv2.erode(mask, np.ones((7, 7), np.uint8))           # evite le liseré de fond
        img, to_orig = original_view(name)
        R = rot_y(r['phi'])
        p = pos @ R.T; n = nor @ R.T
        u = r['cx'] + r['s'] * p[:, 0]; v = r['cy'] - r['s'] * p[:, 1]
        inside = (u >= 0) & (u < size - 1) & (v >= 0) & (v < size - 1)
        ui, vi = np.clip(u.astype(int), 0, size - 1), np.clip(v.astype(int), 0, size - 1)
        # visible si aucun triangle n'est devant (tolerance : 2 % de la hauteur).
        # Pas de dilatation du tampon : elle masquait les orbites, plus creuses
        # que le front et le nez voisins.
        visible = inside & (p[:, 2] >= dm[vi, ui] - 0.02) & (mask[vi, ui] > 127)
        # vue tournee de phi : elle voit de face l'azimut -phi
        facing = np.clip(np.cos(np.radians(az + r['phi'])), 0, 1)
        w = visible * facing ** 8 * VIEW_BIAS[name]
        ox, oy = to_orig(u, v)
        # remap limite chaque dimension a 32767 : on echantillonne par lignes de 2048
        pad = (-len(ox)) % 2048
        gx = np.pad(ox, (0, pad)).reshape(-1, 2048); gy = np.pad(oy, (0, pad)).reshape(-1, 2048)
        col = cv2.remap(img, gx, gy, cv2.INTER_LINEAR).reshape(-1, 3)[:len(ox)].astype(np.float64)
        acc += col * w[:, None]; wsum += w
        print(f'{name:22s} texels vus : {int((w > 0).sum())}')

    tex = np.zeros((TEX, TEX, 3), np.float32)
    have = wsum > 1e-4
    tex[ys[have], xs[have]] = acc[have] / wsum[have, None]
    known = np.zeros((TEX, TEX), np.uint8); known[ys[have], xs[have]] = 255
    # Trous (dessus du crane, arriere, dessous) : diffusion depuis les texels connus
    small = cv2.resize(tex, (512, 512), interpolation=cv2.INTER_AREA).astype(np.uint8)
    hole = cv2.resize(255 - known, (512, 512), interpolation=cv2.INTER_NEAREST)
    filled = cv2.resize(cv2.inpaint(small, hole, 6, cv2.INPAINT_TELEA), (TEX, TEX), interpolation=cv2.INTER_CUBIC)
    tex = np.where(known[..., None] > 0, tex, filled.astype(np.float32))
    # Marge autour des ilots UV (evite les coutures au filtrage)
    used = (tid > 0).astype(np.uint8)
    for _ in range(8):
        dil = cv2.dilate(tex, np.ones((3, 3), np.uint8))
        grow = cv2.dilate(used, np.ones((3, 3), np.uint8)) & (1 - used)
        tex[grow > 0] = dil[grow > 0]; used |= grow
    # Tout le reste de l'atlas prend la couleur du texel dessine le plus proche :
    # des ilots UV plus petits qu'un texel n'ont aucun texel rasterise et
    # echantillonnaient le noir du fond (points sombres sur l'arete du nez, les oreilles).
    _, labels = cv2.distanceTransformWithLabels((used == 0).astype(np.uint8), cv2.DIST_L2, 5,
                                                labelType=cv2.DIST_LABEL_PIXEL)
    src = np.argwhere(used > 0)
    lut = np.zeros((labels.max() + 1, 2), np.int64)
    lut[labels[used > 0]] = src
    nearest = lut[labels]
    tex = np.where(used[..., None] > 0, tex, tex[nearest[..., 0], nearest[..., 1]])
    cv2.imwrite(os.path.join(BUILD, 'albedo.png'), np.clip(tex, 0, 255).astype(np.uint8))
    print(f'texels sans vue (combles) : {int((~have).sum())}')

    # Normales retournees sur les replis : sommets tres sombres a l'eclairage. Si la
    # normale contredit la surface lissee, on prend la normale lissee.
    flip = np.einsum('ij,ij->i', N, WN) < 0.3
    N = np.where(flip[:, None], WN, N)
    print(f'normales corrigees : {int(flip.sum())}')
    np.savez(os.path.join(BUILD, 'textured.npz'), v=V, f=faces, uv=uvs, n=N)
    print('reperes 3D :', l3.shape, 'nez', l3[1].round(3), 'menton', l3[152].round(3))


if __name__ == '__main__':
    main()
