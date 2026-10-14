// Scene du prototype : une carte, un personnage 3D dedans.
//   ?model=models/xxx.glb   modele a charger (defaut : tete de reference Face Cap)
//   ?name=Malo              nom affiche sur la carte

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterRig } from './rig.js';
import { EXPRESSION_ORDER, EXPRESSION_LABELS } from './expressions.js';

const params = new URLSearchParams(location.search);
const MODEL_URL = params.get('model') || 'models/character-01-ict.glb';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/';

const card = document.getElementById('card');
const canvas = document.getElementById('view');
const $ = (id) => document.getElementById(id);

// ── Rendu ──
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoftShadowMap retire en r186 ; le flou vient de shadow.radius

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const camera = new THREE.PerspectiveCamera(24, 3 / 4, 0.01, 50);

// Fond de studio : un degrade radial chaud, peint sur un plan loin derriere.
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      cIn: { value: new THREE.Color('#5b524a') },
      cOut: { value: new THREE.Color('#181513') },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 cIn; uniform vec3 cOut; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        float d = distance(vUv, vec2(0.5, 0.58)) * 1.55;
        vec3 c = mix(cIn, cOut, smoothstep(0.0, 1.0, d));
        c += (hash(gl_FragCoord.xy) - 0.5) * 0.012;   // grain : evite les bandes du degrade
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
backdrop.renderOrder = -1;
scene.add(backdrop);

