// Distribution et studio de portrait, communs aux portraits pre-rendus (tools/bake_portraits.js)
// et au rendu vivant de la carte active (live.js) : MEME lumiere, MEME cadrage, fond transparent
// (le fond colore de chaque carte est en CSS). Ainsi le passage de l'image au personnage vivant
// ne change ni l'eclairage, ni le cadre, ni les proportions.
//
// Un personnage du roster est soit un GLB propre (`glb`, et `coiffure`), soit un SUBSTITUT
// provisoire : le personnage 01 habille selon ses attributs (lunettes, casquette, boucles
// d'oreilles, barbe, moustache, rase de pres, cheveux teintes).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterRig } from './rig.js';
import { loadGlb, computeFrame, dressedClone } from './staging.js';

export const ASPECT = 4 / 5;                       // portrait : largeur / hauteur
export const EXPRESSIONS = ['neutral', 'smile', 'surprised', 'suspicious'];
const M = new URL('../models/', import.meta.url).href;
const R = (u) => (u && !/^https?:/.test(u) ? M + u.replace(/^models\//, '') : u);   // chemins du roster -> adresses absolues
const FILES = {
  base: M + 'character-01-ict-opt.glb', shaved: M + 'character-01-ict-opt-shaved.glb', bald: M + 'character-01-ict-opt-bald.glb',
  hair: M + 'hair/hair-curly-v41-opt.glb', capHair: M + 'accessories/cap-hair-curly-v41.glb',
  cap: M + 'accessories/cap.glb', acetate: M + 'accessories/glasses-acetate.glb', metal: M + 'accessories/glasses-metal.glb',
  hoops: M + 'accessories/earrings-hoops.glb', pearls: M + 'accessories/earrings-pearls.glb',
  beard: M + 'accessories/beard.glb', moustache: M + 'accessories/moustache.glb', full: M + 'accessories/full.glb',
};
// Teinte de la coiffure V4.1 (brune) par couleur du roster : facteur lineaire du materiau.
// (la V4.1 est en niveaux de gris x couleur du materiau : une teinte claire demande un fort facteur ;
// blond et gris etaient lus « bruns » par la revue n° 2)
const HAIR_TINT = { noir: [0.42, 0.42, 0.45], brun: [1, 1, 1], blond: [8.2, 7.2, 4.4], roux: [3.0, 1.15, 0.45], gris: [9.0, 9.0, 9.6] };
// Pull : une couleur par personnage, sobre, accordee aux fonds de studio.
const SWEATERS = ['#2C2D30', '#3B4A5C', '#5A3E36', '#2F4A43', '#6B6157', '#40354F', '#7A6A4F', '#23303B'];

export function costume(person, i) {
  const a = person.attributs, own = !!person.glb;
  const facial = a.barbe && a.moustache ? 'full' : a.barbe ? 'beard' : a.moustache ? 'moustache' : null;
  const real = person.statut === 'modelise';
  return {
    own,
    // barbe peinte gardee seulement avec barbe + moustache ; chauve : crane sans cheveux peints (barbe en cartes)
    base: own ? null : a.coupe === 'chauve' ? 'bald' : real || facial === 'full' ? 'base' : 'shaved',
    hair: a.coupe === 'chauve' ? null : a.chapeau ? 'capHair' : 'hair',
    // personnage propre : sa teinte (fiche) ; substitut : la couleur du roster
    tint: own ? HAIR_TINT[person.teinte] || null : real ? null : HAIR_TINT[a.cheveux] || null,
    // personnage propre : ses accessoires, ajustes a SA tete (tools/casting) ; la casquette est commune
    acc: own ? [a.chapeau && 'cap'].filter(Boolean)
      : [a.lunettes && (i % 2 ? 'metal' : 'acetate'), a.chapeau && 'cap', a.boucles_oreilles && (i % 2 ? 'pearls' : 'hoops'), !real && facial].filter(Boolean),
    sweater: SWEATERS[(i * 5) % SWEATERS.length],
  };
}

export function createCast(people) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();                          // url -> Promise<gltf> (partage entre personnages)
  const load = (url) => { if (!cache.has(url)) cache.set(url, loadGlb(loader, url)); return cache.get(url); };
  const looks = people.map((p, i) => costume(p, i));
  let frame = null;
  const tints = new Map();
  const tinted = (mat, rgb) => {
    const key = mat.uuid + rgb.join();
    if (!tints.has(key)) { const m = mat.clone(); m.color.setRGB(...rgb); tints.set(key, m); }
    return tints.get(key);
  };
  // Cadre commun, calcule une fois sur le personnage 01 coiffe : tous les portraits ont la meme echelle.
  async function ensureFrame() {
    if (!frame) { const [b, h] = await Promise.all([load(FILES.base), load(FILES.hair)]); frame = computeFrame(b, h); }
    return frame;
  }
  const parts = (i) => {
    const c = looks[i], p = people[i];
    return { base: c.own ? R(p.glb) : FILES[c.base], hair: c.hair ? (c.own && p.coiffure && c.hair === 'hair' ? R(p.coiffure) : FILES[c.hair]) : null,
      acc: [...c.acc.map((k) => FILES[k]), ...(c.own ? (p.accessoires || []).map(R) : [])] };
  };
  const urls = (i) => { const u = parts(i); return [u.base, u.hair, ...u.acc].filter(Boolean); };
  return {
    looks, urls, cache,
    frame: ensureFrame,
    preload: (i) => Promise.all(urls(i).map(load)),
    // Personnage habille, pret a peindre (rig cree apres les accessoires : barbe a expressions).
    async build(i, { reduced = false } = {}) {
      const f = await ensureFrame();
      const c = looks[i], p = people[i], u = parts(i);
      const [base, hairGltf, accs] = await Promise.all([load(u.base), u.hair ? load(u.hair) : null, Promise.all(u.acc.map(load))]);
      const model = dressedClone(base, hairGltf || { scene: new THREE.Group() }, f, c.sweater);
      if (c.tint) model.traverse((o) => { if (o.isMesh && o.material.name === 'hair-cards') o.material = tinted(o.material, c.tint); });
      for (const g of accs) {
        const a = SkeletonUtils.clone(g.scene);
        model.add(a); model.updateMatrixWorld(true); model.getObjectByName('Head').attach(a);
        a.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      }
      // Retouches de rendu a l'echelle d'une petite carte : cils du bas quasi transparents (sinon de grosses
      // barres sombres), moustache plus dense et plus noire, pas de cheveux qui depassent sous une casquette.
      model.traverse((o) => {
        if (!o.isMesh) return;
        const m = [].concat(o.material)[0];
        if (m.name === 'lashes') { o.material = m.clone(); Object.assign(o.material, { opacity: 0.3, transparent: true, depthWrite: false }); }
        else if (m.name === 'facial-hair') { o.material = m.clone(); o.material.alphaTest = 0.22; o.material.color.set('#707070'); }
        else if (m.name === 'hair-cards' && p.attributs.chapeau) o.visible = false;
      });
      const rig = new CharacterRig(model, { reducedMotion: reduced });
      return { model, rig, person: p };
    },
  };
}

// Studio de portrait : lumiere de studio douce, sans mur (fond transparent), une ombre portee
// sur le personnage lui-meme. Une scene, une camera ; un seul modele visible a la fois.
export function createStudio(renderer, frame) {
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const t = frame.target, h = frame.height;
  const dir = (color, i, p, shadow) => {
    const l = new THREE.DirectionalLight(color, i); l.position.set(...p); l.target.position.copy(t); scene.add(l, l.target);
    if (shadow) {
      l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.radius = 5; l.shadow.bias = -0.0004; l.shadow.normalBias = 0.015;
      const c = l.shadow.camera; c.left = c.bottom = -h * 1.6; c.right = c.top = h * 1.6; c.near = 0.01; c.far = h * 14;
    }
    return l;
  };
  const key = dir('#FFF0DE', 2.2, [t.x - h * 1.5, t.y + h * 1.0, t.z + h * 2.4], true);   // grande source douce, chaude
  dir('#E6EDFF', 0.85, [t.x + h * 1.8, t.y + h * 0.15, t.z + h * 1.7], false);           // reflecteur froid
  dir('#FFFFFF', 1.25, [t.x + h * 0.7, t.y + h * 1.5, t.z - h * 1.8], false);            // lumiere de separation (cheveux)
  scene.add(new THREE.HemisphereLight('#F4EFE8', '#4A4540', 0.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  // Cadre « tete et cou » : plus serre que le cadre commun, il laisse hors champ le bord du buste
  // (une simple bande sous le cou) et met le visage au centre de la carte.
  const camera = new THREE.PerspectiveCamera(24, ASPECT, 0.01, 50);
  const hh = h * 0.8, aim = t.clone().add(new THREE.Vector3(0, -h * 0.06, 0));
  const dist = (hh / 2) / Math.tan(THREE.MathUtils.degToRad(12));
  camera.position.set(aim.x, aim.y + h * 0.03, aim.z + dist); camera.lookAt(aim);
  let shown = null;
  return {
    scene, camera, key,
    show(model) { if (shown === model) return; if (shown) scene.remove(shown); if (model) scene.add(model); shown = model; },
    render() { renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera); },
  };
}

// Amene le rig a une pose stable (expression atteinte, regard droit), sans clignement : portraits.
export function settle(rig, expr, steps = 150) {
  rig._startBlink = () => {}; rig.blink.value = 0; rig.blink.t0 = -1;
  rig.setExpression(expr);
  const look = { x: 0, y: 0.05, active: true };
  for (let k = 0; k < steps; k++) rig.update(1 / 60, 10 + k / 60, look);
}

// Libere les ressources GPU propres a un GLB (quand plus aucun personnage ne s'en sert).
export function disposeGltf(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
  });
}
