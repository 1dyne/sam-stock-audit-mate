// 셈 앱 시작점: 저장소 읽기 → 주소(#/...)에 맞는 화면 그리기.
import { S, load, db, toast, placeToast } from './core.js';
import * as stone from './stone.js';
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
  ['count', home.home], // 예전 주소: 이제 홈에서 바로 고른다
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
// 이 앱 안에서 지나온 화면들. 뒤로 가기는 여기서 바로 앞 화면으로 돌아간다(정해 둔 주소로 건너뛰지 않음)
const trail = [];
let replacing = false;

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
  // 시작을 마친 뒤 시스템 뒤로 가기로 처음 시작 화면에 다시 들어가지 않게
  if (S.settings.onboarded && path.startsWith('start')) { replacing = true; location.replace('#/'); return; }
  const m = match(path) || match('');
  const seq = ++renderSeq;
  const next = await m.fn(m.params);
  if (seq !== renderSeq) return; // 그사이 다른 화면으로 넘어갔으면 버린다
  if (current?.unmount) { try { current.unmount(); } catch { /* */ } }
  current = next;
  root.innerHTML = current.html;
  // 다른 화면으로 옮길 때만 들어오는 움직임을 준다. 같은 화면을 다시 그릴 때(저울 상태·선택 바꿈)는 가만히 둔다
  const isNav = path !== lastPath;
  if (isNav) {
    root.firstElementChild?.classList.add('enter');
    if (replacing && trail.length) trail[trail.length - 1] = path;
    else if (trail.length > 1 && trail[trail.length - 2] === path) trail.pop();
    else trail.push(path);
    if (trail.length > 50) trail.splice(0, trail.length - 50);
  }
  replacing = false;
  lastPath = path;
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  if (current.mount) current.mount(root);
  placeToast();
  const h = root.querySelector('.q'); if (h) { h.setAttribute('tabindex', '-1'); }
  if (isNav) {
    const scr = root.firstElementChild;
    stone.enter(root, { drop: scr?.classList.contains('drop-in'), celebrate: scr?.classList.contains('cheer') });
  }
}
export function refresh() { return render(); }
/** 화면 옮기기. replace: 저장처럼 되돌아갈 필요 없는 화면(입력 폼 등)을 기록에서 바꿔치기 */
export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { render(); return; }
  if (replace) { replacing = true; location.replace(hash); } else location.hash = hash;
}
/** 바로 앞 화면으로. 앱 안에 앞 화면이 없으면(주소로 바로 들어온 경우) fallback 으로 */
export function back(fallback = '#/') {
  if (trail.length > 1) history.back();
  else { replacing = true; location.replace(fallback); }
}

// 위의 ‹ 버튼: 적힌 주소가 아니라 실제로 지나온 앞 화면으로 돌아간다
root.addEventListener('click', (e) => {
  const a = e.target.closest('a.back[href]');
  if (!a) return;
  e.preventDefault();
  back(a.getAttribute('href'));
});

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
  stone.startIdle();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  // 아이폰 7일 삭제를 줄이려고 저장소 유지를 요청
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
