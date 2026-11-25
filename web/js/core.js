// 앱 상태 + 화면 공통 부품. 화면(views)은 여기만 가져다 쓴다.
import * as db from './db.js';
import { dayKey, dayLabel, defaultFeatures, methodFor, latestPerItem } from './model.js';

export { db };

export const S = {
  settings: null, // { kinds:[], features:{}, onboarded:bool }
  place_id: null,
  places: [], catalogs: [], items: [], unit_weights: [], containers: [], photo_profiles: [],
  batches: [], records: [], record_edits: [], fills: [],
  scale: null,
  flow: {},
};

export async function load() {
  for (const t of db.TABLES) if (t !== 'photos') S[t] = await db.all(t);
  S.settings = (await db.getMeta('settings')) || { kinds: [], features: defaultFeatures([]), onboarded: false };
  S.place_id = (await db.getMeta('place_id')) || S.places[0]?.id || null;
  if (S.place_id && !S.places.some((p) => p.id === S.place_id)) S.place_id = S.places[0]?.id || null;
}

export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.setMeta('settings', S.settings);
}
export async function setPlace(id) { S.place_id = id; await db.setMeta('place_id', id); }

export const F = () => S.settings?.features || {};
export const place = () => S.places.find((p) => p.id === S.place_id) || null;
export const itemById = (id) => S.items.find((i) => i.id === id);
export const placeItems = () => { const p = place(); return p ? S.items.filter((i) => i.catalog_id === p.catalog_id) : []; };
export const method = (it) => methodFor(it, S.settings?.kinds || []);

/** 품목의 최신 개당 무게 */
export function unitWeight(itemId) {
  let best = null;
  for (const u of S.unit_weights) if (u.item_id === itemId && (!best || u.measured_at > best.measured_at)) best = u;
  return best;
}
export function photoProfile(itemId) { return S.photo_profiles.find((p) => p.item_id === itemId) || null; }

/** 지금 쓰는 묶음. 날짜별 묶기를 켜면 날짜가 바뀔 때 새로 만든다 */
export async function currentBatch() {
  const p = place();
  if (!p) return null;
  const daily = F().daily_batch;
  const key = daily ? dayKey(Date.now()) : 'all';
  let b = S.batches.find((x) => x.place_id === p.id && x.key === key);
  if (!b) {
    b = await db.put('batches', { place_id: p.id, key, label: daily ? dayLabel(key) : '전체', started_at: Date.now() });
    S.batches.push(b);
  }
  return b;
}
export function batchesOfPlace() {
  return S.batches.filter((b) => b.place_id === S.place_id).sort((a, b) => b.started_at - a.started_at);
}
export function recordsOfBatch(batchId) {
  return latestPerItem(S.records.filter((r) => r.batch_id === batchId));
}

export async function saveRecord(rec) {
  const b = await currentBatch();
  const it = itemById(rec.item_id);
  const r = await db.put('records', { place_id: S.place_id, batch_id: b.id, item_name: it?.name || '', counted_at: Date.now(), device_id: await deviceId(), ...rec });
  S.records.push(r);
  return r;
}
export async function saveRow(table, row) {
  const r = await db.put(table, row);
  const i = S[table].findIndex((x) => x.id === r.id);
  if (i >= 0) S[table][i] = r; else S[table].push(r);
  return r;
}

let _dev;
export async function deviceId() {
  if (_dev) return _dev;
  _dev = await db.getMeta('device_id');
  if (!_dev) { _dev = 'd-' + db.uid(); await db.setMeta('device_id', _dev); }
  return _dev;
}

// ---------- 화면 부품 ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 0) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '–' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtG = (g) => fmt(g, 1);
export const signed = (n) => (n == null || n === '' ? '' : (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n)));
export const clock = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
export const dateTime = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

let blinkSeed = 0;
/** 캐릭터: 미리 렌더한 두 장(뜬 눈·감은 눈)을 겹쳐 깜빡인다 */
export function av(who = 'sem', eye = 'off', size = 52, cls = '') {
  const d = ((blinkSeed++ * 1.37) % 3).toFixed(2);
  const p = (4.2 + ((blinkSeed * 0.71) % 1.6)).toFixed(2);
  const open = who === 'sem' ? 'sem' : 'sam-' + eye;
  const shut = who === 'sem' ? 'sem-blink' : 'sam-blink';
  const alt = who === 'sem' ? '셈' : '사만다';
  return `<span class="av ${cls}" data-who="${who}"${cls.includes('live') ? ' data-live' : ''} style="width:${size}px;--d:${d}s;--p:${p}s"><img src="chars/${open}.webp" alt="${alt}" width="${size}" height="${size}"><img class="shut" src="chars/${shut}.webp" alt="" width="${size}" height="${size}"></span>`;
}
/** 셈(또는 사만다)의 한 마디 = 화면의 질문 */
export function say(text, small = '', who = 'sem', eye = 'off', live = false) {
  return `<div class="say">${av(who, eye, 52, live ? 'live' : '')}<div class="q" role="heading" aria-level="1">${text}${small ? `<small>${small}</small>` : ''}</div></div>`;
}
export function sayBig(text, small = '') {
  return `<div class="say big">${av('sem', 'off', 150)}<div class="q" role="heading" aria-level="1">${text}${small ? `<small>${small}</small>` : ''}</div></div>`;
}

