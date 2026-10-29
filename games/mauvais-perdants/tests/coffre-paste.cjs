// Le Coffre en solo : on ne peut ni copier le nombre affiché ni rien coller dans la case de réponse.
// Un seul navigateur, vraies règles chargées dans l'émulateur. Mêmes prérequis que solo.cjs.
//
//   node games/mauvais-perdants/tests/coffre-paste.cjs

const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');
const BASE = process.env.SA_URL || 'http://localhost:4174/games/mauvais-perdants/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.env.CDP_PORT = process.env.CDP_PORT || '9700';
const { Browser } = require(path.join(ROOT, 'tools', 'cdp.js'));
const results = [];

async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('OK   ', name); }
  catch (e) { results.push([false, name]); console.log('ECHEC', name, '|', e.message); }
}
async function waitFor(p, expr, ms = 20000, label = expr) {
  const end = Date.now() + ms;
  for (;;) {
    let v; try { v = await p.eval(expr); } catch (_) { v = null; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`délai dépassé : ${label}`);
    await sleep(200);
  }
}

(async () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'database.rules.phase2.json'), 'utf8');
  const put = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
  assert.ok(put.ok, 'règles chargées');
  const b = await Browser.launch({ headless: true, windowSize: '1280,820' });
  const p = await b.newPage('about:blank', 'coffre-paste');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await p.goto(`${BASE}?emu&ai=off`);
  await waitFor(p, 'return !!window.__mp;');
  // Une seule épreuve cochée : le Coffre (bit 6 → 2 + 64 = 66), puis duel contre Gonzague.
  await p.eval(`localStorage.setItem('mp-picks', '66'); document.querySelector('#name').value = 'Ana'; document.querySelector('#btn-solo').click(); return 1;`);

  await check('le nombre affiché ne se sélectionne ni ne se copie', async () => {
    await waitFor(p, `const b = document.querySelector('.bignum'); return b && /^[0-9]+$/.test(b.textContent);`, 60000, 'nombre affiché');
    const r = await p.eval(`const b = document.querySelector('.bignum');
      const sel = getComputedStyle(b).userSelect;
      const ev = new Event('copy', { bubbles: true, cancelable: true }); b.dispatchEvent(ev);
      const st = new Event('selectstart', { bubbles: true, cancelable: true }); b.dispatchEvent(st);
      return { sel, copyBlocked: ev.defaultPrevented, selectBlocked: st.defaultPrevented };`);
    assert.equal(r.sel, 'none');
    assert.ok(r.copyBlocked && r.selectBlocked, JSON.stringify(r));
  });

  await check('rien ne se colle dans la case de réponse, seuls les chiffres se tapent', async () => {
    await waitFor(p, `const r = document.querySelector('.answer-row'); return r && r.style.visibility === 'visible';`, 30000, 'case de réponse');
    const r = await p.eval(`const i = document.querySelector('.answer-row input');
      i.focus();
      const dt = new DataTransfer(); dt.setData('text', '123456');
      const paste = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); i.dispatchEvent(paste);
      const drop = new Event('drop', { bubbles: true, cancelable: true }); i.dispatchEvent(drop);
      const ctx = new Event('contextmenu', { bubbles: true, cancelable: true }); i.dispatchEvent(ctx);
      const key = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }); i.dispatchEvent(key);
      i.value = 'ab12c3'; i.dispatchEvent(new Event('input', { bubbles: true }));
      return { paste: paste.defaultPrevented, drop: drop.defaultPrevented, ctx: ctx.defaultPrevented, ctrlV: key.defaultPrevented, value: i.value };`);
    assert.ok(r.paste && r.drop && r.ctx && r.ctrlV, JSON.stringify(r));
    assert.equal(r.value, '123', 'les lettres sont retirées');
  });

  await b.close().catch(() => {});
  const ok = results.filter(r => r[0]).length;
  console.log(`\n===== COFFRE ANTI-COLLAGE : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(async e => { console.error(e); process.exit(1); });
