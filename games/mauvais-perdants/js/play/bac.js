// Petit Bac : la lettre, quatre champs. Aide immédiate sur la première lettre (même
// règle que le correcteur : article et accents ignorés). « J'ai fini » verrouille.

import { h } from '../ui/dom.js';
import { cleanAnswer, firstLetter, fold, ANSWER_MAX } from '../text.js';

export default function mount(root, { p, progress, finished }) {
  const letter = fold(p.letter);
  const fields = p.cats.map(cat => {
    const warn = h('em');
    const input = h('input', { class: 'inp', maxlength: String(ANSWER_MAX), autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'next', 'aria-label': cat });
    const label = h('label', {}, h('span', {}, cat, warn), input);
    input.addEventListener('input', () => {
      const v = cleanAnswer(input.value);
      const bad = v && firstLetter(v) !== letter;
      warn.textContent = bad ? `doit commencer par ${p.letter}` : '';
      input.classList.toggle('bad', !!bad);
      progress(fields.filter(f => cleanAnswer(f.input.value) && firstLetter(cleanAnswer(f.input.value)) === letter).length);
    });
    return { input, label };
  });
  fields.forEach((f, k) => f.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); (fields[k + 1] ? fields[k + 1].input : done).focus(); }
  }));
  const done = h('button', { class: 'btn btn-main btn-xl', type: 'button', text: 'J’ai fini' });
  root.append(
    h('div', { class: 'bac-head' }, h('div', { class: 'letter', text: p.letter, 'aria-label': `Lettre ${p.letter}` }), h('p', {}, 'Un mot par case, qui commence par ', h('b', { text: p.letter }), '. Les articles (le, la, l’…) ne comptent pas.')),
    h('div', { class: 'bac-fields' }, fields.map(f => f.label)),
    done,
  );
  const payload = () => ({ a: fields.map(f => cleanAnswer(f.input.value)) });
  // Les réponses ne partent pas tout de suite : envoyées avant la fin, elles seraient lisibles
  // par les autres joueurs pendant qu'ils écrivent encore. Elles partent quand tout le monde
  // a fini, ou à l'échéance.
  let locked = false;
  done.addEventListener('click', () => {
    if (locked) return;
    locked = true;
    fields.forEach(f => { f.input.readOnly = true; });
    done.disabled = true;
    done.textContent = 'Grille verrouillée. On attend les autres…';
    finished();
  });
  setTimeout(() => fields[0].input.focus(), 50);
  return { partial: payload, destroy() {} };
}
