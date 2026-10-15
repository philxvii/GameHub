// Points d'accroche des evenements du jeu : question, reponse, carte ecartee, victoire...
// Le module de son (js/game/sfx.js, coupe par defaut) ecoute ces evenements ; on emet un evenement
// `qe:<nom>` sur window.
export function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('qe:' + name, { detail }));
}
