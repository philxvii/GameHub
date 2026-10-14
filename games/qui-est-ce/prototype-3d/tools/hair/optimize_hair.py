"""Optimisation d'une coiffure en cartes (sortie de gen_cards.py) sans la regenerer :
memes meches, memes couleurs, seule la facon de les stocker change.

    python tools/hair/optimize_hair.py models/hair/hair-curly-v41.glb build/opt/x.glb [options]

  --drop-tangent           retire les tangentes (inutiles sans anisotropie ni carte de normales)
  --cull VIS.json --cull-px N --cull-front
                           retire les cartes vues sur au plus N pixels (passe de visibilite de
                           bench_hair.js) ; --cull-front : seulement les vues de face (|lacet| <= 90)
  --cull-least F           retire la fraction F des cartes qui comptent le moins de pixels visibles
                           dans les vues de face (--cull-views all : toutes les vues autour de la tete)
  --cull-random F          retire une fraction F de cartes au hasard (essai de reference)
  --simplify MM            supprime les points d'une meche alignes a MM millimetres pres (couleur,
                           normale et UV comprises) : moins de sommets, meme trace
  --tex-scale S            texture redimensionnee (0.5 = 256 x 512)
  --tex-format png|png-la|webp|webp-lossless
  --keep-mask M.npy        ne garde que les cartes marquees (coiffure sous une casquette)
  --quantize               KHR_mesh_quantization : positions 16 bits (--pos-bits N), normales 8 bits,
                           UV 16 bits (--uv8 : 8 bits), couleurs 8 bits (--color16 : 16 bits)

La compression meshopt se fait ensuite avec meshopt_pack.mjs.
"""
import argparse
import io
import json
import os

import cv2
import numpy as np
import pygltflib as G
from PIL import Image

VPC = 26          # sommets par carte a la sortie de gen_cards.py (13 paires gauche / droite)
cm = 0.05634      # 1 cm dans l'espace du modele (gen_cards.py : ecart interpupillaire / 6,3)


def load(path):
    g = G.GLTF2().load(path)
    blob = g.binary_blob()

    def arr(i):
        a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
        dt = {G.FLOAT: np.float32, G.UNSIGNED_INT: np.uint32}[a.componentType]
        k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a.type]
        return np.frombuffer(blob, dt, a.count * k, bv.byteOffset + (a.byteOffset or 0)).reshape(a.count, k).copy()
    pr = g.meshes[0].primitives[0]
    at = pr.attributes
    d = dict(P=arr(at.POSITION), N=arr(at.NORMAL), UV=arr(at.TEXCOORD_0), C=arr(at.COLOR_0),
             I=arr(pr.indices).reshape(-1, 3))
    if at.TANGENT is not None: d['T'] = arr(at.TANGENT)
    im = g.images[0]; bv = g.bufferViews[im.bufferView]
    d['tex'] = cv2.imdecode(np.frombuffer(blob, np.uint8, bv.byteLength, bv.byteOffset), cv2.IMREAD_UNCHANGED)
    d['mat'] = g.materials[0]
    d['name'] = g.nodes[0].name
    return d


