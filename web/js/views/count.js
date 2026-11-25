// 사진 · 박스 · 직접 세기, 저장 확인
import { S, db, screen, say, btn, btn2, esc, fmt, toast, itemById, photoProfile, saveRecord, saveRow, recordsOfBatch, F, chip, av } from '../core.js';
import { recordStatus, previousRecord, photoAccuracy, stackedBlobs, countFromBoxes, METHODS } from '../model.js';
import { BuiltinEngine, loadPhoto } from '../photo-engine.js';
import { go, back, refresh } from '../app.js';

let engine;

// ---------- 사진 ----------
export function photo({ id }) {
  const it = itemById(id);
  if (!it) return { html: screen({ title: '품목 없음', back: '#/', body: say('품목을 찾지 못했어요') }) };
  const prof = photoProfile(id);
  const f = (S.flow.p && S.flow.p.itemId === id) ? S.flow.p : (S.flow.p = { itemId: id, stage: 'shoot', marks: [], ai: null, added: 0, removed: 0, exemplar: null, tool: 'add' });
  const acc = prof && photoAccuracy(prof.runs);

  if (f.stage === 'shoot') {
    const body = say('위에서 찍어 주세요', '붙어 있어도 괜찮아요. 쌓인 건 못 세요')
      + `<div class="cam-guide"><div class="frame"></div><ul><li>위에서 똑바로</li><li>밝은 곳, 그림자 없이</li><li>바탕과 색이 다르게</li></ul></div>`
      + (prof ? `<div class="card">${acc != null ? `이 품목 사진 정확도 <b>${Math.round(acc * 100)}%</b> · ` : ''}기억한 설정으로 바로 셀게요</div>` : '<div class="card hint">처음이라 찍은 뒤 물건 하나를 손가락으로 둘러 알려 주세요.</div>');
    return {
      html: screen({ title: esc(it.name), back: '#/', right: '사진', body, actions: `<label class="shutter" aria-label="사진 찍기"><input type="file" accept="image/*" capture="environment" id="cam" hidden></label><p class="hint center">앨범에서 고르려면 눌러서 선택하세요</p>` }),
      mount(root) {
        root.querySelector('#cam').addEventListener('change', async (e) => {
          const file = e.target.files[0]; if (!file) return;
          const p = await loadPhoto(file);
          Object.assign(f, { stage: 'review', bitmap: p.bitmap, image: p.image, w: p.width, h: p.height, thumb: p.thumb, marks: [], ai: null, added: 0, removed: 0, exemplar: null });
          if (prof && prof.size_frac) {
            const r = (prof.size_frac * Math.max(p.width, p.height)) / 2;
            f.exemplarR = r;
            refresh().then(() => detect(f, { objectSize: r * 2, sensitivity: prof.sensitivity || 0, mode: prof.mode || 'auto' }));
          } else { f.tool = 'box'; refresh(); }
        });
      },
    };
  }

  // review
  const stacked = f.ai != null ? stackedBlobs(f.objects || [], f.exemplarR) : 0;
  const n = f.marks.length;
  let line;
  if (f.ai == null && f.tool === 'box') line = say('물건 하나를 둘러 주세요', '손가락으로 사진 속 물건 하나에 네모를 그려요');
  else if (f.ai == null) line = say('세는 중이에요…');
  else if (stacked >= 3) line = say('쌓인 곳이 있어요', `한 덩어리가 낱개보다 6배 넘게 큰 곳이 ${stacked}군데예요. 사진으로는 정확하지 않아요`);
  else line = say(`${fmt(n)}개 찾았어요`, '빠진 건 누르고, 잘못 센 건 다시 눌러 지워 주세요');
  const tools = f.ai != null ? `<div class="seg" role="group" aria-label="고치기 도구">${[['add', '빠진 것 더하기'], ['remove', '잘못 센 것 지우기'], ['box', '샘플 다시']].map(([k, l]) => `<button type="button" class="${f.tool === k ? 'on' : ''}" data-act="tool" data-arg="${k}" aria-pressed="${f.tool === k}">${l}</button>`).join('')}</div>` : '';
  const sens = f.ai != null ? `<label class="field slim">민감도 <input type="range" min="-60" max="60" step="10" value="${f.sens || 0}" id="sens"></label>` : '';
  const body = line + `<div class="photo"><canvas id="cv" width="${f.w}" height="${f.h}"></canvas></div>` + tools + sens
    + (f.ai != null ? `<p class="hint">셈이 찾음 ${fmt(f.ai)} · 사람이 고침 +${f.added} −${f.removed} · 이 휴대폰 안에서만 셌어요(OpenTally)</p>` : '')
    + (stacked >= 3 ? `<div class="card media">${av('sam', 'off', 40)}<span><b>다음부터 무게로 셀까요?</b><small class="hint">품목의 세는 방법이 "무게"로 바뀌어요</small></span></div>` : '');
  const actions = stacked >= 3
    ? btn2(btn('그래도 저장', 'save', { sm: true }), btn('무게로 세기', 'toweight', { primary: true, sm: true }))
    : btn2(btn('다시 찍기', 'retake', { sm: true }), btn(f.ai != null ? `${fmt(n)}개 저장` : '저장', 'save', { primary: true, sm: true, disabled: f.ai == null }));

  return {
    html: screen({ title: esc(it.name), back: null, right: '사진', body, actions }),
    mount(root) {
      const cv = root.querySelector('#cv');
      draw(cv, f);
      let drag = null;
      const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; };
      cv.addEventListener('pointerdown', (e) => {
        const p = pt(e);
        if (f.tool === 'box') { drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 }; cv.setPointerCapture(e.pointerId); return; }
        if (f.ai == null) return;
        if (f.tool === 'add') { f.marks.push({ x: p.x, y: p.y, r: f.exemplarR || 12, src: 'human' }); f.added++; }
        else {
          let best = -1, bd = Infinity;
          f.marks.forEach((m, i) => { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = i; } });
          if (best >= 0 && bd <= Math.max(24, (f.marks[best].r || 10) * 1.3)) { const m = f.marks.splice(best, 1)[0]; if (m.src === 'human') f.added--; else f.removed++; }
        }
        refresh();
      });
      cv.addEventListener('pointermove', (e) => { if (!drag) return; const p = pt(e); drag.x = Math.min(drag.x0, p.x); drag.y = Math.min(drag.y0, p.y); drag.w = Math.abs(p.x - drag.x0); drag.h = Math.abs(p.y - drag.y0); draw(cv, f, drag); });
      cv.addEventListener('pointerup', () => {
        if (!drag) return;
        const d = drag; drag = null;
        if (d.w > 6 && d.h > 6) { f.exemplar = { x: d.x, y: d.y, w: d.w, h: d.h }; f.exemplarR = Math.min(d.w, d.h) / 2; f.tool = 'add'; f.ai = null; refresh().then(() => detect(f, { exemplar: f.exemplar, sensitivity: f.sens || 0 })); }
        else draw(cv, f);
      });
      const s = root.querySelector('#sens');
      if (s) s.addEventListener('change', () => { f.sens = Number(s.value); detect(f, f.exemplar ? { exemplar: f.exemplar, sensitivity: f.sens } : { objectSize: f.exemplarR * 2, sensitivity: f.sens }); });
    },
    on: {
      tool(k) { f.tool = k; refresh(); },
      retake() { S.flow.p = null; refresh(); },
      async toweight() { await saveRow('items', { ...it, method: 'weight' }); S.flow.p = null; toast('다음부터 무게로 셀게요'); go(`#/weigh/${id}`); },
      async save() {
        const final = f.marks.length;
        const runs = [...(prof?.runs || []), { at: Date.now(), ai: f.ai, final, added: f.added, removed: f.removed }].slice(-10);
        await saveRow('photo_profiles', { ...(prof || {}), item_id: id, size_frac: (f.exemplarR * 2) / Math.max(f.w, f.h), sensitivity: f.sens || 0, mode: f.polarity === 'color' ? 'color' : 'auto', runs });
        const ph = await db.put('photos', { thumb: f.thumb, at: Date.now() });
        const stacked2 = stackedBlobs(f.objects || [], f.exemplarR);
        const rec = await saveRecord({ item_id: id, qty: final, method: 'photo', err: null, quality: stacked2 >= 3 ? 'recount' : null,
          detail: { photo_id: ph.id, ai: f.ai, added: f.added, removed: f.removed, engine: 'OpenTally builtin' } });
        S.flow.p = null;
        go(`#/saved/${rec.id}`, { replace: true });
      },
    },
  };
}

