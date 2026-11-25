// 품목 목록 · 품목 넣기/고치기 · 엑셀·CSV 불러오기
import { S, db, screen, say, btn, btn2, esc, fmt, toast, sheet, shareFile, pickFile, place, placeItems, method, saveRow, unitWeight } from '../core.js';
import { METHODS, deviceAdvice } from '../model.js';
import { parseCSV, parseXLSX, rowsToItems, itemTemplateCSV } from '../tabular.js';
import { itemHint, routeFor } from './home.js';
import { go, refresh } from '../app.js';

const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');

export function items() {
  const p = place();
  const list = placeItems().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  const n = deviceAdvice(list, S.settings.kinds);
  const advice = list.length ? `<div class="card small-lines">무게 ${n.weight} · 사진 ${n.photo} · 박스 ${n.box} · 직접 ${n.manual}${n.weight ? '<br><span class="hint">무게로 세는 품목은 사만다(재고 측정기)가 있으면 빨라요</span>' : ''}</div>` : '';
  const body = say(list.length ? `품목 ${fmt(list.length)}개` : '품목을 넣어 주세요', esc(S.catalogs.find((c) => c.id === p?.catalog_id)?.name || ''))
    + advice
    + (list.length ? `<section class="card list">${list.map((i) => `<a class="row" href="#/item/${i.id}"><span><b>${esc(i.name)}</b><small>${[i.code, itemHint(i)].filter(Boolean).map(esc).join(' · ')}</small></span><span class="dev">${METHODS[method(i)].label}</span></a>`).join('')}</section>` : '');
  return {
    html: screen({ title: '품목', back: false, body, actions: `<div class="b2 even">${btn('엑셀·CSV 불러오기', 'import', { sm: true })}${btn('새 품목', 'add', { primary: true, sm: true })}</div>`, tab: 'items' }),
    on: { import: importFlow, add: () => go('#/item/new') },
    mount() { if (qs().get('import')) { history.replaceState(null, '', '#/items'); importFlow(); } },
  };
}

