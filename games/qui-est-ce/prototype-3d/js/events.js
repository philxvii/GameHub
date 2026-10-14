// Points d'accroche des evenements du jeu : question, reponse, carte ecartee, victoire...
// Aucun son dans cette mission (decision de l'utilisateur) : on emet seulement un evenement
// `qe:<nom>` sur window, qu'un futur module (son, statistiques) pourra ecouter.
export function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('qe:' + name, { detail }));
}
