// Dictée : un seul champ réellement saisi. Collage désactivé (annoncé : on tape).
// Le chrono part à la première frappe ; fin quand la phrase est exacte.

import { h } from '../ui/dom.js';
import { loose, correctPrefix } from '../rounds/dictee.js';

export default function mount(root, { p, submit, progress }) {
  const phrase = p.phrase;
  let t0 = 0, alive = true;
  const view = h('div', { class: 'phrase', 'aria-label': phrase });
  const input = h('textarea', { class: 'typer', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Ta saisie', placeholder: 'Tape ici…' });
  const stat = h('b', { text: '0 %' });
  root.append(h('div', { class: 'play-head' }, h('span', { text: 'Accents et majuscules facultatifs' }), h('span', {}, 'Progression ', stat)), view, input);
  function render() {
    const typed = input.value;
    const pre = correctPrefix(typed, phrase);
    const bad = loose(typed).length > pre;
    view.replaceChildren(
      h('span', { class: 'ok', text: phrase.slice(0, pre) }),
      bad ? h('span', { class: 'ko', text: phrase.slice(pre, pre + 1) || ' ' }) : h('span', { class: 'cur', text: phrase.slice(pre, pre + 1) }),
      h('span', { class: 'todo', text: phrase.slice(pre + 1) }),
    );
    const pct = Math.round(100 * pre / loose(phrase).length);
    stat.textContent = `${pct} %`;
    return pre;
  }
  input.addEventListener('paste', e => e.preventDefault());
  input.addEventListener('drop', e => e.preventDefault());
  input.addEventListener('input', () => {
    if (!alive) return;
    if (!t0) t0 = performance.now();
    if (input.value.length > 200) input.value = input.value.slice(0, 200);
    const pre = render();
    progress(pre);
    if (pre >= loose(phrase).length && loose(input.value).length === loose(phrase).length) {
      alive = false;
      input.disabled = true;
      submit({ typed: input.value, ms: Math.round(performance.now() - t0) });
    }
  });
  render();
  setTimeout(() => input.focus(), 50);
  return {
    partial: () => ({ typed: input.value, ms: t0 ? Math.round(performance.now() - t0) : 0 }),
    destroy() { alive = false; },
  };
}
