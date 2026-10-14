"""Outils communs des generateurs d'accessoires : balayage d'un profil le long d'un chemin,
assemblage de maillages, ecriture GLB (materiaux PBR, textures, extensions, expressions),
compression par gltfpack (meshopt, positions 16 bits).
"""
import io
import json
import os
import subprocess
import tempfile

import numpy as np
import pygltflib as G
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.normpath(os.path.join(HERE, '..', '..'))
GLTFPACK = os.path.join(PROTO, 'build', 'tools', 'node_modules', '.bin', 'gltfpack')


def resample(P, n, closed=False):
    """n points repartis a pas egal le long d'une polyligne."""
    Q = np.vstack([P, P[:1]]) if closed else P
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
    t = np.linspace(0, d[-1], n + (1 if closed else 0))[:n] if closed else np.linspace(0, d[-1], n)
    return np.stack([np.interp(t, d, Q[:, k]) for k in range(3)], 1)


def smooth(P, it=2, closed=False):
    for _ in range(it):
        Q = P.copy()
        if closed: Q = (np.roll(P, 1, 0) + 2 * P + np.roll(P, -1, 0)) / 4
        else: Q[1:-1] = (P[:-2] + 2 * P[1:-1] + P[2:]) / 4
        P = Q
    return P


def frames(P, closed=False, up=(0, 0, 1)):
    """Reperes le long d'un chemin (transport parallele) : tangente, normale, binormale."""
    T = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if closed else np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.asarray(up, float)
    N = np.zeros_like(P); n = np.cross(T[0], up)
    if np.linalg.norm(n) < 1e-6: n = np.cross(T[0], [0, 1, 0])
    N[0] = n / np.linalg.norm(n)
    for i in range(1, len(P)):
        v = N[i - 1] - T[i] * (N[i - 1] @ T[i]); N[i] = v / np.linalg.norm(v)
    B = np.cross(T, N)
    return T, N, B


def sweep(P, profile, closed=False, scale=None, up=(0, 0, 1), frame=None, cap=True, u_scale=1.0):
    """Tube : profil 2D (m points, ferme, sens trigo) balaye le long de P.
    profile[:, 0] suit N, profile[:, 1] suit B. scale : facteur (n, 2) le long du chemin.
    frame : (N, B) imposes (sinon transport parallele). Renvoie positions, normales, UV, indices."""
    n, m = len(P), len(profile)
    if frame is None: _, Nf, Bf = frames(P, closed, up)
    else: Nf, Bf = frame
    sc = np.ones((n, 2)) if scale is None else np.asarray(scale, float).reshape(n, -1) * np.ones((1, 2))
    prof = profile[None] * sc[:, None, :]                                     # (n, m, 2)
    pos = P[:, None, :] + prof[..., :1] * Nf[:, None, :] + prof[..., 1:] * Bf[:, None, :]
    # normales du profil (perpendiculaires a l'arete dans le plan du profil), lissees
    e = np.roll(profile, -1, 0) - np.roll(profile, 1, 0)
    pn = np.stack([e[:, 1], -e[:, 0]], 1); pn /= np.linalg.norm(pn, axis=1, keepdims=True)
    nor = pn[None, :, :1] * Nf[:, None, :] + pn[None, :, 1:] * Bf[:, None, :]
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    uv = np.stack(np.broadcast_arrays(L[:, None] * u_scale, (np.arange(m) / m)[None, :]), -1)
    rows = n if closed else n - 1
    idx = []
    for i in range(rows):
        a, b = i * m, ((i + 1) % n) * m
        for j in range(m):
            j2 = (j + 1) % m
            idx += [(a + j, b + j, b + j2), (a + j, b + j2, a + j2)]
    pos, nor, uv = pos.reshape(-1, 3), nor.reshape(-1, 3), uv.reshape(-1, 2)
    I = np.array(idx, np.int64)
    if cap and not closed:                                                     # bouchons plats aux deux bouts
        for end, sgn in ((0, -1), (n - 1, 1)):
            T = P[min(end + 1, n - 1)] - P[max(end - 1, 0)]; T = sgn * T / np.linalg.norm(T)
            ring = pos[end * m:(end + 1) * m]; c = ring.mean(0)
            base = len(pos)
            pos = np.vstack([pos, ring, c[None]]); nor = np.vstack([nor, np.repeat(T[None], m + 1, 0)])
            uv = np.vstack([uv, np.zeros((m + 1, 2))])
            tri = [(base + m, base + j, base + (j + 1) % m) if sgn > 0 else (base + m, base + (j + 1) % m, base + j) for j in range(m)]
            I = np.vstack([I, np.array(tri)])
    return pos, nor, uv, orient(pos, nor, I)


def orient(pos, nor, I):
    """Remet chaque triangle dans le sens de ses normales (le repere du balayage peut etre direct
    ou indirect : sans cela un tube se verrait par l'interieur avec un materiau simple face)."""
    fn = np.cross(pos[I[:, 1]] - pos[I[:, 0]], pos[I[:, 2]] - pos[I[:, 0]])
    flip = np.einsum('ij,ij->i', fn, nor[I].sum(1)) < 0
    I = I.copy(); I[flip] = I[flip][:, ::-1]
    return I


