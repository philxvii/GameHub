// Test du prototype 3D dans un vrai Chrome (GPU force), souris pilotee par CDP.
//
//   python -m http.server 4173                       # depuis la racine du depot
//   node games/qui-est-ce/prototype-3d/tools/test-proto.js [modele.glb] [--headful]
//
// Verifie : chargement sans erreur, squelette / yeux / blendshapes detectes,
// regard puis tete qui suivent la souris a gauche et a droite, clignements,
// respiration, expressions, FPS. Ecrit des captures dans build/shots/.

const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');

const args = process.argv.slice(2);
const MODEL = args.find(a => a.endsWith('.glb')) || 'models/character-01-ict.glb';
// Drapeaux GPU : D3D11 sous Windows ; ailleurs (machine cloud sans GPU), rendu logiciel
// SwiftShader (deterministe, mais les temps de rendu ne valent pas ceux d'un vrai GPU).
// ORIGIN : serveur statique a la racine du depot (PROTO_ORIGIN pour changer de port).
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = `${ORIGIN}/games/qui-est-ce/prototype-3d/?model=${MODEL}&name=Personnage%2001`;
const SHOTS = path.join(__dirname, '..', 'build', 'shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail !== '' ? ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

(async () => {
  const b = await Browser.launch({
    headless: !args.includes('--headful'),
    windowSize: '1100,900',
    extraArgs: GPU_FLAGS,
  });
  const p = await b.newPage('about:blank', 'proto');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  try {
    await p.goto(URL);
    const loaded = await p.eval(`for (let i = 0; i < 100; i++) { if (window.__proto && __proto.rig) return true; await new Promise(r => setTimeout(r, 200)); } return false;`);
    check('Modele charge', loaded, MODEL);
    if (!loaded) throw new Error('modele non charge');

    const info = await p.eval(`
      const gl = __proto.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info');
      return { gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?', caps: __proto.rig.caps, bytes: __proto.stats.bytes, loadMs: __proto.stats.loadMs };`);
    console.log('       GPU :', info.gpu);
    check('Squelette detecte (Spine2, Neck, Head)', info.caps.mode === 'squelette', info.caps.bones.join(', '));
    check('Yeux separes pilotes en rotation', info.caps.eyes === 'rotation');
    check('Blendshapes ARKit', info.caps.morphTargets >= 20 && info.caps.blink, `${info.caps.morphTargets} dont ${info.caps.arkitCoverage} pilotees`);

    // Souris : centre de la carte, puis tout a gauche, puis tout a droite.
    const box = await p.eval(`const r = document.getElementById('card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.38 };`);
    const move = async (x, y) => {
      for (let i = 0; i <= 10; i++) {
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + (x - box.x) * i / 10, y: box.y + (y - box.y) * i / 10 });
        await sleep(16);
      }
    };
    const pose = `
      const r = __proto.rig, s = r.state, T = r.driven;
      const yawOf = o => { const q = o.getWorldQuaternion(o.quaternion.clone()); const v = { x: 0, y: 0, z: 1 };
        const x = 2 * (q.x * q.z + q.w * q.y), z = 1 - 2 * (q.x * q.x + q.y * q.y); return Math.atan2(x, z); };
      return { eye: s.eye.yaw, head: s.head.yaw, chest: s.chest.yaw,
               headBone: yawOf(T.head.node), eyeNode: T.eyeL ? yawOf(T.eyeL.node) : null };`;
    await move(box.x, box.y); await sleep(1500);
    const centre = await p.eval(pose);
    await move(40, box.y);
    const leftEarly = await p.eval(pose);       // 160 ms : les yeux sont deja partis
    await sleep(1600);
    const left = await p.eval(pose);
    await p.screenshot(path.join(SHOTS, 'cursor-left.png'));
    await move(1060, box.y); await sleep(1600);
    const right = await p.eval(pose);
    await p.screenshot(path.join(SHOTS, 'cursor-right.png'));
    const r3 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : +v.toFixed(3)]));
    check('Curseur a gauche : yeux puis tete vers la gauche', left.eye < -0.05 && left.headBone < centre.headBone - 0.05, r3(left));
    check('Les yeux menent, la tete suit', Math.abs(leftEarly.eye) > Math.abs(leftEarly.head), r3(leftEarly));
    check('Curseur a droite : yeux et tete vers la droite', right.eye > 0.05 && right.headBone > centre.headBone + 0.05, r3(right));
    check('Le buste accompagne tres legerement', Math.abs(right.chest) > 0.01 && Math.abs(right.chest) < Math.abs(right.head), r3({ chest: right.chest, head: right.head }));

    // Clignements et respiration sur 8 s (souris au repos).
    const life = await p.eval(`
      const r = __proto.rig; let blinks = 0, prev = 0, max = 0; const ys = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 8000) {
        const v = r.face.eyeBlinkLeft || 0; if (v > 0.85 && prev <= 0.85) blinks++; prev = v; max = Math.max(max, v);
        ys.push(r.driven.chest ? r.driven.chest.node.quaternion.x : 0);
        await new Promise(res => setTimeout(res, 16));
      }
      return { blinks, max, breath: Math.max(...ys) - Math.min(...ys) };`);
    check('Clignements naturels (1 a 4 en 8 s)', life.blinks >= 1 && life.blinks <= 4, life);
    check('Respiration (le buste bouge)', life.breath > 0.002, life.breath.toFixed(4));

    // Expressions : poids effectifs sur le maillage + captures.
    for (const [name, shape] of [['smile', 'mouthSmileLeft'], ['suspicious', 'browDownLeft'], ['surprised', 'browInnerUp']]) {
      await p.eval(`__proto.pointer.last = -1e9; __proto.setExpression('${name}'); return 1;`);
      await sleep(1300);
      const w = await p.eval(`const m = __proto.rig.morphMeshes[0]; const i = m.map['${shape}']; return i === undefined ? -1 : m.mesh.morphTargetInfluences[i[0]];`);
      check(`Expression ${name} (${shape})`, w > 0.3, +w.toFixed(2));
      await p.screenshot(path.join(SHOTS, `expr-${name}.png`));
    }
    await p.eval(`__proto.setExpression('neutral'); return 1;`);
    await sleep(800);
    await p.screenshot(path.join(SHOTS, 'expr-neutral.png'));
    await p.eval(`__proto.rig.blinkNow(__proto.rig.blink.last ? performance.now() : 0); return 1;`);

    // FPS : fenetre de 4 s pendant que la souris bouge.
    const fps = await p.eval(`
      let n = 0; const t0 = performance.now(); let worst = 0, last = t0;
      while (performance.now() - t0 < 4000) { await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++; }
      return { fps: Math.round(n * 1000 / (performance.now() - t0)), worstFrameMs: Math.round(worst) };`);
    check('Fluidite (>= 50 FPS)', fps.fps >= 50, { ...fps, gpu: info.gpu });

    // X4122 : note du compilateur HLSL de Direct3D sur un arrondi dans les shaders
    // de Three.js. Avertissement du pilote, sans effet sur le rendu : signale, pas bloquant.
    const all = p.errors();
    const known = all.filter(e => /warning X4122/.test(e));
    const errs = all.filter(e => !/warning X4122/.test(e));
    check('Console sans erreur', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : `${known.length} avertissement(s) X4122 du compilateur D3D, connus`);
  } catch (e) {
    check('Execution', false, e.message);
  } finally {
    await b.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== PROTOTYPE 3D : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
