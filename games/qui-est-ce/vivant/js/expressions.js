// Expressions du visage, exprimees en blendshapes ARKit (52 noms standard).
// Pur : aucune dependance a Three.js, testable dans Node.
//
// Les modeles nomment leurs morph targets de deux facons :
//   ARKit / Avaturn / Ready Player Me : eyeBlinkLeft, mouthSmileRight…
//   Face Cap                          : eyeBlink_L,   mouthSmile_R…
// `canonicalName` ramene les deux vers la forme ARKit.

export function canonicalName(name) {
  return name.replace(/_L$/, 'Left').replace(/_R$/, 'Right');
}

// Poids par expression. Les valeurs restent sous 0,8 : au-dela, le visage
// passe de l'expression a la grimace.
export const EXPRESSIONS = {
  neutral: { weights: {}, head: { yaw: 0, pitch: 0, roll: 0 } },

  smile: {
    weights: {
      mouthSmileLeft: 0.72, mouthSmileRight: 0.68,
      cheekSquintLeft: 0.38, cheekSquintRight: 0.34,
      eyeSquintLeft: 0.22, eyeSquintRight: 0.2,
      mouthDimpleLeft: 0.18, mouthDimpleRight: 0.15,
      browInnerUp: 0.08,
    },
    head: { yaw: 0, pitch: -0.025, roll: 0.035 },
  },

  // Asymetrique : un sourcil bas, l'autre leve, les yeux plisses, la bouche pincee
  // et tiree d'un cote. Le regard part un peu de cote (voir `gaze`).
  suspicious: {
    weights: {
      browDownLeft: 0.62, browDownRight: 0.12,
      browOuterUpRight: 0.42,
      eyeSquintLeft: 0.58, eyeSquintRight: 0.34,
      mouthPressLeft: 0.35, mouthPressRight: 0.28,
      mouthLeft: 0.22,
      noseSneerLeft: 0.12,
    },
    head: { yaw: 0.06, pitch: 0.05, roll: -0.05 },
    gaze: { yaw: -0.12, pitch: 0 },
  },

  surprised: {
    weights: {
      browInnerUp: 0.82,
      browOuterUpLeft: 0.7, browOuterUpRight: 0.7,
      eyeWideLeft: 0.66, eyeWideRight: 0.66,
      jawOpen: 0.3,
      mouthFunnel: 0.14,
      mouthLowerDownLeft: 0.18, mouthLowerDownRight: 0.18,
    },
    head: { yaw: 0, pitch: -0.07, roll: 0 },
  },
};

export const EXPRESSION_ORDER = ['neutral', 'smile', 'suspicious', 'surprised'];

export const EXPRESSION_LABELS = {
  neutral: 'Neutre',
  smile: 'Sourire',
  suspicious: 'Méfiant',
  surprised: 'Surpris',
};

// Toutes les cles utilisees par les expressions, le clignement et le regard.
export function drivenShapes() {
  const s = new Set(['eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookUpLeft', 'eyeLookUpRight',
    'eyeLookDownLeft', 'eyeLookDownRight']);
  for (const e of Object.values(EXPRESSIONS)) for (const k of Object.keys(e.weights)) s.add(k);
  return [...s];
}
