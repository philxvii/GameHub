// Les trois dés du 421 en vraie 3D (Three.js) : os verni, arêtes arrondies, points creusés, ombre
// portée. Le tapis est en CSS, dessous : le canevas, transparent, ne dessine que les dés et leurs
// ombres, vus presque d'en haut (on lit la face du dessus). Une image n'est rendue que pendant un
// lancer ou un changement.
//
// Faces : +y porte le 1 (le dessus), -y le 6, +x le 2, -x le 5, +z le 3, -z le 4 (opposées : 7).
// Pour montrer v, on fait tourner le dé de sorte que la face v regarde vers le haut.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FACE_OF = [2, 5, 1, 6, 3, 4];                 // ordre des faces de BoxGeometry : +x −x +y −y +z −z
const UP = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const SLOTS = [-1.45, 0, 1.45];
// Cadrage calculé : un dé occupe ~14 % de la largeur ; dés posés et points de départ dans le cadre.
const DIST = 10, EL = 70 * Math.PI / 180;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden;

// Une face : la couleur (os, points sombres, le 1 rouge) et le relief (points creusés).
function faceTextures(v) {
  const N = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const col = mk(), bump = mk(), g = col.getContext('2d'), b = bump.getContext('2d');
  const bg = g.createRadialGradient(N * .35, N * .3, N * .1, N * .5, N * .5, N * .75);
  bg.addColorStop(0, '#fffdf6'); bg.addColorStop(1, '#ece2cc');
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  b.fillStyle = '#fff'; b.fillRect(0, 0, N, N);
  const r = (v === 1 ? .15 : .095) * N;
  for (const [x, y] of PIPS[v]) {
    const cx = (.24 + x * .26) * N, cy = (.24 + y * .26) * N;
    const pg = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
    if (v === 1) { pg.addColorStop(0, '#d9412f'); pg.addColorStop(1, '#7c140c'); }
    else { pg.addColorStop(0, '#3b2a1e'); pg.addColorStop(1, '#0d0704'); }
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    const bb = b.createRadialGradient(cx, cy, r * .2, cx, cy, r * 1.08);
    bb.addColorStop(0, '#000'); bb.addColorStop(.8, '#222'); bb.addColorStop(1, '#fff');
    b.fillStyle = bb; b.beginPath(); b.arc(cx, cy, r * 1.08, 0, Math.PI * 2); b.fill();
  }
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return { map, bump: new THREE.CanvasTexture(bump) };
}

