// 결과 · 기록 자세히 · 보내기
import { S, db, screen, say, btn, btn2, esc, fmt, fmtG, chip, toast, sheet, shareFile, itemById, batchesOfPlace, recordsOfBatch, placeItems, place, saveRow, dateTime, F, method } from '../core.js';
import { recordStatus, previousRecord, exportRows, METHODS } from '../model.js';
import { writeXLSX, toCSV, objectsToRows } from '../tabular.js';
import { routeFor } from './home.js';
import { go, refresh } from '../app.js';

const R = () => (S.flow.r ||= { batch: null, filter: 'all' });

export function results() {
  const bs = batchesOfPlace();
  const st = R();
  if (!st.batch || !bs.some((b) => b.id === st.batch)) st.batch = bs[0]?.id || null;
  const items = placeItems();
  const recs = st.batch ? recordsOfBatch(st.batch) : [];
  const byItem = new Map(recs.map((r) => [r.item_id, r]));
  const rows = recs.map((r) => ({ r, it: itemById(r.item_id) || { name: r.item_name }, s: recordStatus(r, itemById(r.item_id), previousRecord(S.records, r), F()) }));
  const order = { bad: 0, chk: 1, ok: 2 };
  rows.sort((a, b) => order[a.s.tone] - order[b.s.tone] || b.r.counted_at - a.r.counted_at);
  const notCounted = items.filter((i) => !byItem.has(i.id));
  const n = { all: items.length || rows.length, chk: rows.filter((x) => x.s.tone === 'chk').length, bad: rows.filter((x) => x.s.tone === 'bad').length, todo: notCounted.length };
  const fchip = (k, l) => `<button type="button" class="fchip${st.filter === k ? ' on' : ''}" data-act="filter" data-arg="${k}" aria-pressed="${st.filter === k}">${l}</button>`;
  let list = '';
  if (st.filter === 'todo') list = notCounted.map((i) => `<a class="row" href="${routeFor(i)}"><span><b>${esc(i.name)}</b><small>아직 안 셈</small></span><span class="dev">${METHODS[method(i)].label}</span></a>`).join('');
  else list = rows.filter((x) => st.filter === 'all' || x.s.tone === st.filter).map(({ r, it, s }) => {
    const sub = [`${fmt(r.qty)}${esc(it.unit || '개')}`];
    if (s.key === 'order') sub.push(`최소 ${fmt(it.min_qty)}`);
    else if (s.diff != null) sub.push(`지난번보다 ${s.diff > 0 ? '+' : s.diff < 0 ? '−' : '±'}${fmt(Math.abs(s.diff))}`);
    return `<a class="row" href="#/record/${r.id}"><span><b>${esc(it.name)}</b><small>${sub.join(' · ')}</small></span>${chip(s.label, s.tone)}</a>`;
  }).join('');
  const body = (bs.length > 1 ? `<div class="chips scroll">${bs.slice(0, 12).map((b) => `<button type="button" class="fchip${b.id === st.batch ? ' on' : ''}" data-act="batch" data-arg="${b.id}">${esc(b.label)}</button>`).join('')}</div>` : '')
    + `<div class="chips">${fchip('all', `전체 ${n.all}`)}${fchip('chk', `확인 필요 ${n.chk}`)}${fchip('bad', `다시 세기 ${n.bad}`)}${fchip('todo', `안 셈 ${n.todo}`)}</div>`
    + (list ? `<section class="card list">${list}</section>` : `<p class="hint">${st.batch ? '여기에 해당하는 품목이 없어요' : '아직 센 기록이 없어요'}</p>`);
  return {
    html: screen({ title: '결과', back: false, right: st.batch ? '<a href="#/export">보내기</a>' : '', body, tab: 'results' }),
    on: { filter(k) { st.filter = k; refresh(); }, batch(id) { st.batch = id; refresh(); } },
  };
}

