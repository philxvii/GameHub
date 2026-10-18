// Plateau 3D de Puissance 4 (Three.js) : noyer verni, ouvertures cerclées d'acier noirci,
// pions d'émail marqués d'un point (hôte) ou d'un croissant (invité), réserves empilées.
//
// Ce module ne fait que DESSINER : l'état vient de index.html (déjà validé par le serveur) et
// les colonnes cliquables restent des boutons HTML posés par-dessus. On ne rend une image que
// lorsqu'une animation est en cours ou que l'état change : aucune boucle permanente.
//
// Cohérence avec le décor : les reflets viennent de la photo de la salle elle-même (carte
// d'environnement), et les lumières reprennent les siennes — la lune (ou le soleil levant)
// en haut à gauche, la chaleur des bougies, basse, de part et d'autre.
//
// Unités : une case = 1 ; colonne c en x = c - 3, rangée r en y = 2,5 - r ; face avant vers +z.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROWS = 6, COLS = 7;
const PAD = .28, BW = COLS + 2 * PAD, BH = ROWS + 2 * PAD, DEPTH = .42;
const HOLE = .39, DISC_R = .355, DISC_T = .15, CHIP_T = .072, FEET = .5;
const LANE = 1, MARGIN_X = 3.1, MARGIN_B = .6;
const cx = c => c - 3, cy = r => 2.5 - r;
const HAND_Y = BH / 2 + LANE / 2;
const FLOOR = -BH / 2 - FEET;

const LIGHTS = {
  dark: { key: 0xb8c8ff, keyI: 2.8, keyPos: [-6, 8, 7], warmL: 0xffa864, warmLI: .35, warmR: 0xffb070, warmRI: .5, amb: .08, front: 0xdfe6ff, frontI: .9, env: .7, exposure: 1.12 },
  light: { key: 0xffd9b0, keyI: 3.1, keyPos: [-6, 6, 7], warmL: 0xfff0dc, warmLI: .2, warmR: 0xc8d4ff, warmRI: .45, amb: .14, front: 0xfff1e0, frontI: .9, env: .85, exposure: 1.08 },
};

const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function woodTexture() {
  const W = 1024, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), rnd = seeded(11);
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#553220'); base.addColorStop(.5, '#452818'); base.addColorStop(1, '#52301d');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 360; k++) {                                   // fil du noyer
    const y0 = rnd() * H, a = 2 + rnd() * 11, f = .0018 + rnd() * .006, ph = rnd() * 6.28, dark = rnd() < .72;
    g.strokeStyle = dark ? `rgba(24,11,4,${.05 + rnd() * .22})` : `rgba(146,94,54,${.04 + rnd() * .11})`;
    g.lineWidth = .6 + rnd() * 2.8;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * a + Math.sin(x * f * 3.1 + ph * 2) * a * .3;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 14; d[i] += n; d[i + 1] += n * .8; d[i + 2] += n * .6; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / BW, 1 / BH); t.offset.set(.5, .5);
  t.anisotropy = 8;
  return t;
}

// Face d'un pion : émail de la couleur choisie, et la marque du siège (point ou croissant).
const capCache = new Map();
function capTexture(mark, col) {
  const k = `${mark}-${col.base}`;
  if (capCache.has(k)) return capCache.get(k);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(S * .38, S * .32, S * .04, S / 2, S / 2, S * .56);
  rg.addColorStop(0, col.hi); rg.addColorStop(.5, col.base); rg.addColorStop(1, col.lo);
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2);                               // guilloché rayonnant, très léger
  for (let i = 0; i < 90; i++) { g.rotate(Math.PI * 2 / 90); g.fillStyle = i % 2 ? 'rgba(255,240,226,.045)' : 'rgba(0,0,0,.04)'; g.fillRect(S * .16, -1.3, S * .36, 2.6); }
  g.restore();
  if (mark === 1) {                                                  // point creusé
    g.beginPath(); g.arc(S / 2, S / 2, S * .115, 0, 7); g.fillStyle = col.pit; g.fill();
    g.beginPath(); g.arc(S / 2 - 1.5, S / 2 - 1.5, S * .115, 0, 7); g.lineWidth = S * .018; g.strokeStyle = 'rgba(0,0,0,.42)'; g.stroke();
  } else {                                                           // croissant gravé
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S * .25, 0, 7); g.clip();
    g.beginPath(); g.arc(S / 2, S / 2, S * .25, 0, 7); g.arc(S / 2 + S * .1, S / 2 - S * .055, S * .225, 0, 7, true);
    g.fillStyle = col.ink; g.fill('evenodd');
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  capCache.set(k, t);
  return t;
}

