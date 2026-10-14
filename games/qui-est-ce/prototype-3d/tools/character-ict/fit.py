"""Ajuste le modele de tete ICT-FaceKit aux photos du personnage.

Inconnues : 60 coefficients d'identite (forme du visage) et, par vue, une pose
orthographique (rotation, echelle, translation). On minimise l'ecart entre les
68 reperes du modele projetes et les reperes MediaPipe detectes sur les photos
(face, 3/4 gauche, 3/4 droit), par moindres carres alternes : poses a forme
fixee, puis forme (regularisee) a poses fixees.

Sortie : build-ict/fit.npz (sommets ajustes, coefficients, poses), build-ict/fit-*.jpg
"""
import os
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(PROTO, 'build-ict')
N_ID = 60

# Reperes Multi-PIE 68 : indices ICT (README ICT-FaceKit) et indices MediaPipe equivalents
ICT68 = [1225, 1888, 1052, 367, 1719, 1722, 2199, 1447, 966, 3661, 4390, 3927, 3924, 2608, 3272, 4088, 3443,
         268, 493, 1914, 2044, 1401, 3615, 4240, 4114, 2734, 2509, 978, 4527, 4942, 4857, 1140, 2075, 1147,
         4269, 3360, 1507, 1542, 1537, 1528, 1518, 1511, 3742, 3751, 3756, 3721, 3725, 3732, 5708, 5695, 2081,
         0, 4275, 6200, 6213, 6346, 6461, 5518, 5957, 5841, 5702, 5711, 5533, 6216, 6207, 6470, 5517, 5966]
MP68 = [162, 234, 93, 58, 172, 136, 149, 148, 152, 377, 378, 365, 397, 288, 323, 454, 389,
        71, 63, 105, 66, 107, 336, 296, 334, 293, 301, 168, 197, 5, 4, 75, 97, 2, 326, 305,
        33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
        61, 39, 37, 0, 267, 269, 291, 405, 314, 17, 84, 181, 78, 82, 13, 312, 308, 317, 14, 87]
VIEWS = {'front': 0.0, 'three-quarter-left': -25.0, 'three-quarter-right': 42.0}
# Poids : le contour de la machoire (0-16) depend de la silhouette, fiable seulement de face
W_JAW = {'front': 0.6, 'three-quarter-left': 0.0, 'three-quarter-right': 0.0}


def rot_y(deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def detect(name, det):
    res = det.detect(mp.Image.create_from_file(os.path.join(PROTO, 'refs', 'mv', name + '.jpg')))
    lm = np.array([[q.x, q.y] for q in res.face_landmarks[0]]) * 1024
    return np.stack([lm[MP68, 0], -lm[MP68, 1]], 1)          # y vers le haut


def solve_pose(X, y, w):
    """Camera orthographique a l'echelle : y ~ s * (R X)[:2] + t."""
    W = np.sqrt(w)[:, None]
    Xh = np.hstack([X, np.ones((len(X), 1))])
    A, *_ = np.linalg.lstsq(Xh * W, y * W, rcond=None)      # (4,2) affine
    M = A[:3].T                                                 # (2,3)
    U, S, Vt = np.linalg.svd(M, full_matrices=False)
    s = S.mean(); R2 = U @ Vt
    r3 = np.cross(R2[0], R2[1]); R = np.vstack([R2, r3])
    if np.linalg.det(R) < 0: R[2] *= -1
    t = (w[:, None] * (y - s * (X @ R[:2].T))).sum(0) / w.sum()
    return s, R, t


def main():
    d = np.load(os.path.join(OUT, 'ict.npz'))
    neutral, ids = d['neutral'].astype(np.float64), d['ids'][:N_ID].astype(np.float64)
    mu = neutral[ICT68]; B = ids[:, ICT68, :]                   # (60,68,3)
    det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(PROTO, 'tools', 'models', 'face_landmarker.task')), num_faces=1))
    obs = {n: detect(n, det) for n in VIEWS}
    weights = {n: np.array([W_JAW[n] if k < 17 else 1.0 for k in range(68)]) for n in VIEWS}

    a = np.zeros(N_ID)
    poses = {}
    for n, yaw in VIEWS.items():
        poses[n] = solve_pose(mu @ rot_y(yaw).T, obs[n], weights[n])
    for it in range(25):
        X = mu + np.einsum('i,ikd->kd', a, B)
        poses = {n: solve_pose(X, obs[n], weights[n]) for n in VIEWS}
        # forme a poses fixees : lineaire en a
        rows, rhs = [], []
        for n, (s, R, t) in poses.items():
            sw = np.sqrt(weights[n])
            base = s * (mu @ R[:2].T) + t
            J = s * np.einsum('ikd,jd->kji', B, R[:2])            # (68,2,60)
            rows.append((J * sw[:, None, None]).reshape(-1, N_ID))
            rhs.append(((obs[n] - base) * sw[:, None]).reshape(-1))
        Jm, r = np.vstack(rows), np.concatenate(rhs)
        lam = 40.0                                                  # a priori : coefficients ~ N(0,1)
        a = np.linalg.solve(Jm.T @ Jm + lam * np.eye(N_ID), Jm.T @ r)
    X = mu + np.einsum('i,ikd->kd', a, B)
    full = neutral + np.einsum('i,ikd->kd', a, ids)
    report = {}
    for n, (s, R, t) in poses.items():
        proj = s * (X @ R[:2].T) + t
        err = np.linalg.norm(proj - obs[n], axis=1)
        inner = err[17:].mean()
        yaw = np.degrees(np.arctan2(R[0, 2], R[2, 2]))
        report[n] = (round(float(inner), 2), round(float(yaw), 1))
        # controle : reperes du modele (rouge) sur la photo (vert)
        img = cv2.imread(os.path.join(PROTO, 'refs', 'mv', n + '.jpg'))
        P = s * (full @ R[:2].T) + t
        for p in P[::7]: cv2.circle(img, (int(p[0]), int(-p[1])), 1, (200, 200, 200), -1)
        for p, q in zip(proj, obs[n]):
            cv2.circle(img, (int(q[0]), int(-q[1])), 4, (0, 255, 0), -1)
            cv2.circle(img, (int(p[0]), int(-p[1])), 3, (0, 0, 255), -1)
        cv2.imwrite(os.path.join(OUT, f'fit-{n}.jpg'), cv2.resize(img[150:900, 200:850], (325, 375)))
    print('erreur moyenne (px, reperes internes) et lacet :', report)
    print('coefficients identite : max |a| =', np.abs(a).max().round(2), ' norme =', np.linalg.norm(a).round(2))
    np.savez(os.path.join(OUT, 'fit.npz'), verts=full, a=a,
             **{f'pose_{n}': np.concatenate([[poses[n][0]], poses[n][1].ravel(), poses[n][2]]) for n in poses})


if __name__ == '__main__':
    main()
