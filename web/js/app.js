// 셈 앱 시작점: 저장소 읽기 → 주소(#/...)에 맞는 화면 그리기.
import { S, load, db, toast } from './core.js';
import * as onboard from './views/onboard.js';
import * as home from './views/home.js';
import * as weigh from './views/weigh.js';
import * as count from './views/count.js';
import * as fill from './views/fill.js';
import * as results from './views/results.js';
import * as items from './views/items.js';
import * as settings from './views/settings.js';

const ROUTES = [
  ['start/:step', onboard.start],
  ['', home.home],
  ['count', home.pick],
  ['weigh/:id', weigh.weigh],
  ['photo/:id', count.photo],
  ['box/:id', count.box],
  ['manual/:id', count.manual],
  ['saved/:id', count.saved],
  ['fill', fill.fillPick],
  ['fill/:id', fill.fill],
  ['results', results.results],
  ['record/:id', results.record],
  ['export', results.exportView],
  ['items', items.items],
  ['item/:id', items.item],
  ['settings', settings.settings],
  ['connect', settings.connect],
  ['places', settings.places],
];

const root = document.getElementById('app');
let current = null;
let renderSeq = 0;
let lastPath = null;

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pat, fn] of ROUTES) {
    const pp = pat.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i]))) return { fn, params };
  }
  return null;
}

export async function render() {
  if (!S.settings) return; // 아직 저장소를 읽는 중
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (!S.settings.onboarded && !path.startsWith('start')) { location.replace('#/start/0'); return; }
  const m = match(path) || match('');
  const seq = ++renderSeq;
  const next = await m.fn(m.params);
  if (seq !== renderSeq) return; // 그사이 다른 화면으로 넘어갔으면 버린다
  if (current?.unmount) { try { current.unmount(); } catch { /* */ } }
  current = next;
  root.innerHTML = current.html;
  // 다른 화면으로 옮길 때만 들어오는 움직임을 준다. 같은 화면을 다시 그릴 때(저울 상태·선택 바꿈)는 가만히 둔다
  if (path !== lastPath) root.firstElementChild?.classList.add('enter');
  lastPath = path;
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  if (current.mount) current.mount(root);
  const h = root.querySelector('.q'); if (h) { h.setAttribute('tabindex', '-1'); }
}
export function refresh() { return render(); }
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

root.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || !current?.on) return;
  const fn = current.on[t.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (t.disabled) return;
  try { await fn(t.dataset.arg, t, e); } catch (err) { console.error(err); toast(err.message || String(err)); }
});

window.addEventListener('hashchange', render);
db.events.addEventListener('remote', async () => { await load(); render(); });

(async () => {
  await load();
  window.__sem = { S, go, render };
  await render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  // 아이폰 7일 삭제를 줄이려고 저장소 유지를 요청
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