async function detect(f, opts) {
  engine ||= new BuiltinEngine();
  try {
    const res = await engine.count(f.image, opts.exemplar || null, opts);
    f.objects = res.objects; f.ai = res.count; f.added = 0; f.removed = 0;
    f.marks = res.objects.map((o) => ({ x: o.x, y: o.y, r: o.r, src: 'ai' }));
  } catch (e) { toast('세지 못했어요: ' + e.message); f.ai = 0; f.marks = []; }
  refresh();
}

function draw(cv, f, drag) {
  const c = cv.getContext('2d');
  c.drawImage(f.bitmap, 0, 0, cv.width, cv.height);
  const r0 = Math.max(5, Math.min(cv.width, cv.height) / 90);
  for (const m of f.marks) {
    c.beginPath(); c.arc(m.x, m.y, r0, 0, Math.PI * 2);
    c.fillStyle = m.src === 'human' ? '#2357c6' : '#157a3e'; c.fill();
    c.lineWidth = r0 / 2.5; c.strokeStyle = '#fff'; c.stroke();
  }
  const b = drag || f.exemplar;
  if (b) { c.lineWidth = r0 / 2; c.strokeStyle = '#ffffff'; c.setLineDash([r0, r0 / 1.5]); c.strokeRect(b.x, b.y, b.w, b.h); c.setLineDash([]); }
}

