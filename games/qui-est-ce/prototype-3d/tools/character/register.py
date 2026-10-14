"""Etape 1 : maillage allege, masques des vues, recalage camera par vue.

Chaque vue est une projection orthographique du maillage tourne d'un angle de
lacet phi autour de Y (le personnage regarde +Z) :
    u = cx + s * x',   v = cy - s * y'
On cherche (phi, s, cx, cy) qui maximisent le recouvrement (IoU) entre la
silhouette du maillage projete et le masque detoure de la photo.

Sortie : build/registration.json, build/mesh.npz (maillage allege), build/masks/*.png
"""
import json, os, sys
import numpy as np, cv2, trimesh, fast_simplification
from scipy import ndimage
from skimage import measure

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
BUILD = os.path.join(PROTO, 'build')
os.makedirs(os.path.join(BUILD, 'masks'), exist_ok=True)

SRC_MESH = os.path.join(PROTO, 'models', 'hunyuan2mv-3views-shape.glb')
# Lacet initial : le nez pointe vers la gauche de l'image pour les vues « left ».
VIEWS = {'front': 0, 'three-quarter-left': -48, 'three-quarter-right': 48,
         'profile-left': -90, 'profile-right': 90}
# Ecart de lacet autorise. Pour les 3/4, la silhouette de la tete varie peu
# entre 45 et 65 degres : l'angle est borne par la pose mesuree par MediaPipe
# (~28 degres, que MediaPipe sous-estime d'un facteur ~1,8 sur les profils).
YAW_LIMIT = {'front': 8, 'three-quarter-left': 7, 'three-quarter-right': 7,
             'profile-left': 20, 'profile-right': 20}
TARGET_FACES = int(sys.argv[1]) if len(sys.argv) > 1 else 90000


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def mask_of(img):
    """Fond studio gris clair et lisse : on modelise le fond ligne par ligne
    a partir des bords, puis GrabCut affine."""
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = np.concatenate([lab[:, :24], lab[:, -24:]], axis=1)
    bg = np.median(border, axis=1, keepdims=True)
    d = np.linalg.norm(lab - bg, axis=2)
    m = (d > 14).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(m)
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab_ == k).astype(np.uint8)
    # comble les trous interieurs (reflets clairs sur la peau)
    ff = m.copy(); cv2.floodFill(ff, None, (0, 0), 1); m = m | (1 - ff)
    gc = np.where(cv2.erode(m, np.ones((15, 15), np.uint8)), cv2.GC_FGD,
                  np.where(cv2.dilate(m, np.ones((15, 15), np.uint8)), cv2.GC_PR_FGD, cv2.GC_BGD)).astype(np.uint8)
    bgm, fgm = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(img, gc, None, bgm, fgm, 4, cv2.GC_INIT_WITH_MASK)
    return np.where((gc == 1) | (gc == 3), 255, 0).astype(np.uint8)


def silhouette(verts, faces, phi, s, cx, cy, size):
    p = verts @ rot_y(phi).T
    uv = np.stack([cx + s * p[:, 0], cy - s * p[:, 1]], 1)
    sil = np.zeros((size, size), np.uint8)
    cv2.fillPoly(sil, np.round(uv[faces] * 4).astype(np.int32), 255, shift=2)
    return sil


def iou(a, b, rows=None):
    a, b = a > 127, b > 127
    if rows is not None:          # seulement la tete et le cou : les epaules du
        a, b = a[:rows], b[:rows] # maillage sont plus etroites que sur les photos
    return (a & b).sum() / max(1, (a | b).sum())


