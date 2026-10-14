"""Ajuste des coiffures MakeHuman (CC0, cartes de cheveux) sur la tete du personnage.

Principe : chaque sommet d'une coiffure MakeHuman est lie (.mhclo) a 3 sommets de la
tete de base MakeHuman (poids + decalage). On deforme la tete de base pour epouser
notre tete ICT (similitude par ICP, puis ajustement local lisse), et on recalcule
chaque meche a partir de cette tete deformee : la coiffure prend la forme du crane.

Usage : python fit_hair.py <dossier assets MakeHuman extraits> <base.obj>
Sortie : models/hair/<id>.glb + models/hair/hairs.json (lu par compare.html)
"""
import json, os, sys
import numpy as np, cv2
from scipy.spatial import cKDTree
import pygltflib as G

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(PROTO, 'models', 'hair'); os.makedirs(OUT, exist_ok=True)
ASSETS, BASE_OBJ = sys.argv[1], sys.argv[2]
CHARACTER = os.path.join(PROTO, 'models', 'character-01-ict.glb')
HAIR_RGB = np.array([42, 31, 24], np.float64)          # brun fonce des photos (sRGB)

STYLES = [
    {'id': 'hair-short', 'name': 'ICT + coiffure courte', 'note': 'MakeHuman short02, CC0',
     'dir': 'short02', 'mhclo': 'short02.mhclo', 'scalp': 0.0},
    {'id': 'hair-messy', 'name': 'ICT + coiffure mi-longue décoiffée', 'note': 'MakeHuman cortu_short_messy_hair, CC0',
     'dir': 'cortu_short_messy_hair', 'mhclo': 'cortu_short_messy_hair.mhclo', 'scalp': 0.0},
    {'id': 'hair-volume', 'name': 'ICT + coiffure volumineuse', 'note': 'MakeHuman afro01, CC0',
     'dir': 'afro01', 'mhclo': 'afro01.mhclo', 'scalp': 0.0},
]


def read_obj(path):
    v, vt, faces = [], [], []
    for l in open(path, encoding='utf8', errors='ignore'):
        if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): vt.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '):
            idx = [p.split('/') for p in l.split()[1:]]
            vi = [int(p[0]) - 1 for p in idx]; ti = [int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in idx]
            for k in range(1, len(vi) - 1): faces.append((vi[0], vi[k], vi[k + 1], ti[0], ti[k], ti[k + 1]))
    return np.array(v), np.array(vt) if vt else np.zeros((0, 2)), np.array(faces)


def read_mhclo(path):
    meta, rows, in_verts = {}, [], False
    for l in open(path, encoding='utf8', errors='ignore'):
        l = l.strip()
        if not l or l.startswith('#'): continue
        if in_verts:
            parts = l.split()
            if len(parts) in (9, 1) and all(p.replace('.', '', 1).replace('-', '', 1).replace('e', '', 1).isdigit() or p.lstrip('-').replace('.', '', 1).isdigit() for p in parts):
                if len(parts) == 9: rows.append([float(x) for x in parts]); continue
                if len(parts) == 1: rows.append([float(parts[0]), 0, 0, 1, 0, 0, 0, 0, 0]); continue
            in_verts = False
        if l.startswith('verts'): in_verts = True; continue
        k, *rest = l.split()
        meta.setdefault(k, []).append(rest)
    return meta, np.array(rows)


def read_glb_head(path):
    """Sommets de peau (materiaux skin + scalp) du personnage, repere du modele."""
    g = G.GLTF2().load(path); blob = g.binary_blob()
    def arr(i):
        a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
        n = {G.VEC3: 3, G.VEC2: 2, G.SCALAR: 1}[a.type]
        dt = {G.FLOAT: np.float32, G.UNSIGNED_INT: np.uint32}[a.componentType]
        return np.frombuffer(blob, dt, a.count * n, bv.byteOffset + (a.byteOffset or 0)).reshape(a.count, n)
    mats = [m.name for m in g.materials]
    head = [m for m in g.meshes if m.name == 'head'][0]
    pts = [arr(p.attributes.POSITION) for p in head.primitives if mats[p.material] in ('skin', 'scalp')]
    # niveau des yeux : noeud eyeLeft (relatif a Head) + position monde de Head
    nodes = {n.name: n for n in g.nodes}
    head_world = sum(np.array(nodes[n].translation) for n in ('Hips', 'Spine2', 'Neck', 'Head'))
    eye_y = (head_world + np.array(nodes['eyeLeft'].translation))[1]
    return np.vstack(pts).astype(np.float64), eye_y