// Ombre portee douce sur le fond.
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// Eclairage portrait : cle chaude haut-gauche, debouchage froid, contre-jour.
const key = new THREE.DirectionalLight('#ffe3c4', 2.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
scene.add(new THREE.HemisphereLight('#dfe6ff', '#2b231d', 0.55));
const rim = new THREE.DirectionalLight('#bcd2ff', 1.7);
scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.55;

// ── Chargement ──
const ktx2 = new KTX2Loader().setTranscoderPath(THREE_CDN + 'libs/basis/').detectSupport(renderer);
const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

let rig = null;
const stats = { fps: 0, frames: 0, since: performance.now(), bytes: 0, loadMs: 0 };

async function load() {
  const t0 = performance.now();
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Modèle introuvable : ${MODEL_URL}`);
  const buf = await res.arrayBuffer();
  stats.bytes = buf.byteLength;
  const gltf = await loader.parseAsync(buf, MODEL_URL.replace(/[^/]*$/, ''));
  stats.loadMs = Math.round(performance.now() - t0);

  const model = gltf.scene;
  // Normalise : 1 unite = hauteur du modele, pose sur l'origine, face a +Z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = 1 / size.y;
  model.scale.multiplyScalar(s);
  box.setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  scene.add(model);

  rig = new CharacterRig(model, { reducedMotion: $('reduced').checked });
  frame(model);
  showInfo();
  $('loading').hidden = true;
  return gltf;
}

// Cadrage : la tete s'il y a un squelette (buste), sinon le modele entier.
function frame(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  let target = box.getCenter(new THREE.Vector3());
  let height = size.y * 1.12;
  const head = rig.driven.head && rig.caps.mode === 'squelette' ? rig.driven.head.node : null;
  if (head) {
    // L'os Head est a la base du crane : on cadre du haut des epaules au sommet.
    const h = head.getWorldPosition(new THREE.Vector3());
    height = (box.max.y - h.y) * 1.6;
    target = new THREE.Vector3(h.x, h.y + (box.max.y - h.y) * 0.4, h.z + size.z * 0.12);
  }
  const dist = (height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(target.x, target.y + height * 0.04, target.z + dist);
  controls.target.copy(target);
  controls.minDistance = dist * 0.7;
  controls.maxDistance = dist * 1.4;
  controls.minAzimuthAngle = -0.65;
  controls.maxAzimuthAngle = 0.65;
  controls.minPolarAngle = Math.PI / 2 - 0.35;
  controls.maxPolarAngle = Math.PI / 2 + 0.22;
  controls.update();

  const back = target.z - size.z * 1.6;
  backdrop.position.set(target.x, target.y, back - 0.01);
  backdrop.scale.setScalar(height * 6);
  shadowCatcher.position.set(target.x, target.y, back);
  shadowCatcher.scale.setScalar(height * 6);

  key.position.set(target.x - height * 1.3, target.y + height * 1.6, target.z + height * 2.2);
  key.target.position.copy(target);
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -height * 1.4; cam.right = cam.top = height * 1.4;
  cam.near = 0.01; cam.far = height * 12;
  cam.updateProjectionMatrix();
  rim.position.set(target.x + height * 1.4, target.y + height * 1.1, target.z - height * 1.6);
}

// ── Curseur ──
// Position relative a la carte, normalisee par la moitie de la fenetre : le
// personnage suit le curseur partout sur la page, pas seulement sur la carte.
const pointer = { x: 0, y: 0, active: false, last: -1e9 };
window.addEventListener('pointermove', (e) => {
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.38;
  pointer.x = THREE.MathUtils.clamp((e.clientX - cx) / (innerWidth / 2), -1, 1);
  pointer.y = THREE.MathUtils.clamp(-(e.clientY - cy) / (innerHeight / 2), -1, 1);
  pointer.last = performance.now();
});
document.addEventListener('pointerleave', () => { pointer.last = -1e9; });

// ── Interface ──
for (const [i, name] of EXPRESSION_ORDER.entries()) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.expr = name;
  b.setAttribute('aria-pressed', String(name === 'neutral'));
  b.innerHTML = `${EXPRESSION_LABELS[name]}<kbd>${i + 1}</kbd>`;
  b.addEventListener('click', () => setExpression(name));
  $('chips').append(b);
}
function setExpression(name) {
  rig?.setExpression(name);
  for (const b of document.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(b.dataset.expr === name));
}
window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= EXPRESSION_ORDER.length) setExpression(EXPRESSION_ORDER[n - 1]);
  if (e.key === 'b' || e.key === 'B') rig?.blinkNow(timer.getElapsed());
});
const mq = matchMedia('(prefers-reduced-motion: reduce)');
$('reduced').checked = mq.matches;
$('reduced').addEventListener('change', (e) => { if (rig) rig.reducedMotion = e.target.checked; });

$('plate-name').textContent = params.get('name') || (MODEL_URL.includes('facecap') ? 'Tête de référence' : 'Personnage');
$('plate-note').textContent = MODEL_URL.split('/').pop();

function showInfo() {
  const c = rig.caps;
  const rows = [
    ['Modèle', `${MODEL_URL.split('/').pop()} — ${(stats.bytes / 1024).toFixed(0)} Ko, ${stats.loadMs} ms`],
    ['Triangles', c.triangles.toLocaleString('fr-FR')],
    ['Animation', c.mode === 'squelette' ? `squelette (${c.bones.join(', ')})` : 'pivot de cou (pas de squelette)'],
    ['Yeux', c.eyes],
    ['Blendshapes', `${c.morphTargets} (ARKit pilotées : ${c.arkitCoverage})`],
    ['Clignement', c.blink ? 'oui' : 'non'],
    ['FPS', '<span id="fps">—</span>'],
  ];
  $('info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ── Boucle ──
function resize() {
  const w = card.clientWidth, h = card.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(card);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((ts) => {
  timer.update(ts);
  const dt = timer.getDelta();
  const t = timer.getElapsed();
  if (rig) {
    pointer.active = performance.now() - pointer.last < 2500;
    rig.update(dt, t, pointer);
  }
  controls.update();
  renderer.render(scene, camera);

  stats.frames++;
  const now = performance.now();
  if (now - stats.since >= 1000) {
    stats.fps = Math.round((stats.frames * 1000) / (now - stats.since));
    stats.frames = 0; stats.since = now;
    const el = document.getElementById('fps');
    if (el) el.textContent = String(stats.fps);
  }
});

// Expose l'etat pour les tests navigateur.
window.__proto = { get rig() { return rig; }, stats, renderer, setExpression, pointer };

load().catch((err) => {
  $('loading').textContent = err.message;
  console.error(err);
});