def main():
    mesh = list(trimesh.load(SRC_MESH).geometry.values())[0]
    # garde la plus grande composante (debris de la reconstruction), puis allege.
    # fast_simplification attend des indices int32 : en int64, la connectivite casse.
    comps = trimesh.graph.connected_components(mesh.face_adjacency, min_len=1)
    mesh = mesh.submesh([max(comps, key=len)], append=True)
    mesh.remove_unreferenced_vertices()
    # Remaillage voxel : la reconstruction se replie sur elle-meme par endroits
    # (36 % de faces retournees sur l'arete du nez : taches sombres au rendu).
    # Voxels de 0,006, interieur rempli tranche par tranche (le buste est ouvert
    # en bas), surface reconstruite par marching cubes : fermee, sans repli.
    vg = mesh.voxelized(pitch=0.006)
    M = vg.matrix.copy()
    for j in range(M.shape[1]):
        M[:, j, :] = ndimage.binary_fill_holes(M[:, j, :])
    M = ndimage.binary_closing(M, iterations=1)
    mv, mf, _, _ = measure.marching_cubes(np.pad(M, 1).astype(np.float32), 0.5)
    mesh = trimesh.Trimesh(trimesh.transform_points(mv - 1, vg.transform), mf[:, ::-1], process=False)
    print(f'remaillage voxel : {len(mesh.faces)} triangles, fermé : {mesh.is_watertight}')
    v, f = fast_simplification.simplify(mesh.vertices.astype(np.float32), mesh.faces.astype(np.int32),
                                        target_reduction=1 - TARGET_FACES / len(mesh.faces))
    lite = trimesh.Trimesh(v, f, process=False)
    comps = trimesh.graph.connected_components(lite.face_adjacency, min_len=1)
    lite = lite.submesh([max(comps, key=len)], append=True)
    lite.remove_unreferenced_vertices()
    np.savez(os.path.join(BUILD, 'mesh.npz'), v=lite.vertices, f=lite.faces)
    print(f'maillage : {len(mesh.faces)} -> {len(lite.faces)} triangles, {len(lite.vertices)} sommets')

    # silhouette rapide sur un maillage tres allege
    sv, sf = fast_simplification.simplify(lite.vertices.astype(np.float32), lite.faces.astype(np.int32), target_reduction=0.8)
    reg = {}
    for name, phi0 in VIEWS.items():
        img = cv2.imread(os.path.join(PROTO, 'refs', 'mv', name + '.jpg'))
        size = img.shape[0]
        m = mask_of(img)
        cv2.imwrite(os.path.join(BUILD, 'masks', name + '.png'), m)
        small = cv2.resize(m, (256, 256), interpolation=cv2.INTER_AREA)
        ys, xs = np.nonzero(small > 127)
        # initialisation par boite englobante : sommet de la tete et bas de l'image
        p = sv @ rot_y(phi0).T
        s = (255 - ys.min()) / (p[:, 1].max() - p[:, 1].min())
        cy = ys.min() + s * p[:, 1].max()
        cx = (xs.min() + xs.max()) / 2 - s * (p[:, 0].min() + p[:, 0].max()) / 2
        rows = int(ys.min() + 0.52 * (255 - ys.min()))
        # plusieurs echelles de depart : l'init par boite englobante suppose que le
        # bas du maillage touche le bas de l'image, ce qui n'est qu'approximatif
        best, score = None, -1
        for ks in (0.8, 0.9, 1.0, 1.1, 1.2):
            cand = [phi0, s * ks, cx, ys.min() + s * ks * p[:, 1].max()]
            cand[2] = (xs.min() + xs.max()) / 2 - cand[1] * (p[:, 0].min() + p[:, 0].max()) / 2
            sc = iou(silhouette(sv, sf, *cand, 256), small, rows)
            if sc > score: best, score = cand, sc
        # descente par coordonnees, pas decroissants
        for step in [(6, 0.04, 4, 4), (3, 0.02, 2, 2), (1.5, 0.01, 1, 1), (0.75, 0.005, 0.5, 0.5)]:
            improved = True
            while improved:
                improved = False
                for i in range(4):
                    for sgn in (-1, 1):
                        cand = list(best)
                        cand[i] = cand[i] + sgn * step[i] * (best[1] if i == 1 else 1)
                        if i == 0 and abs(cand[0] - phi0) > YAW_LIMIT[name]: continue
                        sc = iou(silhouette(sv, sf, *cand, 256), small, rows)
                        if sc > score + 1e-4: best, score, improved = cand, sc, True
        k = size / 256
        reg[name] = {'phi': best[0], 's': best[1] * k, 'cx': best[2] * k, 'cy': best[3] * k, 'iou': round(score, 4), 'size': size}
        print(f'{name:22s} phi={best[0]:7.2f}  IoU={score:.3f}')
        # controle visuel : silhouette du maillage (rouge) sur la photo
        sil = silhouette(lite.vertices, lite.faces, best[0], best[1] * k, best[2] * k, best[3] * k, size)
        over = img.copy(); cnt, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(over, cnt, -1, (0, 0, 255), 3)
        cv2.imwrite(os.path.join(BUILD, 'masks', name + '-overlay.jpg'), cv2.resize(over, (256, 256)))
    json.dump(reg, open(os.path.join(BUILD, 'registration.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
