// Mesure d'audience de GameHub — un seul envoi par chargement de page, sans cookie ni stockage.
// Envoie le chemin de la page (sans query ni hash) et le nom de domaine du site d'origine,
// rien d'autre : ni pseudo, ni code de partie, ni identifiant. Détails : docs/AUDIENCE.md.
// Opposition : Do Not Track, Global Privacy Control, ou la case de /confidentialite.
(function () {
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    if (localStorage.getItem('gh-stats-optout') === '1') return;
  } catch (_) { /* stockage bloqué : on mesure quand même, sans rien lire */ }
  if (!/^(www\.)?roulia\.me$/.test(location.hostname)) return;   // jamais en local ni sur un autre domaine
  var ref = '';
  try { if (document.referrer) { var h = new URL(document.referrer).hostname; ref = h === location.hostname ? '-' : h; } } catch (_) {}
  var body = JSON.stringify(ref ? { p: location.pathname, r: ref } : { p: location.pathname });
  try { navigator.sendBeacon('/_stats/e', new Blob([body], { type: 'text/plain' })); } catch (_) {}
})();
