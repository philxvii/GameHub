"""Controle des 5 photos Gemini d'un personnage, avant la fabrication.

    python tools/pipeline/check_refs.py character-07
    python tools/pipeline/check_refs.py --all          # tous les personnages du roster

Pour chaque vue (front, three-quarter-left, three-quarter-right, profile-left, profile-right) :
le fichier existe (nom exact, .jpg), l'image fait au moins 1024 px de petit cote, le fond est
uni et clair (bords de l'image), un visage est detecte (face et trois-quarts : MediaPipe, le
meme detecteur que build_ict.py) et le visage regarde du bon cote. Dit precisement ce qui
manque ou ce qu'il faut refaire. Code de sortie 0 si tout est bon, 1 sinon.
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from paths import paths                                              # noqa: E402

VIEWS = ['front', 'three-quarter-left', 'three-quarter-right', 'profile-left', 'profile-right']
MIN_SIDE = 1024
_det = None


def detector():
    global _det
    if _det is None:
        from mediapipe.tasks.python import vision, BaseOptions
        _det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(PROTO, 'tools', 'models', 'face_landmarker.task')), num_faces=1))
    return _det


def face(img):
    """Repere du visage (x du nez et des deux coins exterieurs des yeux, en fraction de largeur) ou None."""
    import mediapipe as mp
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    r = detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not r.face_landmarks: return None
    lm = r.face_landmarks[0]
    return {'nose': lm[1].x, 'eye_r': lm[33].x, 'eye_l': lm[263].x}


def check_view(path, view):
    name = os.path.basename(path)
    if not os.path.exists(path): return [f'{name} : absente']
    img = cv2.imread(path)
    if img is None: return [f'{name} : illisible (JPEG attendu)']
    errs = []
    h, w = img.shape[:2]
    if min(h, w) < MIN_SIDE: errs.append(f'{name} : {w}x{h}, trop petite (au moins {MIN_SIDE} px de petit cote)')
    b = max(4, min(h, w) // 40)                                       # bandes du bord : le fond
    border = np.concatenate([img[:b].reshape(-1, 3), img[:, :b].reshape(-1, 3), img[:, -b:].reshape(-1, 3)]).astype(np.float32)
    if border.std(axis=0).max() > 18: errs.append(f'{name} : fond pas uni (decor, ombre ou degrade sur les bords) -> fond gris clair uni')
    if border.mean() < 120: errs.append(f'{name} : fond trop sombre -> fond gris clair uni')
    if view in ('front', 'three-quarter-left', 'three-quarter-right'):
        f = face(img)
        if f is None: errs.append(f'{name} : aucun visage detecte -> visage entier, net, sans lunettes ni main devant')
        else:
            # decalage du nez par rapport au milieu des yeux, en fraction de l'ecart des yeux
            mid, iod = (f['eye_r'] + f['eye_l']) / 2, abs(f['eye_l'] - f['eye_r']) or 1e-6
            off = (f['nose'] - mid) / iod
            if view == 'front' and abs(off) > 0.12: errs.append(f'{name} : visage tourne ({off:+.2f}) -> bien de face')
            # sens etalonne sur les photos validees de character-01 : trois-quarts gauche -0,32, droit +0,35
            if view == 'three-quarter-left' and off > -0.12: errs.append(f'{name} : pas assez tourne ou du mauvais cote ({off:+.2f}) -> comme refs/three-quarter-left.jpg')
            if view == 'three-quarter-right' and off < 0.12: errs.append(f'{name} : pas assez tourne ou du mauvais cote ({off:+.2f}) -> comme refs/three-quarter-right.jpg')
    return errs


def check(cid):
    ch = paths(cid)
    errs = [e for v in VIEWS for e in check_view(os.path.join(ch.refs, v + '.jpg'), v)]
    rel = os.path.relpath(ch.refs, PROTO)
    if errs:
        print(f'{cid} : {len(errs)} probleme(s) dans {rel}/ (consignes : data/prompts/{cid}.md)')
        for e in errs: print('  - ' + e)
    else:
        print(f'{cid} : 5 vues conformes ({rel}/) -> python tools/pipeline/build_character.py {cid}')
    return not errs


def main():
    args = sys.argv[1:]
    if not args: raise SystemExit(__doc__)
    if args == ['--all']:
        roster = json.load(open(os.path.join(PROTO, 'data', 'roster.json'), encoding='utf-8'))
        ids = [c['id'] for c in roster['personnages']]
    else:
        ids = args
    ok = [check(cid) for cid in ids]
    sys.exit(0 if all(ok) else 1)


if __name__ == '__main__':
    main()