def umeyama(src, dst):
    ms, md = src.mean(0), dst.mean(0); S, D = src - ms, dst - md
    U, sig, Vt = np.linalg.svd(D.T @ S / len(src))
    E = np.eye(3); E[2, 2] = np.sign(np.linalg.det(U @ Vt)); R = U @ E @ Vt
    s = (sig * np.diag(E)).sum() / (S ** 2).sum() * len(src)
    return s, R, md - s * R @ ms


def tinted_texture(png_path, size=1024):
    """Recolore la texture de la coiffure au brun des photos, alpha conserve."""
    im = cv2.imread(png_path, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 3: im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    im = cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)
    a = im[..., 3].astype(np.float64) / 255
    lum = im[..., :3].astype(np.float64).mean(2)
    ref = np.median(lum[a > 0.5]) if (a > 0.5).any() else lum.mean()
    k = np.clip(lum / max(ref, 1), 0.35, 2.2) ** 0.8                  # garde le relief des meches
    rgb = HAIR_RGB[None, None, ::-1] * k[..., None] * 1.15            # BGR
    out = np.dstack([np.clip(rgb, 0, 255), im[..., 3]]).astype(np.uint8)
    return out


def write_glb(path, P, N, UV, F, rgba, normal_png=None):
    buf = bytearray()
    g = G.GLTF2(asset=G.Asset(version='2.0', generator='GameHub fit_hair.py (MakeHuman CC0)')); g.scene = 0
    def view(data, target=None):
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(data)
        g.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target)); return len(g.bufferViews) - 1
    def acc(a, ct, typ, target=None, mm=False):
        a = np.ascontiguousarray(a); acc_ = G.Accessor(bufferView=view(a.tobytes(), target), componentType=ct, count=len(a), type=typ)
        if mm: acc_.min = a.min(0).tolist(); acc_.max = a.max(0).tolist()
        g.accessors.append(acc_); return len(g.accessors) - 1
    def tex(img, mime):
        ok, enc = cv2.imencode('.png', img)
        g.images.append(G.Image(bufferView=view(enc.tobytes()), mimeType=mime))
        g.samplers.append(G.Sampler(magFilter=G.LINEAR, minFilter=G.LINEAR_MIPMAP_LINEAR))
        g.textures.append(G.Texture(source=len(g.images) - 1, sampler=len(g.samplers) - 1)); return len(g.textures) - 1
    pbr = G.PbrMetallicRoughness(baseColorTexture=G.TextureInfo(index=tex(rgba, 'image/png')), metallicFactor=0.0, roughnessFactor=0.55)
    mat = G.Material(name='hair-cards', pbrMetallicRoughness=pbr, doubleSided=True, alphaMode='MASK', alphaCutoff=0.4)
    if normal_png is not None:
        mat.normalTexture = G.NormalMaterialTexture(index=tex(normal_png, 'image/png'), scale=0.6)
    g.materials.append(mat)
    prim = G.Primitive(attributes=G.Attributes(
        POSITION=acc(P.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
        NORMAL=acc(N.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
        TEXCOORD_0=acc(UV.astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER)),
        indices=acc(F.reshape(-1).astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER), material=0)
    g.meshes.append(G.Mesh(name='hair', primitives=[prim]))
    g.nodes.append(G.Node(name=os.path.basename(path)[:-4], mesh=0)); g.scenes.append(G.Scene(nodes=[0]))
    g.buffers.append(G.Buffer(byteLength=len(buf))); g.set_binary_blob(bytes(buf)); g.save_binary(path)


def main():
    B0, _, _ = read_obj(BASE_OBJ)
    target, eye_y = read_glb_head(CHARACTER)
    out = []
    for st in STYLES:
        d = os.path.join(ASSETS, st['dir'])
        meta, rows = read_mhclo(os.path.join(d, st['mhclo']))
        obj = os.path.join(d, meta['obj_file'][0][0])
        HV, HT, HF = read_obj(obj)
        idx = rows[:, :3].astype(int); w = rows[:, 3:6]; off = rows[:, 6:9]
        ref = np.unique(idx)
        # zone d'ancrage : sommets MakeHuman references, cote ICT : peau au-dessus des yeux
        tgt = target[target[:, 1] > eye_y - 0.02]
        tree = cKDTree(tgt)
        src0 = B0[ref]
        s0 = np.ptp(tgt[:, 0]) / np.ptp(src0[:, 0])
        src = (src0 - src0.mean(0)) * s0 + tgt.mean(0)
        s, R, t = s0, np.eye(3), tgt.mean(0) - s0 * src0.mean(0)
        for _ in range(40):                                      # ICP avec echelle
            cur = (s * (R @ B0[ref].T)).T + t
            _, nn = tree.query(cur)
            s, R, t = umeyama(B0[ref], tgt[nn])
        B = (s * (R @ B0.T)).T + t
        # ajustement local : chaque sommet d'ancrage rejoint la peau ICT, deplacement lisse
        dist, nn = tree.query(B[ref])
        disp = tgt[nn] - B[ref]
        kd_ref = cKDTree(B[ref])
        for _ in range(3):
            _, nb = kd_ref.query(B[ref], k=8)
            disp = disp[nb].mean(1)
        B[ref] += disp
        # meches recalculees depuis la tete deformee (echelles par axe : .mhclo)
        sc = np.ones(3)
        for ax, key in enumerate(('x_scale', 'y_scale', 'z_scale')):
            if key in meta:
                a_, b_, ref_d = int(meta[key][0][0]), int(meta[key][0][1]), float(meta[key][0][2])
                sc[ax] = abs(B[a_][ax] - B[b_][ax]) / ref_d
        P = np.einsum('nk,nkd->nd', w, B[idx]) + (R @ (off * sc).T).T
        # sommets de la coiffure (le .mhclo suit l'ordre des sommets de l'obj)
        n = min(len(P), len(HV))
        P = P[:n]
        F = HF[:, :3]; T = HF[:, 3:]
        F = F[(F < n).all(1)]; T = T[:len(F)]
        # un sommet glTF par couple (position, uv)
        pairs, inv = np.unique(np.stack([F.ravel(), T.ravel()], 1), axis=0, return_inverse=True)
        pv, pt = pairs[:, 0], pairs[:, 1]
        fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
        vn = np.zeros_like(P)
        for k in range(3): np.add.at(vn, F[:, k], fn)
        vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
        # normales orientees vers l'exterieur du crane (cartes double face)
        out_dir = P - tgt.mean(0); flip = (vn * out_dir).sum(1) < 0; vn[flip] *= -1
        UV = HT[pt] * np.array([1, -1]) + np.array([0, 1])
        tex_name = [l[0] for l in meta.get('material', [[None]])][0]
        mhmat = os.path.join(d, tex_name) if tex_name else None
        diffuse, normal = None, None
        if mhmat and os.path.exists(mhmat):
            for l in open(mhmat, encoding='utf8', errors='ignore'):
                if l.startswith('diffuseTexture'): diffuse = os.path.join(d, l.split()[1])
                if l.startswith('normalmapTexture'): normal = os.path.join(d, l.split()[1])
        rgba = tinted_texture(diffuse)
        nrm = cv2.resize(cv2.imread(normal), (1024, 1024)) if normal and os.path.exists(normal) else None
        path = os.path.join(OUT, st['id'] + '.glb')
        write_glb(path, P[pv], vn[pv], UV, inv.reshape(-1, 3), rgba, nrm)
        gap = dist.mean() / (np.ptp(tgt[:, 1]) or 1)
        print(f"{st['id']:12s} {len(F)} triangles, {os.path.getsize(path) / 1024:.0f} Ko, echelle {s:.4f}, "
              f"ecart d'ancrage {gap * 100:.1f} % de la hauteur, texture {os.path.basename(diffuse)}")
        out.append({'id': st['id'], 'name': st['name'], 'note': st['note'], 'file': f"models/hair/{st['id']}.glb"})
    json.dump(out, open(os.path.join(OUT, 'hairs.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
