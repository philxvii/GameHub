// Page de comparaison : le meme personnage, quatre coiffures, conditions identiques.
//
// Equite : un seul WebGLRenderer (meme rapport de pixels, meme tone mapping, memes
// ombres) decoupe en quatre fenetres ; un cadrage calcule une fois sur le personnage
// SANS coiffure puis applique tel quel aux quatre ; memes lumieres, meme fond.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterRig } from './rig.js';

const BASE = 'models/character-01-ict.glb';
// ?set=v41 : compare uniquement les versions listees dans models/hair/compare-v41.json
const Q = new URLSearchParams(location.search);
// ?char=models/x.glb : personnage charge (defaut : BASE), aussi avec ?bench=. Une version
// d'un jeu peut aussi porter son propre personnage ("char" dans le JSON). Le cadrage est
// toujours calcule sur BASE : un personnage allege (coquilles retirees) garde la meme camera.
const CHAR = Q.get('char') || BASE;
// ?acc=models/accessories/a.glb,b.glb : accessoires rattaches a l'os Head (comme la coiffure),
// pour toutes les cartes ; une version d'un jeu peut porter sa propre liste ("acc" dans le JSON).
const ACC = (Q.get('acc') || '').split(',').filter(Boolean);
// Par defaut : V4.1 originale contre V4.1 optimisee (coiffure validee). Les autres
// jeux (?set=...) lisent models/hair/compare-<set>.json.
const SET = Q.get('set') || 'opt';
const HAIRS = SET ? `models/hair/compare-${SET}.json` : 'models/hair/hairs.json';
// ?bench=models/hair/x.glb : une seule coiffure, rendu deterministe pour les mesures
// (hasard fige, pas de clignement, pas de boucle d'animation, taille de rendu fixe).
const BENCH = Q.get('bench');
const BW = 900, BH = 1200;
if (BENCH) {
  let a = 0x2545f491;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const $ = (s, el = document) => el.querySelector(s);

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(BENCH ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);
renderer.info.autoReset = false;
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function loadGlb(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Introuvable : ${url}`);
  const buf = await res.arrayBuffer();
  const t0 = performance.now();
  const gltf = await loader.parseAsync(buf, url.replace(/[^/]*$/, ''));
  return { gltf, bytes: buf.byteLength, parseMs: performance.now() - t0 };
}

// Decor identique pour chaque carte : fond degrade, ombre portee, eclairage portrait.
function makeStage(frame) {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { cIn: { value: new THREE.Color('#5b524a') }, cOut: { value: new THREE.Color('#181513') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 cIn; uniform vec3 cOut; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ float d = distance(vUv, vec2(0.5, 0.58)) * 1.55; vec3 c = mix(cIn, cOut, smoothstep(0.0, 1.0, d));
        c += (hash(gl_FragCoord.xy) - 0.5) * 0.012; gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  backdrop.renderOrder = -1;
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
  catcher.receiveShadow = true;
  const key = new THREE.DirectionalLight('#ffe3c4', 2.4);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
  const rim = new THREE.DirectionalLight('#bcd2ff', 1.7);
  scene.add(backdrop, catcher, key, key.target, rim, new THREE.HemisphereLight('#dfe6ff', '#2b231d', 0.55));
  const camera = new THREE.PerspectiveCamera(24, 3 / 4, 0.01, 50);
  const t = frame.target, h = frame.height;
  const dist = (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(t.x, t.y + h * 0.04, t.z + dist); camera.lookAt(t);
  const back = t.z - frame.depth * 1.6;
  backdrop.position.set(t.x, t.y, back - 0.01); backdrop.scale.setScalar(h * 6);
  catcher.position.set(t.x, t.y, back); catcher.scale.setScalar(h * 6);
  key.position.set(t.x - h * 1.3, t.y + h * 1.6, t.z + h * 2.2); key.target.position.copy(t);
  const sc = key.shadow.camera; sc.left = sc.bottom = -h * 1.4; sc.right = sc.top = h * 1.4; sc.near = 0.01; sc.far = h * 12;
  sc.updateProjectionMatrix();
  rim.position.set(t.x + h * 1.4, t.y + h * 1.1, t.z - h * 1.6);
  return { scene, camera };
}

function countTriangles(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh && o.visible !== false) {
      let v = o, shown = true;
      while (v) { if (v.visible === false) shown = false; v = v.parent; }
      if (shown) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    }
  });
  return Math.round(n);
}

// ── Interface ──
const cardsEl = $('#cards');
const state = { expr: 'neutral', look: 'mouse', mouse: { x: 0, y: 0, last: -1e9 } };
function setPressed(attr, value) {
  for (const b of document.querySelectorAll(`[data-${attr}]`)) b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.expr) { state.expr = b.dataset.expr; setPressed('expr', state.expr); for (const c of cards) c.rig?.setExpression(state.expr); }
  if (b.dataset.look) { state.look = b.dataset.look; setPressed('look', state.look); }
});
window.addEventListener('keydown', (e) => {
  const map = { 1: 'neutral', 2: 'smile', 3: 'suspicious', 4: 'surprised' };
  if (map[e.key]) $(`[data-expr="${map[e.key]}"]`).click();
});
window.addEventListener('pointermove', (e) => { state.mouse = { x: e.clientX, y: e.clientY, last: performance.now() }; });
document.addEventListener('pointerleave', () => { state.mouse.last = -1e9; });

// Regard de chaque personnage : vers la souris reelle (relative a SA carte) ou vers une
// position simulee commune.
function pointerFor(card) {
  const sim = { left: { x: -0.9, y: 0.05 }, right: { x: 0.9, y: 0.05 }, up: { x: 0, y: 0.95 } }[state.look];
  if (sim) return { ...sim, active: true };
  if (state.look === 'out') return { x: 0, y: 0, active: false };
  const r = card.frameEl.getBoundingClientRect();
  return {
    x: THREE.MathUtils.clamp((state.mouse.x - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1),
    y: THREE.MathUtils.clamp(-(state.mouse.y - (r.top + r.height * 0.38)) / (innerHeight / 2), -1, 1),
    active: performance.now() - state.mouse.last < 2500,
  };
}

const cards = [];

async function main() {
  const baseLoad = loadGlb(BASE);
  const [{ gltf: base }, hairs] = await Promise.all([
    baseLoad,
    fetch(HAIRS).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const chars = new Map([[BASE, baseLoad]]);                 // un chargement par personnage
  const charFor = (url) => {
    if (!chars.has(url)) chars.set(url, loadGlb(url));
    return chars.get(url);
  };
  const versions = BENCH ? [{ id: 'bench', name: BENCH, note: '', file: BENCH }]
    : SET ? hairs : [{ id: 'ict', name: 'ICT — cheveux actuels', note: 'texture + coquilles', file: null }, ...hairs.slice(0, 3)];
  if (versions.length === 2) cardsEl.classList.add('two');
  if (SET && !BENCH) $('.bar h1').textContent = versions.map((v) => v.name).join(' contre ');

  // Normalisation et cadrage calcules UNE fois, sur le personnage sans coiffure ajoutee.
  const probe = base.scene;
  const box = new THREE.Box3().setFromObject(probe);
  const size = box.getSize(new THREE.Vector3());
  const s = 1 / size.y;
  const offset = new THREE.Vector3();
  probe.scale.setScalar(s); probe.updateMatrixWorld(true);
  box.setFromObject(probe); offset.copy(box.getCenter(new THREE.Vector3())).setY(box.min.y);
  probe.position.sub(offset); probe.updateMatrixWorld(true);
  box.setFromObject(probe);
  const head = probe.getObjectByName('Head');
  const hp = head.getWorldPosition(new THREE.Vector3());
  const frame = {
    height: (box.max.y - hp.y) * 1.6,
    target: new THREE.Vector3(hp.x, hp.y + (box.max.y - hp.y) * 0.4, hp.z + box.getSize(new THREE.Vector3()).z * 0.12),
    depth: box.getSize(new THREE.Vector3()).z,
  };

  for (const v of versions) {
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `<div class="frame"><div class="loading">Chargement…</div></div>
      <div class="meta"><h2></h2><dl>
        <dt>Poids GLB</dt><dd class="w">—</dd><dt>Triangles</dt><dd class="t">—</dd>
        <dt>Draw calls</dt><dd class="d">—</dd><dt>FPS (page)</dt><dd class="f">—</dd><dt>Rendu</dt><dd class="r">—</dd></dl></div>`;
    $('h2', el).textContent = v.name + (v.note ? ` (${v.note})` : '');
    cardsEl.append(el);
    const stage = makeStage(frame);
    const charUrl = v.char || CHAR;
    const ch = await charFor(charUrl);
    const model = SkeletonUtils.clone(ch.gltf.scene);
    model.scale.setScalar(s); model.position.copy(probe.position);
    stage.scene.add(model);
    model.updateMatrixWorld(true);
    // Buste : la texture Hunyuan des epaules est fausse (peau) et le bas est dechire ;
    // pour les quatre versions, un pull gris uni, sans motif.
    model.getObjectByName('torso')?.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone(); o.material.map = null;
      o.material.color.set('#2c2d30'); o.material.roughness = 0.92;
    });
    let bytes = ch.bytes, hairInfo = null;
    if (v.file) {
      const { gltf: hg, bytes: hb, parseMs } = await loadGlb(v.file);
      bytes += hb; hairInfo = { bytes: hb, parseMs, root: hg.scene };
      model.getObjectByName('hair').visible = false;          // coquilles d'origine masquees
      const hair = hg.scene;
      model.add(hair); model.updateMatrixWorld(true);
      model.getObjectByName('Head').attach(hair);            // la coiffure suit la tete
      hair.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        o.material.alphaToCoverage = true;                   // bords de meches doux (MSAA)
        o.material.side = THREE.DoubleSide;
        o.material.shadowSide = THREE.DoubleSide;
      });
    }
    const accs = v.acc || ACC;
    let accBytes = 0;
    for (const url of accs) {
      const { gltf: ag, bytes: ab } = await loadGlb(url);
      accBytes += ab; bytes += ab;
      model.add(ag.scene); model.updateMatrixWorld(true);
      model.getObjectByName('Head').attach(ag.scene);          // l'accessoire suit la tete
      ag.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }
    const rig = new CharacterRig(model);                       // apres les accessoires : barbe a expressions comprise
    rig.setExpression(state.expr);
    $('.loading', el).hidden = true;
    const card = { el, frameEl: $('.frame', el), stage, model, rig, ms: 0, hair: hairInfo,
      char: { url: charUrl, bytes: ch.bytes, parseMs: ch.parseMs }, acc: { urls: accs, bytes: accBytes } };
    $('.w', el).textContent = `${(bytes / 1048576).toFixed(1)} Mo`;
    $('.t', el).textContent = countTriangles(model).toLocaleString('fr-FR');
    cards.push(card);
  }
  window.__cmp = { cards, versions, frame, get fps() { return fps; } };
  if (BENCH) setupBench(cards[0]);
}

// ── Banc de mesure (?bench=) ──
// Chaque version est chargee dans une page neuve et rejoue la meme suite de poses
// avec un pas fixe : seule la coiffure differe d'une image a l'autre.
function setupBench(c) {
  c.rig._startBlink = () => {};
  let closed = false;                                        // yeux fermes force (banc du personnage)
  const updateBlink = c.rig._updateBlink.bind(c.rig);
  c.rig._updateBlink = (t) => { updateBlink(t); if (closed) c.rig.blink.value = 1; };
  const looks = {
    front: { x: 0, y: 0.05, active: true }, left: { x: -0.9, y: 0.05, active: true },
    right: { x: 0.9, y: 0.05, active: true }, up: { x: 0, y: 0.95, active: true },
  };
  let simT = 0;
  const gl = renderer.getContext(), px = new Uint8Array(4);
  renderer.setSize(BW, BH, false);
  const draw = () => {
    renderer.setViewport(0, 0, BW, BH); renderer.setScissor(0, 0, BW, BH);
    c.stage.camera.aspect = BW / BH; c.stage.camera.updateProjectionMatrix();
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.info.reset();
    renderer.render(c.stage.scene, c.stage.camera);
    return renderer.info.render.calls;
  };
  let hairMesh = null;
  c.hair?.root.traverse((o) => { if (o.isMesh) hairMesh = o; });
  // Zones du visage en pixels de l'image du banc, deduites des seuls noeuds des yeux et de
  // l'os de la tete (identiques d'un fichier a l'autre) : memes zones pour chaque version.
  const v3 = () => new THREE.Vector3();
  const toPx = (p) => { const n = p.clone().project(c.stage.camera); return { x: (n.x + 1) / 2 * BW, y: (1 - n.y) / 2 * BH }; };
  function faceZones() {
    c.stage.camera.aspect = BW / BH; c.stage.camera.clearViewOffset();
    c.model.updateMatrixWorld(true);
    const eL = c.model.getObjectByName('eyeLeft').getWorldPosition(v3());
    const eR = c.model.getObjectByName('eyeRight').getWorldPosition(v3());
    const q = c.model.getObjectByName('Head').getWorldQuaternion(new THREE.Quaternion());
    const iod = eL.distanceTo(eR), mid = eL.clone().add(eR).multiplyScalar(0.5);
    const mouth = mid.clone()
      .addScaledVector(v3().set(0, -1, 0).applyQuaternion(q), 1.35 * iod)
      .addScaledVector(v3().set(0, 0, 1).applyQuaternion(q), 0.35 * iod);
    const a = toPx(eL), b = toPx(eR), m = toPx(mid), mo = toPx(mouth);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const rect = (p, w, h) => [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2].map(Math.round);
    return { d, eyes: rect(m, 2.3 * d, 0.95 * d), mouth: rect(mo, 1.4 * d, 0.8 * d), eyesC: m, mouthC: mo };
  }
  window.__bench = {
    info() {
      const g = hairMesh.geometry;
      return { bytes: c.hair.bytes, parseMs: c.hair.parseMs, hairTriangles: g.index.count / 3,
        vertices: g.attributes.position.count, triangles: countTriangles(c.model),
        char: c.char.url, charBytes: c.char.bytes, charParseMs: c.char.parseMs, acc: c.acc };
    },
    // Pose stabilisee (5 s simulees a 60 Hz) puis une image ; renvoie l'image en PNG.
    // opts.closed : yeux fermes ; opts.zoom : 'eyes' | 'mouth', gros plan (meme camera,
    // image recadree par setViewOffset, meme resolution de sortie).
    pose(expr, look, opts = {}) {
      c.rig.setExpression(expr);
      closed = !!opts.closed;
      for (let i = 0; i < 300; i++) { simT += 1 / 60; c.rig.update(1 / 60, simT, looks[look]); }
      const z = faceZones();
      if (opts.zoom) {
        const w = (opts.zoom === 'eyes' ? 1.7 : 1.5) * z.d, h = w * BH / BW;
        const ctr = opts.zoom === 'eyes' ? z.eyesC : z.mouthC;
        c.stage.camera.setViewOffset(BW, BH, ctr.x - w / 2, ctr.y - h / 2, w, h);
      }
      const calls = draw();
      const png = canvas.toDataURL('image/png');
      c.stage.camera.clearViewOffset();
      return { calls, png, zones: { eyes: z.eyes, mouth: z.mouth } };
    },
    // Controle hors etats de jeu : personnage tourne de deg degres (profil, dos).
    orbit(deg) {
      const was = c.model.rotation.y;
      c.model.rotation.y = THREE.MathUtils.degToRad(deg); c.model.updateMatrixWorld(true);
      draw();
      const png = canvas.toDataURL('image/png');
      c.model.rotation.y = was; c.model.updateMatrixWorld(true);
      return { png };
    },
    // Cout d'une image (CPU + GPU, ombres comprises) : n images synchronisees.
    time(n = 200) {
      draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return (performance.now() - t0) / n;
    },
    // Visibilite de chaque carte (vpc sommets par carte, cartes contigues) : nombre de
    // pixels ou elle apparait, vue par vue, test alpha identique au rendu. La tete masque
    // ce qui est derriere elle ; le buste est ignore (prudent : il ne cache rien).
    visibility({ views, vpc = 26, size = 1400, texAlphaOnly = false }) {
      const g = hairMesh.geometry;
      const nCards = g.attributes.position.count / vpc;
      const counts = views.map(() => new Uint32Array(nCards));
      const idMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide, vertexColors: true,
        uniforms: { map: { value: hairMesh.material.map }, vpc: { value: vpc }, useVA: { value: texAlphaOnly ? 0 : 1 } },
        vertexShader: `uniform int vpc; varying vec2 vUv; varying float vA; flat varying int vId;
          void main() { vUv = uv; vA = color.a; vId = gl_VertexID / vpc + 1;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D map; uniform float useVA; varying vec2 vUv; varying float vA; flat varying int vId;
          void main() { float a = texture2D(map, vUv).a * mix(1.0, vA, useVA); if (a < 0.35) discard;
            gl_FragColor = vec4(float(vId & 255), float((vId >> 8) & 255), float((vId >> 16) & 255), 255.0) / 255.0; }`,
      });
      const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const saved = [];
      c.stage.scene.traverse((o) => {
        if (o === hairMesh) { saved.push([o, o.material, o.visible]); o.material = idMat; }
        else if (o.isMesh) {
          saved.push([o, o.material, o.visible]);
          let torso = false; for (let p = o; p; p = p.parent) if (p.name === 'torso') torso = true;
          if (torso || o.parent === c.stage.scene) o.visible = false;   // buste, fond, ombre
          else o.material = black;
        }
      });
      const lights = []; c.stage.scene.traverse((o) => { if (o.isLight) { lights.push([o, o.visible]); o.visible = false; } });
      const rt = new THREE.WebGLRenderTarget(size, size);
      const buf = new Uint8Array(size * size * 4);
      g.computeBoundingSphere();
      const sph = g.boundingSphere.clone().applyMatrix4(hairMesh.matrixWorld);
      const persp = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
      const r = sph.radius * 1.08;
      const ortho = new THREE.OrthographicCamera(-r, r, r, -r, 0.001, 50);
      const fwd = new THREE.Vector3(), q = new THREE.Quaternion();
      c.model.getWorldQuaternion(q);
      const shadowWas = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
      renderer.setScissorTest(false);
      views.forEach((v, k) => {
        const yaw = THREE.MathUtils.degToRad(v.yaw), pitch = THREE.MathUtils.degToRad(v.pitch);
        fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(q);
        const cam = v.ortho ? ortho : persp;
        const dist = v.ortho ? sph.radius * 4 : sph.radius / Math.sin(THREE.MathUtils.degToRad(12)) * 1.05;
        cam.position.copy(sph.center).addScaledVector(fwd, dist); cam.lookAt(sph.center); cam.updateMatrixWorld();
        renderer.setRenderTarget(rt); renderer.setViewport(0, 0, size, size);
        renderer.setClearColor(0x000000, 1); renderer.clear();
        renderer.render(c.stage.scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
        const out = counts[k];
        for (let i = 0; i < buf.length; i += 4) {
          const id = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
          if (id) out[id - 1]++;
        }
      });
      renderer.setRenderTarget(null); renderer.setScissorTest(true); renderer.shadowMap.enabled = shadowWas;
      for (const [o, m, vis] of saved) { o.material = m; o.visible = vis; }
      for (const [l, vis] of lights) l.visible = vis;
      rt.dispose(); idMat.dispose(); black.dispose();
      return counts.map((a) => Array.from(a));
    },
  };
  document.title = 'bench-ready';
}

// ── Boucle ──
const timer = new THREE.Timer();
let fps = 0, frames = 0, since = performance.now();
function resize() {
  if (BENCH) return;
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize); resize();

renderer.setAnimationLoop((ts) => {
  if (BENCH) return;
  timer.update(ts);
  const dt = timer.getDelta(), t = timer.getElapsed();
  const H = innerHeight;
  renderer.setScissor(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0); renderer.clear();
  for (const c of cards) {
    const r = c.frameEl.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > innerWidth) continue;
    c.rig.update(dt, t, pointerFor(c));
    const t0 = performance.now();
    renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
    renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
    c.stage.camera.aspect = r.width / r.height; c.stage.camera.updateProjectionMatrix();
    renderer.info.reset();
    renderer.render(c.stage.scene, c.stage.camera);
    c.calls = renderer.info.render.calls;                    // ombres comprises
    c.ms = c.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  frames++;
  const now = performance.now();
  if (now - since >= 1000) {
    fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now;
    for (const c of cards) {
      $('.f', c.el).textContent = String(fps); $('.r', c.el).textContent = `${c.ms.toFixed(2)} ms CPU`;
      $('.d', c.el).textContent = `${c.calls} (passe d'ombre comprise)`;
    }
  }
});

main().catch((e) => { $('#note').textContent = 'Erreur : ' + e.message; console.error(e); });
