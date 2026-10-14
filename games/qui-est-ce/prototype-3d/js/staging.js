// Mise en scene partagee par da.html et board.html : decors et lumieres des directions
// artistiques, cadrage du portrait, habillage du personnage (pull, coiffure V4.1).
// Ne touche ni au visage, ni a la coiffure, ni au rig valides.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const LOOKS = {
  dossier: { exposure: 1.0, env: 0.28, wall: '#C3C6BB', chart: true, wallDepth: 0.9, sweater: '#2C2D30',
    lights: (t, h) => [
      dir('#FFF5E6', 2.7, [t.x - h * 0.2, t.y + h * 0.5, t.z + h * 3], t, true, 0),   // flash de fichier : dur, de face
      hemi('#E4E8EA', '#3A3631', 0.5)] },
  casting: { exposure: 1.08, env: 0.4, wall: '#D9D4CA', wallDepth: 3.2, sweater: '#2C2D30',
    lights: (t, h) => [
      dir('#FFF1E2', 2.1, [t.x - h * 1.6, t.y + h * 1.0, t.z + h * 2.4], t, true, 6),  // grande source douce
      dir('#E8EEFF', 0.9, [t.x + h * 1.8, t.y + h * 0.2, t.z + h * 1.6], t, false),     // reflecteur
      dir('#FFFFFF', 1.1, [t.x + h * 0.6, t.y + h * 1.4, t.z - h * 1.8], t, false),     // separation
      hemi('#F2EEE8', '#4A4540', 0.35)] },
  salon: { exposure: 1.12, env: 0.12, wall: '#5A262C', wallDepth: 1.4, sweater: '#262628',
    lights: (t, h) => [
      spot('#FFD9A6', 22, [t.x - h * 0.15, t.y + h * 0.8, t.z + h * 1.35], t.clone().add(new THREE.Vector3(0, -h * 0.08, 0))), // lampe de tableau
      dir('#FFE6C8', 0.55, [t.x + h * 0.4, t.y - h * 0.1, t.z + h * 2.5], t, false),   // rebond du sol, tres doux
      dir('#C9D2FF', 0.35, [t.x + h * 1.4, t.y + h * 0.6, t.z - h * 1.4], t, false),
      hemi('#B7A79A', '#1A0E0F', 0.14)] },
};

function dir(color, i, p, target, shadow, radius = 2) {
  const l = new THREE.DirectionalLight(color, i); l.position.set(...p); l.target.position.copy(target);
  if (shadow) { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.radius = radius; l.shadow.bias = -0.0004; l.shadow.normalBias = 0.015; }
  return l;
}
function spot(color, i, p, target) {
  const l = new THREE.SpotLight(color, i, 0, THREE.MathUtils.degToRad(34), 0.75, 1.6); l.position.set(...p); l.target.position.copy(target);
  l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.015; l.shadow.radius = 4;
  return l;
}
function hemi(sky, ground, i) { return new THREE.HemisphereLight(sky, ground, i); }

// Toise de fichier : graduations peintes sur le mur (5 cm, chiffres tous les 10 cm).
function chartTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
  const g = c.getContext('2d');
  g.fillStyle = '#C3C6BB'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2A2D2A'; g.font = '700 46px "Courier Prime", monospace'; g.textBaseline = 'middle';
  for (let k = 0; k <= 40; k++) {
    const y = c.height - k * 50 - 24;
    const major = k % 2 === 0;
    g.fillRect(0, y - (major ? 3 : 1.5), c.width, major ? 6 : 3);
    if (major) g.fillText(String(150 + k * 5), 18, y - 28);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

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
export function buildSet(scene, lookName, frame, renderer, RoomEnvironment) {
  const look = LOOKS[lookName];
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = look.env;
  const t = frame.target, h = frame.height;
  // Mur : une surface eclairee (sa lumiere fait le fond), jamais un degrade peint.
  const wallMat = new THREE.MeshStandardMaterial({ color: look.chart ? '#FFFFFF' : look.wall, roughness: 0.95, map: look.chart ? chartTexture() : null });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(h * 6, h * 6), wallMat);
  wall.position.set(t.x, t.y, t.z - frame.depth * look.wallDepth); wall.receiveShadow = true;
  if (look.chart) { wallMat.map.repeat.set(3, 1); wallMat.map.wrapS = THREE.RepeatWrapping; wall.position.y = t.y + h * 0.4; }
  scene.add(wall);
  const lights = look.lights(t, h);
  for (const l of lights) {
    scene.add(l); if (l.target) scene.add(l.target);
    const c = l.castShadow && l.shadow.camera;
    if (c && c.isOrthographicCamera) { c.left = c.bottom = -h * 1.6; c.right = c.top = h * 1.6; c.near = 0.01; c.far = h * 14; }
  }
  return { look, wall, lights, key: lights[0], keyBase: lights[0].position.clone(), keyI: lights[0].intensity };
}

export function makeCamera(frame, aspect = 3 / 4) {
  const t = frame.target, h = frame.height;
  const camera = new THREE.PerspectiveCamera(24, aspect, 0.01, 50);
  const dist = (h / 2) / Math.tan(THREE.MathUtils.degToRad(12));
  camera.position.set(t.x, t.y + h * 0.04, t.z + dist); camera.lookAt(t);
  return camera;
}

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