async function importFlow() {
  const r = await sheet(`<p class="sheet-t">엑셀·CSV 불러오기</p><p class="hint">첫 줄에 열 이름이 있어야 해요. "품목" 열만 있어도 돼요. 코드·단위·세는 방법·개당 무게·입수량·최소 수량·장부 수량·보관 위치를 알아봐요.</p>`,
    [{ label: '양식 받기', value: 'tpl' }, { label: '파일 고르기', value: 'pick', primary: true }]);
  if (!r) return;
  if (r.value === 'tpl') { await shareFile('셈_품목_양식.csv', itemTemplateCSV(), 'text/csv'); return; }
  const file = await pickFile('.csv,.xlsx,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return;
  let rows;
  if (/\.xlsx$/i.test(file.name)) rows = await parseXLSX(await file.arrayBuffer());
  else rows = parseCSV(await file.text());
  const res = rowsToItems(rows);
  if (!res.items.length) { toast(res.errors[0]?.msg || '품목을 찾지 못했어요'); return; }
  const p = place();
  const existing = placeItems();
  const keyOf = (i) => (i.code ? 'c:' + i.code : 'n:' + i.name);
  const byKey = new Map(existing.map((i) => [keyOf(i), i]));
  const upd = res.items.filter((i) => byKey.has(keyOf(i))).length;
  const ok = await sheet(`<p class="sheet-t">${res.items.length}개 품목을 넣을까요?</p>
    <p class="hint">${upd ? `${upd}개는 이미 있어서 고쳐 넣어요. ` : ''}${res.errors.length ? `${res.errors.length}줄은 문제가 있어 건너뛰어요. ` : ''}${res.unknownHeaders.length ? `모르는 열: ${res.unknownHeaders.map(esc).join(', ')}` : ''}</p>
    <div class="card small-lines">${res.items.slice(0, 5).map((i) => `${esc(i.name)}${i.method ? ' · ' + METHODS[i.method].label : ''}`).join('<br>')}${res.items.length > 5 ? '<br>…' : ''}</div>`,
  [{ label: '취소', value: '' }, { label: '넣기', value: 'ok', primary: true }]);
  if (!ok) return;
  const rowsOut = res.items.map((i) => ({ ...(byKey.get(keyOf(i)) || {}), ...i, catalog_id: p.catalog_id }));
  const saved = await db.putMany('items', rowsOut);
  for (const s of saved) { const k = S.items.findIndex((x) => x.id === s.id); if (k >= 0) S.items[k] = s; else S.items.push(s); }
  // 개당 무게 열이 있으면 저장된 개당 무게로도 넣어 둔다
  for (const s of saved) if (Number(s.unit_g) > 0 && !unitWeight(s.id)) await saveRow('unit_weights', { item_id: s.id, grams: Number(s.unit_g), sample_n: 0, measured_at: Date.now(), source: 'import' });
  toast(`${saved.length}개 넣었어요`);
  refresh();
}

export function item({ id }) {
  const isNew = id === 'new';
  const orig = isNew ? { name: '', unit: '개', method: '' } : S.items.find((x) => x.id === id);
  if (!orig) return { html: screen({ title: '', back: '#/items', body: say('품목을 찾지 못했어요') }) };
  const then = qs().get('then');
  const f = (S.flow.it && S.flow.it.id === id) ? S.flow.it : (S.flow.it = { id, m: orig.method || (isNew ? '' : method(orig)), draft: { ...orig } });
  const it = f.draft;
  const mchip = (k) => `<button type="button" class="fchip${f.m === k ? ' on' : ''}" data-act="m" data-arg="${k}" aria-pressed="${f.m === k}">${METHODS[k].label}</button>`;
  const fld = (name, label, val, attrs = '') => `<label class="field">${label}<input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
  const u = !isNew && unitWeight(it.id);
  const body = say(isNew ? '어떤 품목인가요?' : esc(it.name))
    + `<form id="itf" class="card form" autocomplete="off">
      ${fld('name', '품목 이름', it.name, 'required placeholder="예: M3 볼트 8mm"')}
      <div class="field">세는 방법<div class="chips">${Object.keys(METHODS).map(mchip).join('')}</div></div>
      <div class="grid2">${fld('code', '코드 (선택)', it.code)}${fld('unit', '단위', it.unit || '개')}</div>
      ${f.m === 'box' ? fld('pack_qty', '박스당 개수', it.pack_qty, 'inputmode="numeric"') : ''}
      <div class="grid2">${fld('min_qty', '최소 수량 (선택)', it.min_qty, 'inputmode="numeric"')}${fld('ledger_qty', '장부 수량 (선택)', it.ledger_qty, 'inputmode="numeric"')}</div>
      ${fld('location', '보관 위치 (선택)', it.location)}
    </form>
    ${u ? `<div class="card">저장된 개당 무게 <b class="n">${fmt(u.grams, 3)} g</b> <span class="hint">· ${u.sample_n ? u.sample_n + '개로 잼' : '불러옴'}</span></div>` : ''}`;
  const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(/,/g, '')));
  async function save() {
    const fd = Object.fromEntries(new FormData(document.getElementById('itf')));
    if (!fd.name.trim()) { toast('품목 이름을 넣어 주세요'); return null; }
    const row = { ...orig, name: fd.name.trim(), code: fd.code.trim(), unit: fd.unit.trim() || '개', method: f.m || null, min_qty: num(fd.min_qty), ledger_qty: num(fd.ledger_qty), location: fd.location.trim(), catalog_id: orig.catalog_id || place().catalog_id };
    if ('pack_qty' in fd) row.pack_qty = num(fd.pack_qty);
    S.flow.it = null;
    return saveRow('items', row);
  }
  return {
    html: screen({ title: isNew ? '새 품목' : '품목', back: then === 'count' ? '#/count' : '#/items', body,
      actions: then === 'count' ? btn('넣고 바로 세기', 'savecount', { primary: true }) : btn2(btn(isNew ? '넣고 세기' : '세기', 'savecount', { sm: true }), btn('저장', 'save', { primary: true, sm: true })) + (isNew ? '' : btn('품목 지우기', 'del', { sm: true })) }),
    on: {
      m(k) { const fd = Object.fromEntries(new FormData(document.getElementById('itf'))); Object.assign(it, fd); f.m = k; refresh(); },
      async save() { const r = await save(); if (r) { toast('저장했어요'); go('#/items'); } },
      async savecount() { const r = await save(); if (r) go(routeFor(r)); },
      async del() {
        const ok = await sheet(`<p class="sheet-t">${esc(it.name)}을(를) 지울까요?</p><p class="hint">센 기록은 남아요.</p>`, [{ label: '취소', value: '' }, { label: '지우기', value: 'yes' }]);
        if (!ok) return;
        await saveRow('items', { ...orig, deleted: 1 }); S.items = S.items.filter((x) => !x.deleted); go('#/items');
      },
    },
  };
}