export function record({ id }) {
  const r = S.records.find((x) => x.id === id);
  if (!r) return { html: screen({ title: '', back: '#/results', body: say('기록을 찾지 못했어요') }) };
  const it = itemById(r.item_id) || { name: r.item_name };
  const unit = esc(it.unit || '개');
  const d = r.detail || {};
  const rows = [];
  if (r.method === 'weight') {
    rows.push(['개당 무게', `샘플 ${d.sample_n}개`, `${fmt(d.unit_g, 3)} g`]);
    if (d.tare) rows.push(['통', esc(S.containers.find((c) => c.id === d.container_id)?.name || ''), `${fmtG(d.tare)} g`]);
    rows.push(['올린 무게', d.source === 'manual' ? '직접 입력' : '사만다', `${fmtG(d.gross)} g`]);
  } else if (r.method === 'photo') rows.push(['사진', `셈이 찾음 ${fmt(d.ai)}`, `+${d.added || 0} −${d.removed || 0}`]);
  else if (r.method === 'box') rows.push(['박스', `${d.front}×${d.depth}×${d.layers} × ${d.pack}`, `+ ${d.loose}`]);
  if (it.location) rows.push(['보관 위치', '', esc(it.location)]);
  const edits = S.record_edits.filter((e) => e.record_id === r.id).sort((a, b) => a.at - b.at);
  const hist = [`${dateTime(r.counted_at)} ${fmt(r.orig_qty ?? (edits[0]?.from ?? r.qty))}${unit} 저장 (${METHODS[r.method]?.label || ''})`, ...edits.map((e) => `${dateTime(e.at)} ${fmt(e.from)} → ${fmt(e.to)} 고침${e.reason ? ` · "${esc(e.reason)}"` : ''}`)];
  const photo = d.photo_id ? `<div class="photo"><img id="ph" alt="센 사진"></div>` : '';
  const body = `<div class="count"><div class="big mid2">${fmt(r.qty)}<span class="u">${unit}</span></div><div class="pm">${esc(it.name)} · ${dateTime(r.counted_at)} · ${METHODS[r.method]?.label || ''}${r.err ? ` · ±${r.err}` : ''}${edits.length ? ` · 고침 ${edits.length}번` : ''}</div></div>`
    + (rows.length ? `<section class="card list">${rows.map(([a, b, c]) => `<div class="row"><span><b>${a}</b><small>${b}</small></span><span class="n">${c}</span></div>`).join('')}</section>` : '')
    + photo + `<div class="sec-h">기록</div><div class="card small-lines">${hist.join('<br>')}</div>`;
  return {
    html: screen({ title: esc(it.name), back: '#/results', body, actions: btn2(btn('고치기', 'edit', { sm: true }), btn('다시 세기', 'recount', { sm: true })) + btn('이 기록 지우기', 'del', { sm: true }) }),
    async mount(root) {
      if (d.photo_id) { const p = await db.get('photos', d.photo_id); const img = root.querySelector('#ph'); if (p && img) img.src = `data:${p.thumb.mime};base64,${p.thumb.data}`; }
    },
    on: {
      async edit() {
        const res = await sheet(`<p class="sheet-t">수량 고치기</p><label class="field">수량<input name="qty" inputmode="numeric" value="${r.qty}"></label><label class="field">고친 이유 (기록에 남아요)<input name="reason" placeholder="예: 4개 불량 빼냄"></label>`,
          [{ label: '취소', value: '' }, { label: '고치기', value: 'ok', primary: true }]);
        if (!res) return;
        const q = Number(String(res.form.qty).replace(/,/g, ''));
        if (!Number.isFinite(q) || q < 0) return toast('숫자를 넣어 주세요');
        if (q === r.qty) return;
        await saveRow('record_edits', { record_id: r.id, from: r.qty, to: q, reason: res.form.reason.trim(), at: Date.now() });
        await saveRow('records', { ...r, orig_qty: r.orig_qty ?? r.qty, qty: q, quality: null });
        toast('고쳤어요'); refresh();
      },
      recount() { go(routeFor(it.id ? it : { id: r.item_id, method: r.method })); },
      async del() {
        const ok = await sheet('<p class="sheet-t">이 기록을 지울까요?</p>', [{ label: '취소', value: '' }, { label: '지우기', value: 'yes' }]);
        if (!ok) return;
        await saveRow('records', { ...r, deleted: 1 });
        S.records = S.records.filter((x) => !x.deleted);
        go('#/results');
      },
    },
  };
}