# Cartes : n x 13 paires de sommets. Apres simplification les cartes ont des longueurs
# differentes ; on garde alors une liste d'indices de paires par carte.
def as_cards(d):
    n = len(d['P']) // VPC
    return {k: d[k].reshape(n, VPC // 2, 2, -1) for k in ('P', 'N', 'UV', 'C', 'T') if k in d}, n


def keep_cards(d, keep):
    cards, n = as_cards(d)
    out = dict(d)
    for k, v in cards.items(): out[k] = v[keep].reshape(-1, v.shape[-1])
    m = int(keep.sum()) if keep.dtype == bool else len(keep)
    out['I'] = strip_indices([np.arange(VPC // 2)] * m)
    return out


def strip_indices(pairs_per_card):
    """Triangles de chaque ruban : paires k et k+1 -> (a c b), (b c d), comme gen_cards.py."""
    tris, base = [], 0
    for ks in pairs_per_card:
        j = np.arange(len(ks) - 1)
        a, b, c, e = base + 2 * j, base + 2 * j + 1, base + 2 * j + 2, base + 2 * j + 3
        tris += [np.stack([a, c, b], 1), np.stack([b, c, e], 1)]
        base += 2 * len(ks)
    return np.concatenate(tris).astype(np.uint32)


def simplify(d, tol_mm, col_tol=1.5 / 255, nrm_tol_deg=4.0):
    """Douglas-Peucker sur chaque ruban : un point est retire si les deux sommets de la paire,
    leur couleur (sRGB) et leur normale sont reproduits par interpolation lineaire entre
    les points gardes. Les UV (v lineaire le long de la meche) le sont toujours."""
    cards, n = as_cards(d)
    P, N, C = cards['P'], cards['N'], cards['C']
    srgb = np.clip(C[..., :3], 0, 1) ** (1 / 2.2)
    tol = tol_mm * 0.1 * cm
    cos_tol = np.cos(np.radians(nrm_tol_deg))
    kept = []
    for i in range(n):
        keep = np.zeros(P.shape[1], bool); keep[[0, -1]] = True
        stack = [(0, P.shape[1] - 1)]
        while stack:
            a, b = stack.pop()
            if b - a < 2: continue
            k = np.arange(a + 1, b); w = ((k - a) / (b - a))[:, None, None]
            ep = np.linalg.norm(P[i, k] - ((1 - w) * P[i, a] + w * P[i, b]), axis=-1).max(1)
            ec = np.abs(srgb[i, k] - ((1 - w) * srgb[i, a] + w * srgb[i, b])).max((1, 2))
            ni = (1 - w) * N[i, a] + w * N[i, b]; ni /= np.linalg.norm(ni, axis=-1, keepdims=True)
            en = (ni * N[i, k]).sum(-1).min(1)
            bad = (ep > tol) | (ec > col_tol) | (en < cos_tol)
            if bad.any():
                j = k[np.argmax(ep / tol + ec / col_tol + bad)]
                keep[j] = True; stack += [(a, j), (j, b)]
        kept.append(np.nonzero(keep)[0])
    out = dict(d)
    for key, v in cards.items():
        out[key] = np.concatenate([v[i, ks].reshape(-1, v.shape[-1]) for i, ks in enumerate(kept)])
    out['I'] = strip_indices(kept)
    return out


def encode_texture(img, scale, fmt):
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    if fmt == 'png':
        ok, enc = cv2.imencode('.png', img, [cv2.IMWRITE_PNG_COMPRESSION, 9]); return enc.tobytes(), 'image/png'
    bio = io.BytesIO()
    if fmt == 'png-la':                     # la texture est grise : luminance + alpha suffisent
        Image.fromarray(rgba).convert('LA').save(bio, 'PNG', optimize=True); return bio.getvalue(), 'image/png'
    if fmt == 'webp-lossless':
        Image.fromarray(rgba).save(bio, 'WEBP', lossless=True, quality=100, method=6); return bio.getvalue(), 'image/webp'
    if fmt.startswith('webp'):
        q = int(fmt[4:] or 90)
        Image.fromarray(rgba).save(bio, 'WEBP', quality=q, alpha_quality=100, method=6, exact=True); return bio.getvalue(), 'image/webp'
    raise ValueError(fmt)


def write(path, d, tex_bytes, mime, quantize=False, color16=False, pos_bits=16, uv8=False):
    buf = bytearray()
    g = G.GLTF2(asset=G.Asset(version='2.0', generator='GameHub optimize_hair.py')); g.scene = 0
    used, required = [], []

    def view(data, target=None, stride=None):
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(data)
        g.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target, byteStride=stride))
        return len(g.bufferViews) - 1

    def acc(a, ct, typ, target=None, mm=False, norm=False, stride=None, comps=None):
        a = np.ascontiguousarray(a)
        x = G.Accessor(bufferView=view(a.tobytes(), target, stride), componentType=ct, count=len(a), type=typ,
                       normalized=True if norm else None)
        if mm:
            k = comps or a.shape[1]
            x.min = a[:, :k].min(0).tolist(); x.max = a[:, :k].max(0).tolist()
        g.accessors.append(x); return len(g.accessors) - 1

    node = G.Node(name=d['name'], mesh=0)
    P, N, UV, C = d['P'], d['N'], d['UV'], d['C']
    if quantize:
        used.append('KHR_mesh_quantization'); required.append('KHR_mesh_quantization')
        lo = P.min(0); ext = float((P.max(0) - lo).max())
        top = (1 << pos_bits) - 1                                         # moins de bits : deltas plus petits, meilleure compression
        q = np.round((P - lo) / ext * top).astype(np.uint16)
        q4 = np.zeros((len(q), 4), np.uint16); q4[:, :3] = q            # pas de 8 octets (alignement)
        node.translation = lo.astype(float).tolist(); node.scale = [ext / top] * 3
        attrs = dict(POSITION=acc(q4, G.UNSIGNED_SHORT, G.VEC3, G.ARRAY_BUFFER, True, stride=8, comps=3))
        n8 = np.zeros((len(N), 4), np.int8); n8[:, :3] = np.round(np.clip(N, -1, 1) * 127)
        attrs['NORMAL'] = acc(n8, G.BYTE, G.VEC3, G.ARRAY_BUFFER, norm=True, stride=4)
        if uv8:
            attrs['TEXCOORD_0'] = acc(np.round(np.clip(UV, 0, 1) * 255).astype(np.uint8), G.UNSIGNED_BYTE, G.VEC2, G.ARRAY_BUFFER, norm=True, stride=4)
        else:
            attrs['TEXCOORD_0'] = acc(np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16), G.UNSIGNED_SHORT, G.VEC2, G.ARRAY_BUFFER, norm=True)
        if color16:
            attrs['COLOR_0'] = acc(np.round(np.clip(C, 0, 1) * 65535).astype(np.uint16), G.UNSIGNED_SHORT, G.VEC4, G.ARRAY_BUFFER, norm=True)
        else:
            attrs['COLOR_0'] = acc(np.round(np.clip(C, 0, 1) * 255).astype(np.uint8), G.UNSIGNED_BYTE, G.VEC4, G.ARRAY_BUFFER, norm=True)
    else:
        attrs = dict(POSITION=acc(P.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER, True),
                     NORMAL=acc(N.astype(np.float32), G.FLOAT, G.VEC3, G.ARRAY_BUFFER),
                     TEXCOORD_0=acc(UV.astype(np.float32), G.FLOAT, G.VEC2, G.ARRAY_BUFFER),
                     COLOR_0=acc(C.astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER))
    if 'T' in d:
        attrs['TANGENT'] = acc(d['T'].astype(np.float32), G.FLOAT, G.VEC4, G.ARRAY_BUFFER)
    I = d['I'].reshape(-1)
    ind = acc(I.astype(np.uint16), G.UNSIGNED_SHORT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER) if I.max() < 65535 \
        else acc(I.astype(np.uint32), G.UNSIGNED_INT, G.SCALAR, G.ELEMENT_ARRAY_BUFFER)

    g.images.append(G.Image(bufferView=view(tex_bytes), mimeType=mime))
    g.samplers.append(G.Sampler(magFilter=G.LINEAR, minFilter=G.LINEAR_MIPMAP_LINEAR))
    if mime == 'image/webp':
        used.append('EXT_texture_webp'); required.append('EXT_texture_webp')
        g.textures.append(G.Texture(sampler=0, extensions={'EXT_texture_webp': {'source': 0}}))
    else:
        g.textures.append(G.Texture(source=0, sampler=0))
    mat = d['mat']
    used += [e for e in (mat.extensions or {}) if e not in used]
    g.materials.append(mat)
    g.meshes.append(G.Mesh(name='hair', primitives=[G.Primitive(attributes=G.Attributes(**attrs), indices=ind, material=0)]))
    g.nodes.append(node); g.scenes.append(G.Scene(nodes=[0]))
    g.extensionsUsed = used
    if required: g.extensionsRequired = required
    g.buffers.append(G.Buffer(byteLength=len(buf))); g.set_binary_blob(bytes(buf)); g.save_binary(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--drop-tangent', action='store_true')
    ap.add_argument('--cull'); ap.add_argument('--cull-px', type=int, default=0); ap.add_argument('--cull-front', action='store_true')
    ap.add_argument('--cull-least', type=float, default=0.0)
    ap.add_argument('--cull-views', default='front', choices=['front', 'all'])
    ap.add_argument('--cull-random', type=float, default=0.0)
    ap.add_argument('--simplify', type=float, default=0.0)
    ap.add_argument('--tex-scale', type=float, default=1.0)
    ap.add_argument('--tex-format', default='png')
    ap.add_argument('--keep-tex', action='store_true', help='octets de la texture source repris tels quels')
    ap.add_argument('--quantize', action='store_true'); ap.add_argument('--color16', action='store_true')
    ap.add_argument('--pos-bits', type=int, default=16); ap.add_argument('--uv8', action='store_true')
    ap.add_argument('--keep-mask', help='.npy : booleen par carte (coiffure sous un chapeau, tools/accessories/hat.py)')
    a = ap.parse_args()

    d = load(a.src)
    n0 = len(d['P']) // VPC
    if a.drop_tangent: d.pop('T', None)
    keep = np.ones(n0, bool)
    if a.cull:
        v = json.load(open(a.cull))
        cam = np.array(v['cam'])
        if a.cull_front: cam = cam[[abs(x['yaw']) <= 90 for x in v['views']]]
        keep &= (cam.sum(0) > a.cull_px) | (np.array(v['light']).sum(0) > a.cull_px)
    if a.cull_least:
        v = json.load(open(a.cull)) if a.cull else None
        sel = [abs(x['yaw']) <= 90 or a.cull_views == 'all' for x in v['views']]
        cam = np.array(v['cam'])[sel].sum(0)
        order = np.argsort(cam + np.where(keep, 0, -1e9))
        keep[order[:int(round(a.cull_least * n0))]] = False
    if a.keep_mask:
        keep &= np.load(a.keep_mask).astype(bool)
    if a.cull_random:
        rng = np.random.default_rng(7)
        keep[rng.choice(n0, int(round(a.cull_random * n0)), replace=False)] = False
    if not keep.all(): d = keep_cards(d, keep)
    if a.simplify: d = simplify(d, a.simplify)
    if a.keep_tex:
        g = G.GLTF2().load(a.src); bv = g.bufferViews[g.images[0].bufferView]
        tex, mime = g.binary_blob()[bv.byteOffset:bv.byteOffset + bv.byteLength], g.images[0].mimeType
    else:
        tex, mime = encode_texture(d['tex'], a.tex_scale, a.tex_format)
    os.makedirs(os.path.dirname(a.dst) or '.', exist_ok=True)
    write(a.dst, d, tex, mime, a.quantize, a.color16, a.pos_bits, a.uv8)
    print(json.dumps(dict(dst=a.dst, cards=int(keep.sum()), vertices=len(d['P']), triangles=len(d['I']),
                          tex_kb=round(len(tex) / 1024), kb=round(os.path.getsize(a.dst) / 1024))))


if __name__ == '__main__':
    main()
