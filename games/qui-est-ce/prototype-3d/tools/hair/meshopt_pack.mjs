// Compression meshopt (EXT_meshopt_compression) d'un GLB a une primitive, deja quantifie
// par optimize_hair.py. Les sommets sont d'abord reordonnes pour le cache GPU et la
// compression (meme maillage, meme rendu). Le decodeur est celui que charge le moteur
// (three/addons/libs/meshopt_decoder.module.js).
//
//   npm install --prefix build/tools meshoptimizer          # une fois (build/ n'est pas versionne)
//   node tools/hair/meshopt_pack.mjs build/opt/x.glb build/opt/x-meshopt.glb [--v1]

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, '..', '..', 'build', 'tools', 'node_modules', 'meshoptimizer', 'index.js');
const { MeshoptEncoder } = await import(pathToFileURL(lib).href);
await MeshoptEncoder.ready;

const [src, dst, ...opt] = process.argv.slice(2);
const VERSION = opt.includes('--v1') ? 1 : 0;           // codec de sommets v1 : plus compact, decodeur recent
const glb = fs.readFileSync(src);
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const viewBytes = (i) => { const v = gltf.bufferViews[i]; return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };

const prim = gltf.meshes[0].primitives[0];
const ia = gltf.accessors[prim.indices];
const iv = viewBytes(ia.bufferView);
const indices = ia.componentType === 5125
  ? new Uint32Array(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength))
  : Uint32Array.from(new Uint16Array(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength)));
const vcount = gltf.accessors[prim.attributes.POSITION].count;

// 1. Ordre des triangles et des sommets (indices remplaces sur place)
const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
if (unique !== vcount) throw new Error(`sommets inutilises : ${vcount - unique}`);

// 2. Nouveau binaire : vues compressees + images telles quelles
const out = [];
let outLen = 0;
const push = (bytes) => { while (outLen % 4) { out.push(Buffer.alloc(1)); outLen++; } const off = outLen; out.push(Buffer.from(bytes)); outLen += bytes.length; return off; };
let fallbackLen = 0;
const views = [];
const used = new Set(Object.values(prim.attributes));

gltf.bufferViews.forEach((v, i) => {
  const acc = gltf.accessors.find((a) => a.bufferView === i);
  const ai = gltf.accessors.indexOf(acc);
  if (acc && used.has(ai)) {                                         // attribut de sommet
    const stride = v.byteStride || SIZE[acc.componentType] * COMPS[acc.type];
    const srcB = viewBytes(i), re = new Uint8Array(unique * stride);
    for (let k = 0; k < vcount; k++) re.set(srcB.subarray(k * stride, (k + 1) * stride), remap[k] * stride);
    const enc = MeshoptEncoder.encodeGltfBuffer(re, unique, stride, 'ATTRIBUTES', VERSION);
    const fb = fallbackLen; fallbackLen += re.length; while (fallbackLen % 4) fallbackLen++;
    views.push({ buffer: 1, byteOffset: fb, byteLength: re.length, byteStride: stride, target: 34962,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: push(enc), byteLength: enc.length, byteStride: stride, count: unique, mode: 'ATTRIBUTES' } } });
  } else if (acc && ai === prim.indices) {                          // indices
    const small = unique <= 65535;
    const arr = small ? Uint16Array.from(indices) : indices;
    const raw = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const enc = MeshoptEncoder.encodeGltfBuffer(raw, arr.length, small ? 2 : 4, 'TRIANGLES');
    acc.componentType = small ? 5123 : 5125;
    const fb = fallbackLen; fallbackLen += raw.length; while (fallbackLen % 4) fallbackLen++;
    views.push({ buffer: 1, byteOffset: fb, byteLength: raw.length, target: 34963,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: push(enc), byteLength: enc.length, byteStride: small ? 2 : 4, count: arr.length, mode: 'TRIANGLES' } } });
  } else {                                                            // image, etc.
    views.push({ buffer: 0, byteOffset: push(viewBytes(i)), byteLength: v.byteLength });
  }
});
for (const a of gltf.accessors) if (used.has(gltf.accessors.indexOf(a))) a.count = unique;

gltf.bufferViews = views;
while (outLen % 4) { out.push(Buffer.alloc(1)); outLen++; }
gltf.buffers = [{ byteLength: outLen }, { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }];
gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'EXT_meshopt_compression'])];
gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired || []), 'EXT_meshopt_compression'])];
gltf.asset.generator = (gltf.asset.generator || '') + ' + meshopt_pack.mjs';

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const binOut = Buffer.concat(out);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binOut.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(dst, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(binOut.length, 0x004e4942), binOut]));
console.log(JSON.stringify({ dst, kb: Math.round(fs.statSync(dst).size / 1024), vertices: unique, indices: indices.length }));
