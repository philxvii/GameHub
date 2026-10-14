"""Variante « rasee de pres » du personnage 01 : la barbe peinte dans la texture du visage est
remplacee par la peau voisine, avec une legere ombre de rasage.

    python tools/accessories/shave.py

Sert aux personnages de substitution sans barbe ni moustache (tant que seul character-01
existe) : sinon tous paraitraient barbus et la question « A-t-il une barbe ? » serait illisible.
Les zones viennent des memes regions que la pilosite (beard.py), projetees dans la texture par
les UV de la peau ; remplissage = flou normalise de la peau hors barbe (couleur locale), grain
de peau repris de la joue, teinte bleutee tres legere. Jamais ecrit sur un modele valide :
models/character-01-ict-opt-shaved.glb, a cote.
"""
import io
import os
import subprocess
import sys

import cv2
import numpy as np
import pygltflib as G

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from head import Head, _reader                 # noqa: E402
from beard import Face                         # noqa: E402

PROTO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(PROTO, 'models', 'character-01-ict.glb')


def main():
    g = G.GLTF2().load(SRC); arr = _reader(g); blob = g.binary_blob()
    mats = [m.name for m in g.materials]
    prim = next(p for m in g.meshes if m.name == 'head' for p in m.primitives if mats[p.material] == 'skin')
    P = arr(prim.attributes.POSITION); UV = arr(prim.attributes.TEXCOORD_0); Fi = arr(prim.indices).astype(int).reshape(-1, 3)
    mat = g.materials[mats.index('skin')]
    img_i = g.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source
    bv = g.bufferViews[g.images[img_i].bufferView]
    tex = cv2.imdecode(np.frombuffer(blob, np.uint8, bv.byteLength, bv.byteOffset), cv2.IMREAD_COLOR)
    H, W = tex.shape[:2]
    h = Head(); face = Face(h)
    R = (P - h.eye_mid) / h.cm
    N = np.zeros_like(P)
    fn = np.cross(P[Fi[:, 1]] - P[Fi[:, 0]], P[Fi[:, 2]] - P[Fi[:, 0]])
    for k in range(3): np.add.at(N, Fi[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    dens = np.maximum(face.density('beard', R, N), face.density('moustache', R, N))
    # la moustache peinte descend jusqu au bord de la levre (les levres roses sont une autre primitive,
    # le materiau mouth : la peau peut etre repeinte jusqu a la ligne de la bouche)
    # (la densite de la pilosite exclut l'ellipse des levres, qu'il faut ici quand meme raser)
    x = R[:, 0] - face.mouth[0]
    lip_band = (R[:, 1] > face.mouth[1] + 0.08) & (R[:, 1] < face.nose[1] - 0.55) & (np.abs(x) < face.mouth_w + 0.6) & (N[:, 2] > -0.2)
    dens = np.maximum(dens, lip_band * 0.9)
    # densite peinte dans l'espace UV (triangles rasterises, valeur moyenne des sommets)
    mask = np.zeros((H, W), np.float32)
    uvp = np.stack([UV[:, 0] * W, UV[:, 1] * H], 1)
    for f in Fi:
        v = dens[f].mean()
        if v < 0.05: continue
        cv2.fillConvexPoly(mask, np.round(uvp[f] * 4).astype(np.int32), float(v), shift=2)
    mask = cv2.GaussianBlur(cv2.dilate(mask, np.ones((9, 9), np.uint8)), (0, 0), 6)
    m = np.clip(mask * 1.6, 0, 1)[..., None]
    # teint de reference : mediane des pixels de joue sans barbe (sommets de joue projetes en UV)
    cheek = (np.abs(R[:, 0]) > 2.5) & (np.abs(R[:, 0]) < 5) & (R[:, 1] < -1.5) & (R[:, 1] > -3.5) & (N[:, 2] > 0.3) & (dens < 0.01)
    px = np.clip(np.round(uvp[cheek]).astype(int), 0, [W - 1, H - 1])
    ref = np.median(tex[px[:, 1], px[:, 0]].astype(np.float32), axis=0)
    # couleur locale sans barbe (flou normalise) la ou il y a assez de peau propre autour,
    # sinon le teint de reference (sous le menton l'atlas borde du vide : le flou y devenait noir)
    keep = (1 - np.clip(mask * 3, 0, 1)).astype(np.float32)
    num = cv2.GaussianBlur(tex.astype(np.float32) * keep[..., None], (0, 0), 28)
    den = cv2.GaussianBlur(keep, (0, 0), 28)[..., None]
    local = num / (den + 1e-4)
    trust = np.clip((den - 0.25) / 0.35, 0, 1)
    skin = local * trust + ref * (1 - trust)
    skin = 0.5 * skin + 0.5 * ref                                          # rapproche du teint des joues
    rng = np.random.default_rng(5)
    noise = rng.normal(0, 2.5, (H, W, 1)).astype(np.float32)
    shadow = np.array([1.0, 0.965, 0.93], np.float32)                    # BGR : ombre de rasage tres legerement bleutee
    shaved = skin * shadow + noise
    out = tex.astype(np.float32) * (1 - m) + shaved * m
    ok, enc = cv2.imencode('.jpg', np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    tmp = os.path.join(PROTO, 'build', 'opt', 'skin-shaved.jpg'); os.makedirs(os.path.dirname(tmp), exist_ok=True)
    open(tmp, 'wb').write(enc.tobytes())
    small = cv2.resize(np.hstack([tex, np.clip(out, 0, 255).astype(np.uint8)]), None, fx=0.25, fy=0.25)
    cv2.imwrite(os.path.join(PROTO, 'build', 'opt', 'skin-shaved-compare.jpg'), small)
    dst = os.path.join(PROTO, 'models', 'character-01-ict-opt-shaved.glb')
    subprocess.run([sys.executable, os.path.join(PROTO, 'tools', 'character-ict', 'optimize_character.py'), SRC, dst,
                    '--drop-shells', '--tex-file', f'skin={tmp}', '--tex', 'body=jpeg:85@0.5', '--pack', '-vp 16 -vt 16 -cc'], check=True)
    print(dst, os.path.getsize(dst))


if __name__ == '__main__':
    main()