def rounded_rect(w, h, r, k=4):
    """Profil rectangle a coins arrondis (largeur w selon N, hauteur h selon B), sens trigo."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for a in np.radians(np.linspace(a0, a0 + 90, k + 1)):
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return np.array(pts)


def circle(r, m=10):
    a = np.linspace(0, 2 * np.pi, m, endpoint=False)
    return np.stack([r * np.cos(a), r * np.sin(a)], 1)


class Mesh:
    """Accumulateur d'un maillage (une primitive, un materiau)."""

    def __init__(self):
        self.P, self.N, self.UV, self.I, self.n = [], [], [], [], 0

    def add(self, pos, nor, uv, idx):
        self.P.append(pos); self.N.append(nor); self.UV.append(uv); self.I.append(idx + self.n); self.n += len(pos)
        return self

    def arrays(self):
        return np.vstack(self.P), np.vstack(self.N), np.vstack(self.UV), np.vstack(self.I)


class Glb:
    """Ecrit un GLB : un noeud racine, un noeud par maillage, materiaux PBR."""

    def __init__(self, root='accessory', generator='GameHub tools/accessories'):
        self.g = G.GLTF2(asset=G.Asset(version='2.0', generator=generator)); self.g.scene = 0
        self.g.scenes = [G.Scene(nodes=[0])]; self.g.nodes = [G.Node(name=root, children=[])]
        self.buf = bytearray(); self.used = set()

    def _view(self, data, target=None):
        while len(self.buf) % 4: self.buf.append(0)
        off = len(self.buf); self.buf += data
        self.g.bufferViews.append(G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target))
        return len(self.g.bufferViews) - 1

    def _acc(self, a, type_, ctype=G.FLOAT, target=G.ARRAY_BUFFER, minmax=False):
        a = np.ascontiguousarray(a)
        v = self._view(a.tobytes(), target)
        acc = G.Accessor(bufferView=v, componentType=ctype, count=len(a), type=type_)
        if minmax: acc.min = a.min(0).tolist(); acc.max = a.max(0).tolist()
        self.g.accessors.append(acc); return len(self.g.accessors) - 1

    def image(self, img, mime='image/png'):
        b = io.BytesIO(); img.save(b, 'PNG' if mime == 'image/png' else 'JPEG', quality=90); v = self._view(b.getvalue())
        self.g.images.append(G.Image(bufferView=v, mimeType=mime))
        self.g.samplers.append(G.Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497))
        self.g.textures.append(G.Texture(source=len(self.g.images) - 1, sampler=len(self.g.samplers) - 1))
        return len(self.g.textures) - 1

    def material(self, name, color=(1, 1, 1, 1), metal=0.0, rough=0.5, tex=None, blend=False, double=False, ext=None):
        pbr = G.PbrMetallicRoughness(baseColorFactor=list(color), metallicFactor=metal, roughnessFactor=rough,
                                     baseColorTexture=G.TextureInfo(index=tex) if tex is not None else None)
        m = G.Material(name=name, pbrMetallicRoughness=pbr, doubleSided=double, alphaMode='BLEND' if blend else 'OPAQUE', extensions=ext or {})
        for k in (ext or {}): self.used.add(k)
        self.g.materials.append(m); return len(self.g.materials) - 1

    def mesh(self, name, mesh, material, targets=None, target_names=None):
        P, N, UV, I = mesh.arrays()
        attrs = G.Attributes(POSITION=self._acc(P.astype(np.float32), G.VEC3, minmax=True),
                             NORMAL=self._acc((N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)).astype(np.float32), G.VEC3),
                             TEXCOORD_0=self._acc(UV.astype(np.float32), G.VEC2))
        prim = G.Primitive(attributes=attrs, indices=self._acc(I.astype(np.uint32).reshape(-1), G.SCALAR, G.UNSIGNED_INT, G.ELEMENT_ARRAY_BUFFER), material=material)
        extras = {}
        if targets is not None:
            prim.targets = [{'POSITION': self._acc(t.astype(np.float32), G.VEC3, minmax=True)} for t in targets]
            extras = {'targetNames': list(target_names)}
        self.g.meshes.append(G.Mesh(name=name, primitives=[prim], extras=extras, weights=[0.0] * len(targets) if targets is not None else None))
        self.g.nodes.append(G.Node(name=name, mesh=len(self.g.meshes) - 1))
        self.g.nodes[0].children.append(len(self.g.nodes) - 1)
        return int(len(I))

    def save(self, path, pack=True, extras=None):
        if extras: self.g.nodes[0].extras = extras
        self.g.extensionsUsed = sorted(self.used)
        self.g.buffers = [G.Buffer(byteLength=len(self.buf))]; self.g.set_binary_blob(bytes(self.buf))
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        if not pack:
            self.g.save_binary(path); return os.path.getsize(path)
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, 'raw.glb'); self.g.save_binary(raw)
            r = subprocess.run([GLTFPACK, '-i', raw, '-o', path, '-kn', '-km', '-ke', '-vp', '16', '-vt', '14', '-cc'], capture_output=True, text=True)
            if r.returncode: raise SystemExit(r.stderr or r.stdout)
        return os.path.getsize(path)


def fbm(shape, rng, octaves=5, base=8):
    """Bruit fractal lisse (somme d'octaves de bruit bilineaire), valeurs 0..1, raccordable."""
    h, w = shape; out = np.zeros(shape)
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.random((n, n))
        gi = np.vstack([g, g[:1]]); gi = np.hstack([gi, gi[:, :1]])
        y = np.linspace(0, n, h, endpoint=False); x = np.linspace(0, n, w, endpoint=False)
        y0, x0 = y.astype(int), x.astype(int); fy, fx = (y - y0)[:, None], (x - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a = gi[y0][:, x0]; b = gi[y0][:, x0 + 1]; c = gi[y0 + 1][:, x0]; d = gi[y0 + 1][:, x0 + 1]
        out += ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) / 2 ** o
    out -= out.min(); return out / out.max()


def write_stats(path, **kw):
    with open(path, 'w', encoding='utf-8') as f: json.dump(kw, f, indent=1, ensure_ascii=False)