function plateGeometry() {
  const s = new THREE.Shape(), w = BW / 2, h = BH / 2, rr = .24;
  s.moveTo(-w + rr, -h); s.lineTo(w - rr, -h); s.quadraticCurveTo(w, -h, w, -h + rr);
  s.lineTo(w, h - rr); s.quadraticCurveTo(w, h, w - rr, h); s.lineTo(-w + rr, h);
  s.quadraticCurveTo(-w, h, -w, h - rr); s.lineTo(-w, -h + rr); s.quadraticCurveTo(-w, -h, -w + rr, -h);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = new THREE.Path(); p.absarc(cx(c), cy(r), HOLE, 0, Math.PI * 2, true); s.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 4, curveSegments: 48 });
  geo.translate(0, 0, -DEPTH / 2);
  return geo;
}

export function createBoard3D(host, { theme = 'dark', colors } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));   // plein écran : 1,5 suffit
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;    // provisoire, avant la photo
  const camera = new THREE.PerspectiveCamera(20, 1, .1, 200);

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);   // ombres portées : sur le plateau lui-même seulement
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -.0006; key.shadow.normalBias = .02; key.shadow.radius = 7; key.shadow.blurSamples = 16;
  const warmL = new THREE.PointLight(0xffffff, 1, 0, 1.6); warmL.position.set(-4.95, -.6, 1.6);
  const warmR = new THREE.PointLight(0xffffff, 1, 0, 1.6); warmR.position.set(7, -1, 4);
  const amb = new THREE.AmbientLight(0xffffff, .1);
  const front = new THREE.DirectionalLight(0xffffff, .8); front.position.set(.5, 2, 10);
  scene.add(key, warmL, warmR, amb, front);

  const board = new THREE.Group(); scene.add(board);

  // Noyer noir scanné (« Black Walnut Veneer 02 », Jenelle van Heerden, Poly Haven, CC0) sous
  // un vernis satiné ; en attendant les images, le bois généré tient la place.
  const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: .55, clearcoat: .55, clearcoatRoughness: .18 });
  let woodDone, envDone, decoDone;
  const ready = Promise.all([new Promise(r => { woodDone = r; }), new Promise(r => { envDone = r; }), new Promise(r => { decoDone = r; })]);
  const texLoader = new THREE.TextureLoader();
  const woodMap = (file, srgb) => new Promise(res => texLoader.load(new URL(`textures/${file}`, location.href).href, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(.085, .085); t.offset.set(.5, .5);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));
  Promise.all([woodMap('noyer-couleur.webp', true), woodMap('noyer-relief.webp'), woodMap('noyer-rugosite.webp')]).then(([map, normal, rough]) => {
    woodDone();
    if (!map) return;
    wood.map = map; wood.color.setHex(0x9c8274);                       // un noyer plus profond, sous la lune
    if (normal) { wood.normalMap = normal; wood.normalScale.set(.6, .6); }
    if (rough) { wood.roughnessMap = rough; wood.roughness = 1; }
    wood.needsUpdate = true; invalidate();
  });
  const plate = new THREE.Mesh(plateGeometry(), wood);
  plate.castShadow = true; plate.receiveShadow = true;
  board.add(plate);
  // Fond des cavités : une planche sombre derrière les pions, pour qu'une case vide se lise vide.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BW - .1, BH - .1), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: .95, metalness: 0 }));
  back.position.z = -DEPTH / 2 + .02; back.receiveShadow = true;
  board.add(back);

  const steel = new THREE.MeshPhysicalMaterial({ color: 0x2c3036, metalness: .95, roughness: .3, anisotropy: .7 });
  const ringGeo = new THREE.TorusGeometry(HOLE + .012, .03, 10, 48);
  const rings = new THREE.InstancedMesh(ringGeo, steel, ROWS * COLS);
  const m4 = new THREE.Matrix4();
  for (let r = 0, i = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, i++) rings.setMatrixAt(i, m4.makeTranslation(cx(c), cy(r), DEPTH / 2 + .03));
  board.add(rings);

  // Pieds d'acier noirci : un montant de chaque côté, une semelle large posée à plat sur la
  // table, et une traverse basse entre les deux, au ras de la table.
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(.16, BH * .5 + FEET, .3, 3, .04), steel);
    post.position.set(s * (BW / 2 + .07), FLOOR + (BH * .5 + FEET) / 2, 0);
    const sole = new THREE.Mesh(new RoundedBoxGeometry(.34, .09, 1.7, 3, .035), steel);
    sole.position.set(s * (BW / 2 + .07), FLOOR + .045, 0);
    post.castShadow = sole.castShadow = true;
    board.add(post, sole);
  }
  const rail = new THREE.Mesh(new RoundedBoxGeometry(BW + .14, .07, .12, 3, .03), steel);
  rail.position.set(0, FLOOR + .035, -.32);
  board.add(rail);

  // Ombres de contact : la photo est vue presque à l'horizontale, une ombre projetée en temps
  // réel y dessinait des aplats durs. On pose plutôt des ombres douces, peintes, écrasées par la
  // perspective comme dans la réalité, décalées à l'opposé de la lune (vers la droite et l'arrière).
  const blob = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(.45, 'rgba(0,0,0,.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const contact = (w, d, x, z, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blob, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + .004, z); m.renderOrder = -1;
    return m;
  };
  board.add(contact(BW + 1.2, 1.5, .2, -.12, 1));                      // le plateau entier
  board.add(contact(BW + .6, .7, .1, -.25, .9));                        // le cœur de l'ombre, sous la traverse
  for (const s of [-1, 1]) board.add(contact(.8, 2.1, s * (BW / 2 + .07) + .1, -.04, 1));      // chaque semelle

  // ── Nature morte, à l'échelle réelle (une case ≈ 3,4 cm), composée en deux massifs ──
  // À gauche, le coin chaud : la lampe à huile allumée, haute, en retrait, et une bougie basse
  // à ses pieds. À droite, sous la lune : les livres en fond, la boussole et la montre devant.
  const deco = new THREE.Group(); board.add(deco);
  // Cire ivoire, un peu translucide : plus sombre en bas, la lueur de la flamme dans le haut.
  const wax = new THREE.MeshPhysicalMaterial({ color: 0xd8c6a4, roughness: .48, sheen: .5, sheenColor: 0xffd9a8, emissive: 0x3a1c08, emissiveIntensity: .12, clearcoat: .15 });
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: .9 });
  const wicks = [];
  function candle(x, z, h, r) {
    const g = new THREE.Group(); g.position.set(x, FLOOR, z);
    const dish = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [r * 1.55, 0], [r * 1.65, .05], [r * 1.58, .1], [r * 1.08, .08], [r * 1.04, .16], [0, .16]].map(([a, b]) => new THREE.Vector2(a, b)), 56), steel);
    const top = .16 + h;
    // Fût, bord fondu en cuvette, deux coulures figées.
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, .16], [r, .16], [r * 1.01, top - .25], [r * .99, top - .06], [r * .9, top - .01], [r * .72, top - .05], [r * .3, top - .11], [0, top - .12]].map(([a, b]) => new THREE.Vector2(a, b)), 56), wax);
    const drip1 = new THREE.Mesh(new THREE.CapsuleGeometry(r * .13, h * .32, 4, 10), wax); drip1.position.set(r * .97, top - h * .26, r * .18);
    const drip2 = new THREE.Mesh(new THREE.CapsuleGeometry(r * .1, h * .18, 4, 10), wax); drip2.position.set(-r * .55, top - h * .14, r * .8);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, .16, 6), wickMat);
    wick.position.set(0, top - .06, 0); wick.rotation.z = .14;
    for (const m of [dish, body, drip1, drip2, wick]) { m.castShadow = true; g.add(m); }
    deco.add(g);
    wicks.push({ at: new THREE.Vector3(x + .01, FLOOR + top + .02, z), size: 1.25 });
    board.add(contact(r * 4.2, r * 3.6, x + .12, z - .08, 1));
  }
  candle(-4.95, .75, 1.75, .55);                        // une bougie pilier basse, ~6 cm

  // Objets scannés (Poly Haven, CC0) : « Book Encyclopedia Set 01 » (John Malcolm), « Seadogs
  // Compass » (Benny Weimer), « Vintage Oil Lamp » (Monsta3D), « Vintage Pocket Watch » (Tal
  // Swicegood). Allégés : textures 512 px, géométrie quantifiée.
  const gltf = new GLTFLoader();
  const place = (file, { size, axis = 'y', x, z, rotY = 0, tilt = 0, on = FLOOR, shadow = 0 }) => new Promise(res => gltf.load(new URL(`modeles/${file}`, location.href).href, g => {
    const o = g.scene;
    o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const dim = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.scale.setScalar(size / dim[axis]);
    o.rotation.set(tilt, rotY, 0);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    o.position.set(x - c.x, on - box.min.y, z - c.z);
    deco.add(o);
    if (shadow) board.add(contact(shadow, shadow * .75, x + .14, z - .1, 1));
    invalidate();
    res(o);
  }, undefined, () => res(null)));
  const lampLight = new THREE.PointLight(0xffa457, 0, 0, 1.4); scene.add(lampLight);
  Promise.all([
    // La lampe (~25 cm), en retrait derrière le coin gauche du plateau : la vraie source chaude.
    place('lampe.glb', { size: 7.3, x: -6.7, z: -2.2, rotY: .3, shadow: 3.2 }).then(lamp => {
      if (!lamp) return;
      const b = new THREE.Box3().setFromObject(lamp), c = b.getCenter(new THREE.Vector3());
      const flame = new THREE.Vector3(c.x, b.min.y + (b.max.y - b.min.y) * .5, c.z + .1);
      wicks.push({ at: flame, size: 1.6 });
      lampLight.position.copy(flame).add(new THREE.Vector3(0, 0, .6));
      lampLight.intensity = 26;
    }),
    // Les livres (~27 cm de rayonnage), en fond à droite ; la boussole et la montre devant.
    place('livres.glb', { size: 7.6, axis: 'x', x: 8.2, z: -2.6, rotY: -.32, shadow: 8 }),
    place('boussole.glb', { size: 2.2, axis: 'x', x: 6.9, z: .1, rotY: .55, shadow: 2.4 }),
    place('montre.glb', { size: 1.45, axis: 'x', x: 6.1, z: 1.9, rotY: -.35, tilt: -1.12, shadow: 1.5 }),
  ]).finally(() => { decoDone(); host.dispatchEvent(new CustomEvent('p4layout')); });

  // ── Pions ──
  let cols = colors || [];
  // Un pion profilé : face légèrement creusée, rebord surélevé, arêtes adoucies (tourné), et une
  // face plane qui porte la marque gravée.
  const T = DISC_T / 2, R = DISC_R, IN = R * .76, RIM = .02;
  const discGeo = new THREE.LatheGeometry([
    [0, T - RIM], [IN, T - RIM], [IN + .012, T - .004], [IN + .03, T], [R - .022, T], [R - .006, T - .008], [R, T - .024],
    [R, -(T - .024)], [R - .006, -(T - .008)], [R - .022, -T], [IN + .03, -T], [IN + .012, -(T - .004)], [IN, -(T - RIM)], [0, -(T - RIM)],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 72);
  discGeo.rotateX(Math.PI / 2);                                       // l'axe vers le joueur
  const faceGeo = new THREE.CircleGeometry(IN + .002, 72);
  // Micro-rugosité : une surface d'émail n'est jamais parfaitement uniforme.
  const grain = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), img = g.createImageData(256, 256), rnd = seeded(29);
    for (let i = 0; i < img.data.length; i += 4) { const v = 120 + (rnd() - .5) * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
    return t;
  })();
  function discMaterials(p, opts = {}) {
    const col = cols[p - 1];
    const body = new THREE.MeshPhysicalMaterial({ color: col.base, roughness: .34, roughnessMap: grain, clearcoat: .8, clearcoatRoughness: .14, sheen: .2, sheenColor: 0xffffff, ...opts });
    const face = new THREE.MeshPhysicalMaterial({ map: capTexture(p, col), bumpMap: capTexture(p, col), bumpScale: 1.4, roughness: .36, roughnessMap: grain, clearcoat: .75, clearcoatRoughness: .16, ...opts });
    return [body, face];
  }
  const vary = seeded(41);
  function makeDisc() {
    const m = new THREE.Mesh(discGeo, steel), f = new THREE.Mesh(faceGeo, steel);
    f.position.z = T - RIM + .001; f.rotation.z = vary() * Math.PI * 2;     // chaque pion tourné à sa façon
    m.add(f); m.userData.face = f; m.userData.shade = 1 + (vary() - .5) * .07;  // et sa teinte, à peine différente
    m.castShadow = true;
    return m;
  }
  const mats = m => [m.material, m.userData.face.material];
  const swap = (m, [body, face]) => {
    if (m.material !== steel) m.material.dispose();
    if (m.userData.face.material !== steel) m.userData.face.material.dispose();
    m.material = body; m.userData.face.material = face;
  };
  // Couleur d'un pion (corps et face) multipliée par k : 1 = normal, < 1 = dans l'ombre.
  const tint = (m, k) => { const v = k * (m.userData.shade || 1); m.material.color.set(cols[m.userData.p - 1].base).multiplyScalar(v); m.userData.face.material.color.setScalar(v); };
  const discs = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const m = makeDisc();
    m.position.set(cx(c), cy(r), 0); m.visible = false;
    Object.assign(m.userData, { r, c, p: 0 });
    board.add(m); discs.push(m);
  }
  const discAt = (r, c) => discs[r * COLS + c];
  function setPlayer(m, p, force) {
    if (m.userData.p === p && !force) return;
    m.userData.p = p;
    if (p) { swap(m, discMaterials(p)); tint(m, 1); }
    m.visible = !!p;
  }

  const hand = makeDisc(); hand.visible = false; hand.userData.p = 0; board.add(hand);
  const ghost = makeDisc(); ghost.visible = false; ghost.castShadow = false; ghost.userData.p = 0; board.add(ghost);
  const ghostMats = p => discMaterials(p, { transparent: true, opacity: .3, depthWrite: false });
  const lastRing = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xdfe6f5, metalness: 1, roughness: .2, emissive: 0x8fa6e0, emissiveIntensity: .45 }));
  lastRing.visible = false; board.add(lastRing);

  // Réserves : les pions restants de chaque joueur, empilés à plat sur la table, de part et d'autre.
  const e = .018, chipGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, -CHIP_T / 2), new THREE.Vector2(DISC_R - e, -CHIP_T / 2), new THREE.Vector2(DISC_R - e * .3, -CHIP_T / 2 + e * .3),
    new THREE.Vector2(DISC_R, -CHIP_T / 2 + e), new THREE.Vector2(DISC_R, CHIP_T / 2 - e), new THREE.Vector2(DISC_R - e * .3, CHIP_T / 2 - e * .3),
    new THREE.Vector2(DISC_R - e, CHIP_T / 2), new THREE.Vector2(0, CHIP_T / 2)], 48);
  const capGeo = new THREE.CircleGeometry(DISC_R - e, 48).rotateX(-Math.PI / 2);
  const stacks = [null, null];
  let reserve = [21, 21], showStacks = true;
  function buildStack(i) {
    if (stacks[i]) { board.remove(stacks[i]); stacks[i].material.dispose(); stacks[i].userData.cap.material.dispose(); stacks[i].dispose(); }
    const p = i + 1, col = cols[i];
    const body = new THREE.MeshPhysicalMaterial({ color: col.base, roughness: .35, clearcoat: .5 });
    const mesh = new THREE.InstancedMesh(chipGeo, body, 21);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshPhysicalMaterial({ map: capTexture(p, col), roughness: .3, clearcoat: .6 }));
    mesh.userData.cap = cap; mesh.add(cap);
    mesh.add(contact(1.3, 1.3, .12, -.1, .8));
    const rnd = seeded(5 + i * 13), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let k = 0; k < 21; k++) {
      e.set(0, rnd() * 6.28, 0); q.setFromEuler(e);
      v.set((rnd() - .5) * .04, FLOOR + CHIP_T / 2 + k * CHIP_T, (rnd() - .5) * .04);
      mesh.setMatrixAt(k, m4.compose(v, q, one));
    }
    mesh.castShadow = false;
    mesh.position.set(i ? 4.6 : -4.25, 0, i ? .9 : 1.45);
    stacks[i] = mesh; board.add(mesh);
    fitStack(i);
  }

  // Hauteur de pile et face gravée au sommet.
  function fitStack(i) {
    const s = stacks[i];
    if (!s) return;
    s.count = reserve[i]; s.visible = showStacks && reserve[i] > 0;
    s.userData.cap.position.set(0, FLOOR + reserve[i] * CHIP_T + .001, 0);
  }
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xeef3ff, toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xb8cbff, transparent: true, opacity: .22, depthWrite: false, toneMapped: false });
  const halo = new THREE.MeshBasicMaterial({ color: 0xe6edff, transparent: true, opacity: .9, toneMapped: false });
  const threads = new THREE.Group(); board.add(threads);
  const halos = new THREE.Group(); board.add(halos);

  // ── Moteur d'animation : une image seulement quand quelque chose bouge ──
  const anims = new Set();
  let raf = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => reduced.matches || document.hidden;
  function frame(now) {
    raf = 0;
    for (const a of [...anims]) {
      const k = Math.max(0, Math.min(1, (now - a.t0 - a.delay) / a.dur));
      if (now - a.t0 >= a.delay) a.step(k);
      if (k >= 1) { anims.delete(a); a.res(); }
    }
    renderer.render(scene, camera);
    if (anims.size) raf = requestAnimationFrame(frame);
  }
  const invalidate = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function tween(dur, step, delay = 0, owner) {
    if (owner?.userData.anim) cancel(owner);
    return new Promise(res => {
      const a = { t0: performance.now(), dur: Math.max(1, dur), delay, step, res };
      if (owner) { owner.userData.anim = a; a.res = () => { if (owner.userData.anim === a) owner.userData.anim = null; res(); }; }
      anims.add(a); invalidate();
    });
  }
  function cancel(owner) {
    const a = owner.userData.anim;
    if (a) { anims.delete(a); owner.userData.anim = null; a.res(); }
  }
  const easeOut = k => 1 - (1 - k) ** 3;

  // ── Cadrage : la toile couvre tout l'écran ; une case 3D = une case HTML, et le centre du
  // plateau 3D tombe exactement sur le centre du plateau HTML (décalage de vue de la caméra).
  // Les objets de la table ont ainsi leur vraie taille sans jamais être coupés par un cadre.
  let cell = 72;
  function layout() {
    const slab = host.querySelector('.slab');
    const shown = !!(slab && slab.offsetWidth && host.offsetParent);
    canvas.style.display = shown ? '' : 'none';
    if (!shown) return;
    cell = slab.offsetWidth / BW;
    const W = innerWidth, H = innerHeight, r = slab.getBoundingClientRect();
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    renderer.setSize(W, H, false);
    const FW = 2 * Math.max(bx, W - bx, 1), FH = 2 * Math.max(by, H - by, 1);
    camera.aspect = FW / FH;
    const dist = FH / cell / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tilt = 3 * Math.PI / 180;
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(FW, FH, FW / 2 - bx, FH / 2 - by, W, H);
    camera.updateProjectionMatrix();
    invalidate();
    host.dispatchEvent(new CustomEvent('p4layout'));
  }
  let lraf = 0;
  const relayout = () => { if (!lraf) lraf = requestAnimationFrame(() => { lraf = 0; layout(); }); };
  const ro = new ResizeObserver(relayout);
  ro.observe(host);
  addEventListener('resize', relayout);
  addEventListener('scroll', relayout, true);          // les menus défilent sur petit écran

  // La photo de la salle sert de carte d'environnement : reflets bleus de lune, or des bougies.
  const loader = new THREE.TextureLoader();
  const envs = {};
  function useEnvironment(t) {
    const url = new URL(`fonds/table-${t === 'light' ? 'aube' : 'nuit'}.webp`, location.href).href;
    if (envs[url]) { scene.environment = envs[url]; invalidate(); envDone(); return; }
    loader.load(url, tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      envs[url] = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      if (currentTheme === t) { scene.environment = envs[url]; invalidate(); }
      envDone();
    }, undefined, () => envDone());
  }
  let currentTheme = theme;
  function setTheme(t) {
    currentTheme = t;
    const L = LIGHTS[t === 'light' ? 'light' : 'dark'];
    key.color.setHex(L.key); key.intensity = L.keyI; key.position.set(...L.keyPos);
    warmL.color.setHex(L.warmL); warmL.intensity = L.warmLI * 30;
    warmR.color.setHex(L.warmR); warmR.intensity = L.warmRI * 30;
    amb.intensity = L.amb; renderer.toneMappingExposure = L.exposure;
    front.color.setHex(L.front); front.intensity = L.frontI;
    scene.environmentIntensity = L.env;
    useEnvironment(t);
    invalidate();
  }

  let ended = false;
  const api = {
    setColors(next) {
      cols = next;
      discs.forEach(m => m.userData.p && setPlayer(m, m.userData.p, true));
      if (hand.userData.p) swap(hand, discMaterials(hand.userData.p));
      if (ghost.userData.p) swap(ghost, ghostMats(ghost.userData.p));
      buildStack(0); buildStack(1);
      invalidate();
    },
    // Plateau au repos : chaque case prend son pion, sauf celles en cours d'animation.
    setBoard(b) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const m = discAt(r, c);
        if (m.userData.anim) continue;
        const was = m.userData.p;
        setPlayer(m, b[r][c]);
        if (!ended || was !== b[r][c]) { m.position.set(cx(c), cy(r), 0); m.scale.setScalar(1); }
      }
      invalidate();
    },
    setReserves(n1, n2, show) {
      reserve = [n1, n2]; showStacks = show;
      stacks.forEach((s, i) => fitStack(i));
      invalidate();
    },
    aim(col, landRow, mine, pending) {
      const on = col >= 0 && landRow >= 0 && !!cols[mine - 1];
      if (on && hand.userData.p !== mine) { swap(hand, discMaterials(mine)); hand.userData.p = mine; }
      if (on && ghost.userData.p !== mine) { swap(ghost, ghostMats(mine)); ghost.userData.p = mine; }
      const wasOn = hand.visible;
      hand.visible = on; ghost.visible = on;
      if (!on) { invalidate(); return; }
      ghost.position.set(cx(col), cy(landRow), 0);
      const tx = cx(col), ty = HAND_Y - (pending ? .1 : 0);
      if (!wasOn || still()) { hand.position.set(tx, ty, 0); invalidate(); return; }
      const fx = hand.position.x, fy = hand.position.y;
      tween(150, k => { const e = easeOut(k); hand.position.x = fx + (tx - fx) * e; hand.position.y = fy + (ty - fy) * e; }, 0, hand);
    },
    // Chute : accélère, touche le fond, un seul rebond court ; le plateau encaisse.
    drop(r, c, p) {
      const m = discAt(r, c);
      setPlayer(m, p);
      hand.visible = false; ghost.visible = false;
      if (still()) { m.position.set(cx(c), cy(r), 0); invalidate(); return Promise.resolve(); }
      const y0 = HAND_Y, y1 = cy(r), ms = Math.round(220 + Math.sqrt(r + 1) * 100), b = Math.min(.09, .04 + r * .01);
      let hit = false;
      m.position.set(cx(c), y0, 0);
      return tween(ms, k => {
        let y;
        if (k < .82) y = y0 + (y1 - y0) * (k / .82) ** 2;
        else if (k < .91) y = y1 + b * Math.sin(((k - .82) / .09) * Math.PI / 2);
        else y = y1 + b * Math.cos(((k - .91) / .09) * Math.PI / 2);
        m.position.y = y;
        if (!hit && k >= .82) {
          hit = true;
          tween(140, q => { board.position.y = -.025 * Math.sin(q * Math.PI); });
        }
      }, 0, m);
    },
    // Vidange : les pions glissent vers le bas, colonne par colonne.
    drain(cells) {
      if (still()) { cells.forEach(([r, c]) => setPlayer(discAt(r, c), 0)); invalidate(); return Promise.resolve(); }
      return Promise.all(cells.map(([r, c]) => {
        const m = discAt(r, c), y0 = m.position.y, dist = r + 2.2;
        mats(m).forEach(x => { x.transparent = true; });
        return tween(420, k => {
          m.position.y = y0 - dist * k * k;
          mats(m).forEach(x => { x.opacity = 1 - k; });
        }, c * 28, m).then(() => { setPlayer(m, 0); m.position.set(cx(c), cy(r), 0); mats(m).forEach(x => { x.opacity = 1; x.transparent = false; }); });
      }));
    },
    setLast(last) {
      lastRing.visible = !!last && !ended;
      if (last) lastRing.position.set(cx(last.c), cy(last.r), DEPTH / 2 + .04);
      invalidate();
    },
    // Conjonction : les quatre s'avancent, un anneau de lune les cercle, le fil les relie ;
    // les autres pions passent dans l'ombre.
    win(cells, segs) {
      ended = true;
      lastRing.visible = false;
      const set = new Set(cells.map(([r, c]) => r * COLS + c));
      halos.clear();
      discs.forEach((m, i) => {
        if (!m.userData.p) return;
        const on = set.has(i);
        tint(m, on ? 1 : .32);
        if (!on) return;
        const k0 = cells.findIndex(([r, c]) => r * COLS + c === i);
        const ring = new THREE.Mesh(ringGeo, halo);
        ring.position.set(m.position.x, m.position.y, DEPTH / 2 + .045); ring.scale.setScalar(.85);
        halos.add(ring);
        tween(still() ? 1 : 460, k => { const e = easeOut(k); m.position.z = .08 * e; m.scale.setScalar(1 + .04 * e); ring.scale.setScalar(.85 + .15 * e); }, still() ? 0 : k0 * 85);
      });
      threads.clear();
      for (const [r1, c1, r2, c2] of segs) {
        const a = new THREE.Vector3(cx(c1), cy(r1), DEPTH / 2 + .12), b = new THREE.Vector3(cx(c2), cy(r2), DEPTH / 2 + .12);
        const len = a.distanceTo(b), g = new THREE.Group();
        g.position.copy(a); g.lookAt(b);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, 1, 12), threadMat);
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1, 16), glowMat);
        for (const x of [core, glow]) { x.rotation.x = Math.PI / 2; x.position.z = .5; g.add(x); }
        g.scale.set(1, 1, .0001);
        threads.add(g);
        tween(still() ? 1 : 620, k => { g.scale.z = Math.max(.0001, len * (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)); }, still() ? 0 : 420);
      }
      invalidate();
    },
    draw() { ended = true; discs.forEach(m => m.userData.p && tint(m, .6)); lastRing.visible = false; invalidate(); },
    clearEnd() {
      ended = false;
      threads.clear(); halos.clear();
      discs.forEach(m => {
        if (!m.userData.p) return;
        tint(m, 1);
        if (!m.userData.anim) { m.position.z = 0; m.scale.setScalar(1); }
      });
      invalidate();
    },
    refuse() {
      const target = hand.visible ? hand : board, x0 = target === hand ? hand.position.x : 0;
      tween(still() ? 1 : 170, k => { target.position.x = x0 + Math.sin(k * Math.PI * 3) * .06 * (1 - k); })
        .then(() => { target.position.x = x0; invalidate(); });
    },
    // Pour les tests : ce que la 3D affiche vraiment.
    inspect() {
      return {
        pieces: discs.filter(m => m.visible).length,
        lifted: discs.filter(m => m.visible && m.position.z > .05).length,
        dimmed: discs.filter(m => m.visible && m.userData.face.material.color.r < .5).length,
        threads: threads.children.length, halos: halos.children.length,
        hand: hand.visible, ghost: ghost.visible, reserves: stacks.map(s => s && s.visible ? s.count : 0),
        colors: cols.map(c => c.base),
      };
    },
    // Où sont les mèches dans la toile (px), pour y poser les flammes animées en CSS.
    wicks() {
      const r = canvas.getBoundingClientRect(), w = r.width, h = r.height;
      return wicks.map(({ at, size }) => { const q = at.clone(); board.localToWorld(q); q.project(camera); return { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h, scale: cell / 72 * size }; });
    },
    ready,
    setTheme, layout,
    render: invalidate,
    paint: () => renderer.render(scene, camera),
    dispose() { ro.disconnect(); removeEventListener('resize', relayout); removeEventListener('scroll', relayout, true); renderer.dispose(); canvas.remove(); },
    get visible() { return canvas.style.display !== 'none'; },
  };
  setTheme(theme);
  if (cols.length) api.setColors(cols);
  layout();
  // Compilation des shaders tout de suite (souvent sous le noir de l'ouverture), pas au premier coup.
  discs.forEach(m => { m.visible = true; });
  if (cols.length && !hand.userData.p) { swap(hand, discMaterials(1)); swap(ghost, ghostMats(1)); hand.userData.p = ghost.userData.p = 1; }
  hand.visible = ghost.visible = true;
  renderer.compile(scene, camera);
  discs.forEach(m => { m.visible = !!m.userData.p; });
  hand.visible = ghost.visible = false;
  return api;
}