export function exportView() {
  const st = R();
  const b = S.batches.find((x) => x.id === st.batch) || batchesOfPlace()[0];
  const e = (S.flow.e ||= { fmt: 'xlsx', scope: 'batch' });
  const recs = b ? recordsOfBatch(b.id) : [];
  const opt = (k, l, s) => `<button type="button" class="opt${e.fmt === k ? ' on' : ''}" data-act="fmt" data-arg="${k}" aria-pressed="${e.fmt === k}"><span><b>${l}</b><small>${s}</small></span><span class="ck">${e.fmt === k ? '✓' : ''}</span></button>`;
  const scope = `<div class="chips"><button type="button" class="fchip${e.scope === 'batch' ? ' on' : ''}" data-act="scope" data-arg="batch">${esc(b?.label || '')} 묶음</button><button type="button" class="fchip${e.scope === 'all' ? ' on' : ''}" data-act="scope" data-arg="all">이 세는 곳 전체</button></div>`;
  const body = say('어떤 파일로 보낼까요?', `${esc(place()?.name || '')} · ${e.scope === 'batch' ? `${esc(b?.label || '')} 묶음 · ${recs.length}개 품목` : '모든 묶음'}`)
    + scope + opt('xlsx', '엑셀 (.xlsx)', '엑셀·구글 시트·세무사') + opt('csv', 'CSV (.csv)', '다른 프로그램에 올리기') + opt('json', 'JSON (.json)', '개발자·Claude에게 분석 맡기기') + opt('copy', '표 복사', '시트·노션·슬랙에 붙여넣기');
  return {
    html: screen({ title: '보내기', back: '#/results', body, actions: btn(e.fmt === 'copy' ? '복사하기' : '보내기', 'send', { primary: true, disabled: !b }) }),
    on: {
      fmt(k) { e.fmt = k; refresh(); },
      scope(k) { e.scope = k; refresh(); },
      async send() {
        const records = S.records.filter((r) => r.place_id === S.place_id && (e.scope === 'all' || r.batch_id === b.id));
        const objs = exportRows({ records, items: S.items, places: S.places, batches: S.batches, features: F(), edits: S.record_edits });
        if (!objs.length) return toast('보낼 기록이 없어요');
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        const base = `셈_${(place()?.name || '재고').replace(/[\\/:*?"<>|\s]+/g, '')}_${stamp}`;
        const rows = objectsToRows(objs);
        let res;
        if (e.fmt === 'xlsx') res = await shareFile(base + '.xlsx', writeXLSX(rows, place()?.name || '셈'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        else if (e.fmt === 'csv') res = await shareFile(base + '.csv', toCSV(rows), 'text/csv');
        else if (e.fmt === 'json') {
          const full = records.filter((r) => !r.deleted).map((r) => ({ ...r, item: itemById(r.item_id) || null, _dirty: undefined }));
          res = await shareFile(base + '.json', JSON.stringify({ app: 'sem', place: place()?.name, exported_at: new Date().toISOString(), rows: objs, records: full }, null, 2), 'application/json');
        } else {
          const tsv = rows.map((r) => r.map((c) => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
          await navigator.clipboard.writeText(tsv); toast('표를 복사했어요. 붙여넣기 하세요.'); return;
        }
        if (res === 'downloaded') toast('파일을 내려받았어요');
      },
    },
  };
}