export function createDice3D() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'dice-gl';

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1.45, .5, 60);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-3.8, 9, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -6; key.shadow.camera.right = key.shadow.camera.top = 6;
  key.shadow.radius = 5; key.shadow.bias = -.0005; key.shadow.normalBias = .02;
  scene.add(key, new THREE.HemisphereLight(0xfff6e8, 0x1d3a2c, .55));
  // Le sol : invisible, il ne reçoit que les ombres (la feutrine est en CSS dessous).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .42 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  const geo = new RoundedBoxGeometry(1, 1, 1, 6, .15);
  const mats = FACE_OF.map(v => {
    const t = faceTextures(v);
    return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughness: .38, clearcoat: .55, clearcoatRoughness: .22, envMapIntensity: .55 });
  });
  const ring = new THREE.MeshBasicMaterial({ color: 0xd9ae66, transparent: true, opacity: 0, depthWrite: false });
  const dice = SLOTS.map((x, i) => {
    const m = new THREE.Mesh(geo, mats.map(x => x.clone()));
    m.castShadow = true;
    m.position.set(x, .5, 0);
    const halo = new THREE.Mesh(new THREE.RingGeometry(.72, .8, 48).rotateX(-Math.PI / 2), ring.clone());
    halo.position.set(x, .006, 0);
    scene.add(m, halo);
    return { m, halo, v: 1, yaw: 0, held: false, i };
  });

  // ══════════════════ Rendu à la demande ══════════════════
  let raf = 0, tweens = [];
  const invalidate = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    tweens = tweens.filter(t => {
      if (now < t.t0) return true;
      const k = Math.min(1, (now - t.t0) / t.ms);
      t.fn(k);
      if (k >= 1) { t.done(); return false; }
      return true;
    });
    renderer.render(scene, camera);
    if (tweens.length) invalidate();
  }
  const tween = (ms, fn, delay = 0) => new Promise(done => { tweens.push({ t0: performance.now() + delay, ms, fn, done }); invalidate(); });

  // Pose : face v en haut, un quart de tour au hasard autour de la verticale, légère dispersion.
  const restQ = d => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw).multiply(UP[d.v]);
  const restP = d => new THREE.Vector3(SLOTS[d.i] + d.dx, d.held ? .5 : .5, d.dz);
  function place(d) {
    d.m.quaternion.copy(restQ(d));
    d.m.position.copy(restP(d));
    d.halo.position.set(d.m.position.x, .006, d.m.position.z);
    d.halo.material.opacity = d.held ? .9 : 0;
  }
  const scatter = d => { d.yaw = (Math.random() * 2 - 1) * .6; d.dx = (Math.random() * 2 - 1) * .18; d.dz = (Math.random() * 2 - 1) * .35; };
  dice.forEach(d => { scatter(d); place(d); });

  function setDice(str) {
    tweens = [];
    [...String(str)].forEach((v, i) => { const d = dice[i]; if (d && d.v !== Number(v)) { d.v = Number(v); scatter(d); } place(d); });
    invalidate();
  }

  // Lancer : chaque dé non gardé arrive du bord en tournant, rebondit trois fois, se pose.
  function roll(str, kept = []) {
    const jobs = [];
    [...String(str)].forEach((v, i) => {
      const d = dice[i];
      if (kept.includes(i)) return;
      d.v = Number(v); scatter(d);
      const end = restP(d), q1 = restQ(d);
      if (reduced()) { place(d); return; }
      const side = Math.random() < .5 ? -1 : 1;
      // Départ au-dessus du tapis, côté joueur, toujours dans le cadre : on voit le dé tomber.
      const start = new THREE.Vector3(side * (.6 + Math.random() * .9), 3.2 + Math.random() * .6, 1 + Math.random() * .6);
      const axis = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
      const spin = (3 + Math.random() * 2.5) * Math.PI, ms = 1050 + Math.random() * 250;
      jobs.push(tween(ms, k => {
        const e = 1 - Math.pow(1 - k, 3);
        const hop = Math.abs(Math.sin(k * Math.PI * 3.2)) * 1.6 * Math.pow(1 - k, 2.2);
        d.m.position.set(start.x + (end.x - start.x) * e, end.y + (start.y - end.y) * Math.pow(1 - k, 3) + hop, start.z + (end.z - start.z) * e);
        d.m.quaternion.copy(q1).multiply(new THREE.Quaternion().setFromAxisAngle(axis, spin * Math.pow(1 - k, 1.6)));
        d.halo.position.set(d.m.position.x, .006, d.m.position.z);
        d.halo.material.opacity = 0;
      }, i * 90).then(() => place(d)));
    });
    invalidate();
    return Promise.all(jobs);
  }

  // Dés gardés : un anneau de laiton sur la feutrine et le dé qui se soulève d'un rien.
  function setHeld(mask) {
    dice.forEach((d, i) => {
      const on = !!mask[i];
      if (on === d.held) return;
      d.held = on;
      const y0 = d.m.position.y, o0 = d.halo.material.opacity;
      tween(180, k => { d.m.position.y = y0 + ((on ? .62 : .5) - y0) * k; d.halo.material.opacity = o0 + ((on ? .9 : 0) - o0) * k; });
    });
  }

  // Cadrage : le canevas couvre la piste ; la caméra regarde les dés de trois quarts.
  let host = null;
  const ro = new ResizeObserver(() => resize());
  function resize() {
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = DIST * Math.max(1, 1.45 / camera.aspect);
    camera.position.set(0, dist * Math.sin(EL), dist * Math.cos(EL));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }
  function attach(el) {
    if (host === el) return;
    if (host) ro.unobserve(host);
    host = el;
    el.appendChild(canvas);
    ro.observe(el);
    resize();
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(dice.map(d => d.m), false)[0];
    return hit ? dice.findIndex(d => d.m === hit.object) : -1;
  }

  return { canvas, attach, setDice, roll, setHeld, pick, paint: invalidate };
}
