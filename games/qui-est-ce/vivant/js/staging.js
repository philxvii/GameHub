// Outils de mise en scene partages (js/game/cast.js, outils de banc) : chargement, cadrage commun
// du portrait, habillage du personnage (pull, coiffure V4.1). Le studio est dans cast.js.
// Ne touche ni au visage, ni a la coiffure, ni au rig valides.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export async function loadGlb(loader, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Introuvable : ${url}`);
  const buf = await res.arrayBuffer();
  const t0 = performance.now();
  const gltf = await loader.parseAsync(buf, url.replace(/[^/]*$/, ''));
  return Object.assign(gltf, { bytes: buf.byteLength, parseMs: performance.now() - t0 });
}

// Hasard fige (captures et tests deterministes).
export function seedRandom(seed = 0x2545f491) {
  let a = seed;
  Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Boite des maillages hors coques de cheveux peintes (masquees, absentes du fichier optimise) :
// meme cadrage pour le personnage d'origine et le personnage optimise.
function boxOf(root) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.name === 'hair') return;
    b.setFromObject(o); box.union(b);
  });
  return box;
}

// Echelle et position qui ramenent le personnage habille (coiffure V4.1 comprise) a une
// hauteur de 1, base a y = 0, et cadrage du portrait : haut comme compare.js, bas juste
// au-dessus du bord dechire du buste (le buste Hunyuan n'est qu'une bande sous le cou) pour
// que le mur ne se voie pas dessous.
export function computeFrame(base, hair) {
  const probe = dressedClone(base, hair, { s: 1, offset: new THREE.Vector3() });
  let box = boxOf(probe);
  const s = 1 / box.getSize(new THREE.Vector3()).y;
  probe.scale.setScalar(s); box = boxOf(probe);
  const offset = new THREE.Vector3().sub(box.getCenter(new THREE.Vector3()).setY(box.min.y));
  probe.position.copy(offset); box = boxOf(probe);
  const hp = probe.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const top = hp.y + (box.max.y - hp.y) * 1.2;
  const bottom = box.min.y + 0.095;
  return { s, offset, height: top - bottom, depth: size.z, target: new THREE.Vector3(hp.x, (top + bottom) / 2, hp.z + size.z * 0.12) };
}

// Mur eclaire et lumieres d'une direction, ajoutes a la scene. Renvoie la lumiere principale.
// Clone du personnage habille : pull uni (la texture Hunyuan des epaules est fausse), coques
// masquees, coiffure V4.1 attachee a l'os Head. Geometries et textures partagees entre clones.
const sweaters = new Map();
export function dressedClone(base, hair, frame, sweater = '#2C2D30') {
  const model = SkeletonUtils.clone(base.scene);
  model.scale.setScalar(frame.s); model.position.copy(frame.offset); model.updateMatrixWorld(true);
  model.getObjectByName('torso')?.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.uuid + sweater;
    if (!sweaters.has(key)) {
      const m = o.material.clone(); m.map = null; m.color.set(sweater); m.roughness = 0.92; sweaters.set(key, m);
    }
    o.material = sweaters.get(key);
  });
  const shells = model.getObjectByName('hair'); if (shells) shells.visible = false;
  const hr = SkeletonUtils.clone(hair.scene);
  model.add(hr); model.updateMatrixWorld(true); model.getObjectByName('Head').attach(hr);
  hr.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.material.alphaToCoverage = true; o.material.side = THREE.DoubleSide; o.material.shadowSide = THREE.DoubleSide;
  });
  return model;
}
