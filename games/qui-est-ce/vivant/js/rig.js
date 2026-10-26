// Rig du personnage : regard, tete, buste, respiration, clignement, expressions.
//
// S'adapte a ce que le GLB contient :
//   - squelette (Avaturn, Ready Player Me, Mixamo) : os Spine2 / Neck / Head / LeftEye / RightEye ;
//   - sinon, un pivot ajoute a la base du cou fait tourner tout le modele ;
//   - yeux : noeuds separes (rotation) ou, a defaut, blendshapes eyeLook* ;
//   - visage : blendshapes ARKit, sous leurs deux nommages (voir expressions.js).
//
// Toutes les rotations sont calculees dans le repere du monde (le personnage
// regarde vers +Z, la camera), puis converties dans le repere local de chaque
// noeud : le rig ne depend donc pas des axes choisis par l'outil d'export.

import * as THREE from 'three';
import { EXPRESSIONS, canonicalName, drivenShapes } from './expressions.js';

// Amplitudes en radians. Les yeux menent, la tete suit, le buste accompagne.
const GAZE_MAX = { yaw: 0.55, pitch: 0.32 };     // ou le personnage veut regarder
const EYE_MAX = { yaw: 0.36, pitch: 0.22 };      // ce que les yeux couvrent seuls
const HEAD_SHARE = 0.55;                          // part du regard prise par la tete
const CHEST_SHARE = 0.14;                         // part prise par le buste
const DAMP = { eye: 22, head: 4.2, chest: 1.8, face: 7 };

const BONE_PATTERNS = {
  head: /(^|[:_])head$/i,
  neck: /(^|[:_])neck$/i,
  chest: /(^|[:_])spine2$/i,
  spine: /(^|[:_])spine1?$/i,
  eyeL: /(^|[:_])(left_?eye|eye_?l(eft)?)$/i,
  eyeR: /(^|[:_])(right_?eye|eye_?r(ight)?)$/i,
};

const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);

// Pilote un noeud par une rotation exprimee dans le repere du monde.
class Driven {
  constructor(node) {
    this.node = node;
    this.rest = node.quaternion.clone();
    this.parentWorld = new THREE.Quaternion();
    if (node.parent) node.parent.getWorldQuaternion(this.parentWorld);
    this.parentInv = this.parentWorld.clone().invert();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  // yaw : vers la droite de l'ecran (+X), pitch : vers le haut, roll : inclinaison.
  set(yaw, pitch, roll = 0) {
    this._e.set(-pitch, yaw, roll);
    this._q.setFromEuler(this._e);
    // local = P^-1 * D * P * repos
    this.node.quaternion.copy(this.parentInv).multiply(this._q).multiply(this.parentWorld).multiply(this.rest);
  }
}

export class CharacterRig {
  constructor(model, { reducedMotion = false } = {}) {
    this.model = model;
    this.reducedMotion = reducedMotion;
    this.expression = 'neutral';
    this.face = {};                 // poids lisses, nom ARKit -> 0..1
    this.state = {
      gaze: { yaw: 0, pitch: 0 },   // regard total lisse
      head: { yaw: 0, pitch: 0, roll: 0 },
      chest: { yaw: 0, pitch: 0 },
      eye: { yaw: 0, pitch: 0 },
    };
    this.blink = { value: 0, next: rand(1.2, 3), t0: -1, double: false };
    this.idle = { target: { yaw: 0, pitch: 0 }, next: 0 };
    this._lastGazeTarget = { yaw: 0, pitch: 0 };
    model.updateMatrixWorld(true);
    this.caps = this._detect();
  }

  _detect() {
    const bones = {};
    const nodes = {};
    const morphMeshes = [];
    let triangles = 0;
    this.model.traverse((o) => {
      if (o.isBone) {
        for (const [k, re] of Object.entries(BONE_PATTERNS)) if (!bones[k] && re.test(o.name)) bones[k] = o;
      } else if (o.name) {
        // Yeux livres comme noeuds separes (Face Cap : grp_eyeLeft / grp_eyeRight).
        if (!nodes.eyeL && /^(grp_)?eye_?left$/i.test(o.name) && (!o.parent || !/eye/i.test(o.parent.name))) nodes.eyeL = o;
        if (!nodes.eyeR && /^(grp_)?eye_?right$/i.test(o.name) && (!o.parent || !/eye/i.test(o.parent.name))) nodes.eyeR = o;
      }
      if (o.isMesh) {
        const g = o.geometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.morphTargetDictionary && o.morphTargetInfluences) {
          const map = {};
          for (const [name, i] of Object.entries(o.morphTargetDictionary)) map[canonicalName(name)] = [i];
          // Certains modeles (ICT-FaceKit) separent en gauche/droite ce qu'ARKit garde
          // entier : browInnerUp pilote alors les deux moities.
          for (const whole of ['browInnerUp', 'cheekPuff', 'mouthFunnel', 'mouthPucker', 'jawOpen']) {
            if (!map[whole] && map[whole + 'Left'] && map[whole + 'Right']) map[whole] = [...map[whole + 'Left'], ...map[whole + 'Right']];
          }
          morphMeshes.push({ mesh: o, map });
        }
      }
    });