// ---------- 박스 ----------
export function box({ id }) {
  const it = itemById(id);
  if (!it) return { html: screen({ title: '품목 없음', back: '#/', body: say('품목을 찾지 못했어요') }) };
  const b = (S.flow.b && S.flow.b.itemId === id) ? S.flow.b : (S.flow.b = { itemId: id, front: 0, depth: 1, layers: 1, loose: 0, pack: Number(it.pack_qty) || 0 });
  const unit = esc(it.unit || '개');
  const ctl = (k, label, small) => `<div class="step"><span><b>${label}</b><small>${small}</small></span><span class="ctl"><button type="button" data-act="d" data-arg="${k}:-1" aria-label="${label} 줄이기">−</button><b>${b[k]}</b><button type="button" data-act="d" data-arg="${k}:1" aria-label="${label} 늘리기">+</button></span></div>`;
  const r = countFromBoxes({ front: b.front, depth: b.depth, layers: b.layers, packQty: b.pack || 1, loose: b.loose });
  const body = say('박스가 몇 개인가요?', b.pack ? `박스당 ${fmt(b.pack)}${unit}로 계산해요` : '먼저 박스당 개수를 정해 주세요')
    + ctl('pack', '박스당', unit) + ctl('front', '앞줄', '정면에서 보이는 박스') + ctl('depth', '안쪽 줄', '앞에서 뒤로') + ctl('layers', '층', '위로 쌓은 수') + ctl('loose', '뜯은 박스 낱개', unit)
    + `<div class="count"><div class="big mid2">${fmt(r.total)}<span class="u">${unit}</span></div><div class="pm">${b.front} × ${b.depth} × ${b.layers} = ${r.boxes}박스 × ${b.pack || 0} + ${b.loose}</div></div>`;
  return {
    html: screen({ title: esc(it.name), back: '#/', right: '박스', body, actions: btn(`${fmt(r.total)}${unit} 저장`, 'save', { primary: true, disabled: !b.pack }) }),
    on: {
      d(arg) { const [k, d] = arg.split(':'); const min = k === 'depth' || k === 'layers' ? 1 : 0; b[k] = Math.max(min, b[k] + Number(d)); refresh(); },
      async save() {
        if (b.pack && Number(it.pack_qty) !== b.pack) await saveRow('items', { ...it, pack_qty: b.pack });
        const rec = await saveRecord({ item_id: id, qty: r.total, method: 'box', err: null, detail: { front: b.front, depth: b.depth, layers: b.layers, pack: b.pack, loose: b.loose } });
        S.flow.b = null; go(`#/saved/${rec.id}`, { replace: true });
      },
    },
  };
}