/** 화면 틀 */
const TAB_ICONS = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  results: '<path d="M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17"/>',
  items: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
  settings: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
};
/** 화면 틀. back = 돌아갈 주소(앞 화면이 없을 때만 씀), backAct = 주소 대신 화면 안 단계를 되돌리는 동작 이름 */
export function screen({ title = '', back = null, backAct = '', step = null, right = '', body = '', actions = '', tab = null, cls = '' }) {
  const top = (back !== false || title || right) ? `<header class="top">
      ${backAct ? `<button type="button" class="back" data-act="${backAct}" aria-label="앞 단계로">‹</button>` : back ? `<a class="back" href="${back}" aria-label="뒤로">‹</a>` : '<span class="back"></span>'}
      <span class="t">${title}</span><span class="r">${right}</span></header>` : '';
  const prog = step ? `<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${step[1]}" aria-valuenow="${step[0]}"><i style="width:${(step[0] / step[1]) * 100}%"></i></div>` : '';
  const tabs = tab ? `<nav class="tabbar">${[['#/', '홈', 'home'], ['#/results', '결과', 'results'], ['#/items', '품목', 'items'], ['#/settings', '설정', 'settings']]
    .map(([h, l, k]) => `<a href="${h}" class="${k === tab ? 'on' : ''}"${k === tab ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[k]}</svg>${l}</a>`).join('')}</nav>` : '';
  return `<div class="scr ${cls}">${top}${prog}<main class="v">${body}</main>${actions || tabs ? `<div class="foot">${actions ? `<footer class="th">${actions}</footer>` : ''}${tabs}</div>` : ''}</div>`;
}

export const btn = (label, act, { primary = false, sm = false, arg = '', disabled = false, id = '' } = {}) =>
  `<button type="button" class="b${primary ? ' p' : ''}${sm ? ' sm' : ''}" data-act="${act}"${arg !== '' ? ` data-arg="${esc(arg)}"` : ''}${disabled ? ' disabled' : ''}${id ? ` id="${id}"` : ''}>${label}</button>`;
export const btn2 = (a, b) => `<div class="b2">${a}${b}</div>`;
export const chip = (label, tone = 'ok') => `<span class="chip ${tone}">${esc(label)}</span>`;
export const dev = (label) => `<span class="dev">${esc(label)}</span>`;

let toastEl = null;
let toastTimer = 0;
/** 짧은 알림. 한 번에 하나만, 아래 버튼을 가리지 않게 버튼 바로 위에 띄운다 */
export function toast(msg, ms = 2600) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);
  const el = toastEl = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  placeToast();
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, 170);
  }, ms);
}

/** 알림을 지금 화면의 아래 버튼 바로 위에 둔다(화면이 바뀌면 다시 부른다) */
export function placeToast() {
  if (!toastEl) return;
  const bar = document.querySelector('#app .th, #app .tabbar');
  const top = bar ? bar.getBoundingClientRect().top : window.innerHeight;
  toastEl.style.bottom = Math.max(16, window.innerHeight - top + 10) + 'px';
}

/** 아래에서 올라오는 확인 창. 고른 버튼의 value를 돌려준다 */
export function sheet(html, buttons) {
  return new Promise((res) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="dim" data-v=""></div><div class="sheet" role="dialog" aria-modal="true">${html}<div class="sheet-btns">${buttons.map((b) => `<button type="button" class="b${b.primary ? ' p' : ''}" data-v="${esc(b.value)}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    const first = wrap.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 50);
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('[data-v]');
      if (!t || wrap.classList.contains('out')) return;
      const v = t.dataset.v;
      const form = {};
      wrap.querySelectorAll('[name]').forEach((i) => { if (i.type === 'radio') { if (i.checked) form[i.name] = i.value; } else form[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 170);
      res(v === '' ? null : { value: v, form });
    });
  });
}

/** 파일 넘기기: 휴대폰은 공유 창, 안 되면 다운로드 */
export async function shareFile(name, data, mime) {
  const file = new File([data], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
export function pickFile(accept) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}