    const skeleton = !!(bones.head && bones.neck);
    const eyeL = bones.eyeL || nodes.eyeL;
    const eyeR = bones.eyeR || nodes.eyeR;
    const shapeNames = new Set(morphMeshes.flatMap((m) => Object.keys(m.map)));
    const wanted = drivenShapes();

    this.driven = {};
    if (skeleton) {
      this.driven.head = new Driven(bones.head);
      this.driven.neck = new Driven(bones.neck);
      const chest = bones.chest || bones.spine;
      if (chest) this.driven.chest = new Driven(chest);
    } else {
      this._addPivot();
    }
    if (eyeL && eyeR) {
      this.driven.eyeL = new Driven(eyeL);
      this.driven.eyeR = new Driven(eyeR);
    }
    this.morphMeshes = morphMeshes;

    return {
      mode: skeleton ? 'squelette' : 'pivot',
      bones: Object.keys(bones),
      eyes: eyeL && eyeR ? 'rotation' : shapeNames.has('eyeLookInLeft') ? 'blendshapes' : 'aucun',
      morphTargets: shapeNames.size,
      arkitCoverage: wanted.filter((n) => shapeNames.has(n)).length + ' / ' + wanted.length,
      blink: shapeNames.has('eyeBlinkLeft'),
      triangles: Math.round(triangles),
    };
  }

  // Sans squelette : un pivot a la base du cou porte tout le modele.
  _addPivot() {
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const neck = new THREE.Vector3(c.x, box.min.y + size.y * 0.12, c.z - size.z * 0.12);
    const pivot = new THREE.Group();
    pivot.name = 'rig-pivot';
    const parent = this.model.parent;
    pivot.position.copy(neck);
    if (parent) parent.add(pivot);
    pivot.add(this.model);
    this.model.position.sub(neck);
    pivot.updateMatrixWorld(true);
    this.pivot = pivot;
    this.pivotRest = pivot.position.clone();
    this.size = size;
    this.driven.head = new Driven(pivot);
  }

  setExpression(name) {
    if (EXPRESSIONS[name]) this.expression = name;
  }