// ---------- 직접 ----------
export function manual({ id }) {
  const it = itemById(id);
  if (!it) return { html: screen({ title: '품목 없음', back: '#/', body: say('품목을 찾지 못했어요') }) };
  const m = (S.flow.m && S.flow.m.itemId === id) ? S.flow.m : (S.flow.m = { itemId: id, v: '' });
  const prev = previousRecord(S.records, { item_id: id, place_id: S.place_id, batch_id: '__now', counted_at: Date.now() + 1 });
  const unit = esc(it.unit || '개');
  const v = m.v === '' ? 0 : Number(m.v);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'none'];
  const body = say('몇 개인가요?')
    + `<div class="count"><div class="big">${fmt(v)}<span class="u">${unit}</span></div><div class="pm">${prev ? `지난번 ${fmt(prev.qty)}${unit}` : ''}</div></div>`
    + `<div class="b2 even">${btn('− 1', 'k', { arg: 'm1' })}${btn('+ 1', 'k', { arg: 'p1' })}</div>`
    + `<div class="pad">${keys.map((k) => `<button type="button" data-act="k" data-arg="${k}" class="${k.length > 1 ? 'word' : ''}">${k === 'del' ? '지움' : k === 'none' ? '없음' : k}</button>`).join('')}</div>`;
  return {
    html: screen({ title: esc(it.name), back: '#/', right: '직접', body, actions: btn(`${fmt(v)}${unit} 저장`, 'save', { primary: true }) }),
    on: {
      k(k) {
        if (k === 'p1') m.v = String(v + 1);
        else if (k === 'm1') m.v = String(Math.max(0, v - 1));
        else if (k === 'del') m.v = m.v.slice(0, -1);
        else if (k === 'none') m.v = '0';
        else m.v = (m.v === '0' ? '' : m.v) + k;
        if (m.v.length > 7) m.v = m.v.slice(0, 7);
        refresh();
      },
      async save() { const rec = await saveRecord({ item_id: id, qty: v, method: 'manual', err: null, detail: {} }); S.flow.m = null; go(`#/saved/${rec.id}`, { replace: true }); },
    },
  };
}

// ---------- 저장했어요 ----------
export function saved({ id }) {
  const r = S.records.find((x) => x.id === id);
  if (!r) return { html: screen({ title: '', back: '#/', body: say('기록을 찾지 못했어요') }) };
  const it = itemById(r.item_id) || {};
  const b = S.batches.find((x) => x.id === r.batch_id);
  const prev = previousRecord(S.records, r);
  const st = recordStatus(r, it, prev, F());
  const unit = esc(it.unit || '개');
  const rows = [];
  if (F().compare_last) rows.push(prev ? `<div class="row"><span><b>지난번 (${new Date(prev.counted_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})</b><small>${Math.round((r.counted_at - prev.counted_at) / 86400000)}일 동안</small></span><span class="n strong">${fmt(prev.qty)} → <span class="${st.diff < 0 ? 'tchk' : ''}">${st.diff > 0 ? '+' : st.diff < 0 ? '−' : '±'}${fmt(Math.abs(st.diff))}</span></span></div>` : '<div class="row"><span><b>지난번</b><small>처음 센 품목이에요</small></span></div>');
  if (F().min_qty && Number(it.min_qty) > 0) rows.push(`<div class="row"><span><b>최소 수량</b><small>${fmt(it.min_qty)}${unit}</small></span>${r.qty < it.min_qty ? chip('주문 필요', 'chk') : chip('충분', 'ok')}</div>`);
  if (F().ledger && it.ledger_qty != null && it.ledger_qty !== '') rows.push(`<div class="row"><span><b>장부</b><small>${fmt(it.ledger_qty)}${unit}</small></span><span class="n strong">${r.qty - it.ledger_qty > 0 ? '+' : ''}${fmt(r.qty - it.ledger_qty)}</span></div>`);
  const q = st.flags.find((x) => x.key === 'recount' || x.key === 'check');
  const left = recordsOfBatch(r.batch_id).length;
  void left;
  return {
    html: screen({ title: '저장했어요', back: false, cls: 'cheer', body: say(`${esc(it.name || r.item_name)} ${fmt(r.qty)}${unit}`, `${esc(b?.label || '')} 기록에 저장했어요 · ${METHODS[r.method]?.by || ''} 셈${r.err ? ` · ±${r.err}개` : ''}`)
      + (q ? `<div class="card">${chip(q.label, q.tone)} ${q.key === 'check' ? '반 개쯤 남거나 모자랐어요. 섞인 게 없는지 확인해 주세요.' : '사진으로는 정확하지 않았어요. 다시 세 주세요.'}</div>` : '')
      + (rows.length ? `<section class="card list">${rows.join('')}</section>` : ''),
    actions: btn2(btn('고치기', 'edit', { sm: true }), btn('다른 재고 세기', 'next', { primary: true, sm: true })) }),
    on: { edit: () => go(`#/record/${r.id}`), next: () => back('#/') },
  };
}