  // pointer : { x, y } dans [-1, 1] (y vers le haut), active : le curseur bouge.
  update(dt, t, pointer) {
    dt = Math.min(dt, 0.05);
    const rm = this.reducedMotion;
    const expr = EXPRESSIONS[this.expression];
    const s = this.state;

    // 1. Ou regarder : le curseur, sinon de petites saccades d'inactivite.
    let target;
    if (pointer.active) {
      target = { yaw: pointer.x * GAZE_MAX.yaw, pitch: pointer.y * GAZE_MAX.pitch };
    } else {
      if (!rm && t > this.idle.next) {
        this.idle.target = { yaw: rand(-0.09, 0.09), pitch: rand(-0.05, 0.04) };
        this.idle.next = t + rand(0.8, 2.6);
      }
      target = rm ? { yaw: 0, pitch: 0 } : this.idle.target;
    }
    if (expr.gaze) {
      target = { yaw: target.yaw + expr.gaze.yaw, pitch: target.pitch + expr.gaze.pitch };
    }

    // Un grand deplacement du regard s'accompagne souvent d'un clignement.
    const jump = Math.hypot(target.yaw - this._lastGazeTarget.yaw, target.pitch - this._lastGazeTarget.pitch);
    if (jump > 0.28 && this.blink.t0 < 0 && t - (this.blink.last || 0) > 1.2 && Math.random() < 0.35) this._startBlink(t);
    this._lastGazeTarget = target;

    // 2. Le regard lisse est rapide ; tete et buste le suivent plus lentement.
    s.gaze.yaw = damp(s.gaze.yaw, target.yaw, DAMP.eye, dt);
    s.gaze.pitch = damp(s.gaze.pitch, target.pitch, DAMP.eye, dt);

    const drift = rm ? 0 : 1;
    const headTarget = {
      yaw: target.yaw * HEAD_SHARE + expr.head.yaw + drift * 0.012 * Math.sin(t * 0.37),
      pitch: target.pitch * HEAD_SHARE + expr.head.pitch + drift * 0.008 * Math.sin(t * 0.23 + 1.3),
      roll: expr.head.roll + drift * 0.01 * Math.sin(t * 0.19 + 0.4) - target.yaw * 0.06,
    };
    const kHead = rm ? DAMP.head * 2 : DAMP.head;
    s.head.yaw = damp(s.head.yaw, headTarget.yaw, kHead, dt);
    s.head.pitch = damp(s.head.pitch, headTarget.pitch, kHead, dt);
    s.head.roll = damp(s.head.roll, headTarget.roll, kHead, dt);
    s.chest.yaw = damp(s.chest.yaw, target.yaw * CHEST_SHARE, DAMP.chest, dt);
    s.chest.pitch = damp(s.chest.pitch, target.pitch * CHEST_SHARE * 0.5, DAMP.chest, dt);

    // Les yeux couvrent ce que la tete et le buste n'ont pas encore pris.
    s.eye.yaw = THREE.MathUtils.clamp(s.gaze.yaw - s.head.yaw - s.chest.yaw, -EYE_MAX.yaw, EYE_MAX.yaw);
    s.eye.pitch = THREE.MathUtils.clamp(s.gaze.pitch - s.head.pitch - s.chest.pitch, -EYE_MAX.pitch, EYE_MAX.pitch);

    // 3. Respiration : 4,6 s par cycle, le buste se souleve, la tete suit a peine.
    const breath = Math.sin((t / 4.6) * Math.PI * 2) * (rm ? 0.35 : 1);

    const d = this.driven;
    if (this.pivot) {
      this.pivot.position.copy(this.pivotRest);
      this.pivot.position.y += breath * this.size.y * 0.0035;
      d.head.set(s.head.yaw + s.chest.yaw, s.head.pitch + s.chest.pitch + breath * 0.006, s.head.roll);
    } else {
      if (d.chest) d.chest.set(s.chest.yaw, s.chest.pitch - breath * 0.012, 0);
      d.neck.set(s.head.yaw * 0.4, s.head.pitch * 0.4 + breath * 0.004, s.head.roll * 0.4);
      d.head.set(s.head.yaw * 0.6, s.head.pitch * 0.6, s.head.roll * 0.6);
    }
    if (d.eyeL) {
      d.eyeL.set(s.eye.yaw, s.eye.pitch);
      d.eyeR.set(s.eye.yaw, s.eye.pitch);
    }

    // 4. Visage : expression + clignement + paupieres qui suivent le regard.
    this._updateBlink(t);
    const want = { ...expr.weights };
    const blink = this.blink.value;
    want.eyeBlinkLeft = Math.max(want.eyeBlinkLeft || 0, blink);
    want.eyeBlinkRight = Math.max(want.eyeBlinkRight || 0, blink);
    const down = Math.max(0, -s.eye.pitch) / EYE_MAX.pitch;
    const up = Math.max(0, s.eye.pitch) / EYE_MAX.pitch;
    want.eyeLookDownLeft = want.eyeLookDownRight = down * 0.55;
    want.eyeLookUpLeft = want.eyeLookUpRight = up * 0.45;
    if (this.caps.eyes === 'blendshapes') {
      // Le personnage regarde vers +X = sa gauche : l'oeil gauche part vers l'exterieur.
      const side = s.eye.yaw / EYE_MAX.yaw;
      want.eyeLookOutLeft = Math.max(0, side); want.eyeLookInRight = Math.max(0, side);
      want.eyeLookInLeft = Math.max(0, -side); want.eyeLookOutRight = Math.max(0, -side);
    }
    for (const name of new Set([...Object.keys(this.face), ...Object.keys(want)])) {
      // Le clignement ne passe pas par l'amortissement : il doit rester net.
      const k = name.startsWith('eyeBlink') || name.startsWith('eyeLook') ? 60 : DAMP.face;
      this.face[name] = damp(this.face[name] || 0, want[name] || 0, k, dt);
    }
    for (const { mesh, map } of this.morphMeshes) {
      const inf = mesh.morphTargetInfluences;
      for (const [name, v] of Object.entries(this.face)) {
        const idx = map[name];
        if (idx) for (const i of idx) inf[i] = Math.min(1, v);
      }
    }
  }

  _startBlink(t) {
    this.blink.t0 = t;
    this.blink.last = t;
    this.blink.double = Math.random() < 0.15;
  }

  // Fermeture 70 ms, tenue 30 ms, ouverture 140 ms : un clignement reel dure ~250 ms.
  _updateBlink(t) {
    const b = this.blink;
    if (b.t0 < 0 && t > b.next) this._startBlink(t);
    if (b.t0 < 0) { b.value = 0; return; }
    const e = t - b.t0;
    if (e < 0) b.value = 0;            // pause entre les deux battements d'un double clignement
    else if (e < 0.07) b.value = (e / 0.07) ** 2;
    else if (e < 0.1) b.value = 1;
    else if (e < 0.24) b.value = 1 - ((e - 0.1) / 0.14) ** 0.8;
    else {
      b.value = 0;
      if (b.double) { b.double = false; b.t0 = t + 0.08; return; }
      b.t0 = -1;
      b.next = t + rand(2.2, 5.8);
    }
  }

  // Pour les tests : force un clignement maintenant.
  blinkNow(t) { this._startBlink(t); }
}
