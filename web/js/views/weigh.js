// 무게로 세기 (사만다): 통 무게 빼기 → N개 올리기 → 전부 올리기 → 저장
// 개수 = (올린 무게 − 통 무게) ÷ 개당 무게, 개당 무게 = 샘플 무게 ÷ 샘플 개수
import { S, screen, say, btn, btn2, esc, fmt, fmtG, toast, sheet, itemById, unitWeight, saveRecord, saveRow } from '../core.js';
import { countFromWeight, countError, sampleAdvice, unitFromSample, weightWarnings, WARN_TEXT, matchContainer } from '../model.js';
import { eye, onScale } from '../scalectl.js';
import { go, refresh } from '../app.js';
import { hop } from '../stone.js';

const flowFor = (id) => {
  if (!S.flow.w || S.flow.w.itemId !== id) {
    const u = unitWeight(id);
    S.flow.w = { itemId: id, step: 'tare', tare: 0, containerId: null, sampleN: 10, unitG: null, unitSaved: u || null, last: null };
  }
  return S.flow.w;
};

function liveSource() {
  const sc = S.scale;
  if (!sc || !sc.live) return 'manual';
  return sc.kind === 'kbd' ? 'kbd' : 'live';
}

/** 지금 무게 표시: 실시간(안드로이드)·받은 값(아이폰 키보드)·직접 입력(사만다 없음) */
function weightBox(src, big = true, gid = 'g') {
  if (src === 'live') return `<div class="count"><div class="${big ? 'big' : 'mid'}"><span id="${gid}">–</span><span class="u">g</span></div><div class="stable mv" id="st"><i></i><span>기다리는 중</span></div></div>`;
  if (src === 'kbd') return `<label class="kbd"><span><small id="kt">사만다 버튼을 한 번 누르세요</small><b id="${gid}">–</b></span><span id="st" class="chip wait">기다림</span></label>`;
  return `<div class="card"><label class="field">무게(g) 직접 입력<span class="inline"><input id="mg" inputmode="decimal" placeholder="예: 1223.7" autocomplete="off"><button type="button" class="b sm" data-act="manualg">입력</button></span></label>
    <p class="hint">사만다가 연결되지 않았어요. 다른 저울 숫자를 넣거나 <a href="#/connect">사만다를 연결</a>하세요.</p></div>
    ${gid === 'g' ? `<div class="count"><div class="mid"><span id="g">–</span><span class="u">g</span></div></div>` : ''}`;
}

function simPanel(w, it) {
  if (S.scale?.kind !== 'sim') return '';
  const u = w.unitSaved?.grams || Number(it.unit_g) || 0.953;
  const c = 48.2;
  return `<div class="sim"><span class="hint">연습용 저울</span>
    <button type="button" class="fchip" data-act="sim" data-arg="${c}">빈 통</button>
    <button type="button" class="fchip" data-act="sim" data-arg="${(c + w.sampleN * u).toFixed(1)}">${w.sampleN}개</button>
    <button type="button" class="fchip" data-act="sim" data-arg="${(c + 1284 * u).toFixed(1)}">전부</button>
    <button type="button" class="fchip" data-act="sim" data-arg="0">내리기</button></div>`;
}

export function weigh({ id }) {
  const it = itemById(id);
  if (!it) return { html: screen({ title: '품목 없음', back: '#/', body: say('품목을 찾지 못했어요') }) };
  const w = flowFor(id);
  const src = liveSource();
  const steps = { tare: 1, sample: 2, all: 3 };
  const head = (q, small) => say(q, small, 'sam', eye(), true);
  const base = { title: esc(it.name), back: w.step === 'tare' ? '#/' : null, step: [steps[w.step], 3], right: `${steps[w.step]} / 3` };
  let body = '', actions = '';

  if (w.step === 'tare') {
    const saved = S.containers;
    body = head('통에 담아 재나요?', '빈 통을 올리면 그 무게는 빼고 셀게요') + weightBox(src)
      + (saved.length ? `<section class="card list"><div class="sec-h">저장한 통</div>${saved.map((c) => `<button type="button" class="row" data-act="usec" data-arg="${c.id}" id="c-${c.id}"><span><b>${esc(c.name)}</b><small>${fmtG(c.grams)} g</small></span><span class="chip wait">이것</span></button>`).join('')}</section>` : '')
      + simPanel(w, it);
    actions = btn2(btn('통 없이', 'notare', { sm: true }), btn('이 통 빼기', 'tare', { primary: true, sm: true, id: 'act', disabled: true }));
  } else if (w.step === 'sample') {
    const u = w.unitSaved;
    body = head(`${w.sampleN}개만 올려 주세요`, '한 개가 몇 g인지 잴게요' + (w.tare ? ` · 통 ${fmtG(w.tare)} g 뺌` : '')) + weightBox(src)
      + `<div class="step"><span><b>샘플 개수</b><small>많이 셀수록 많이 올리면 정확해요</small></span><span class="ctl"><button type="button" data-act="n" data-arg="-5" aria-label="5개 줄이기">−</button><b>${w.sampleN}</b><button type="button" data-act="n" data-arg="5" aria-label="5개 늘리기">+</button></span></div>`
      + (u ? `<div class="card">저장된 개당 무게가 있어요<br><b class="n">${fmt(u.grams, 3)} g</b> <span class="hint">· ${new Date(u.measured_at).toLocaleDateString('ko-KR')} · ${u.sample_n}개로 잼</span></div>` : '')
      + `<p class="hint" id="warn"></p>` + simPanel(w, it);
    actions = (u ? btn2(btn('저번 값 쓰기', 'reuse', { sm: true }), btn('멈추면 재기', 'sample', { primary: true, sm: true, id: 'act', disabled: true })) : btn('멈추면 재기', 'sample', { primary: true, id: 'act', disabled: true }))
      + (u ? '<p class="hint center">로트가 바뀌었으면 다시 재 주세요</p>' : '');
  } else {
    body = head('전부 올려 주세요', src === 'kbd' ? '무게가 멈추면 사만다 버튼을 한 번 누르세요' : '')
      + (src === 'live' ? '' : weightBox(src, false, 'g0'))
      + `<div class="count"><div class="big"><span id="cnt">–</span><span class="u">개</span></div><div class="pm" id="err"></div>${src === 'live' ? '<div class="stable mv" id="st"><i></i><span>기다리는 중</span></div>' : ''}</div>
      <div class="meter"><div><small>올린 무게</small><b id="g">–</b></div><div><small>개당</small><b>${fmt(w.unitG, 3)}g</b></div><div><small>샘플</small><b>${w.sampleN}개</b></div></div>
      <div class="card" id="adv" hidden></div><p class="warn" id="warn" hidden></p>` + simPanel(w, it);
    actions = btn2(btn('샘플 더 재기', 'more', { sm: true }), btn('저장', 'save', { primary: true, sm: true, id: 'act', disabled: true }));
  }

  // ---------- 무게가 들어올 때 ----------
  function onReading(r) {
    w.last = r;
    const $ = (s) => document.getElementById(s);
    const g = $('g'); const st = $('st');
    if (!g) return;
    if (w.step === 'all') { g.textContent = fmtG(r.g) + 'g'; const g0 = $('g0'); if (g0) g0.textContent = fmtG(r.g) + ' g'; } else g.textContent = src === 'kbd' ? fmtG(r.g) + ' g' : fmtG(r.g);
    if (st) {
      if (src === 'kbd') { st.className = 'chip ok'; st.textContent = '받음'; const kt = $('kt'); if (kt) kt.textContent = '받은 무게 · ' + new Date(r.at).toLocaleTimeString('ko-KR'); }
      else if (src === 'live') { st.classList.toggle('mv', !r.s); st.querySelector('span').textContent = r.s ? '멈췄어요' : '움직이는 중'; }
      // 무게가 멈추면 사만다가 '됐다'는 듯 한 번 들썩
      if (r.s && !w.wasStable && r.g > 0.5) hop(document.querySelector('.say .av'), 0.08);
      w.wasStable = !!r.s;
    }
    const act = $('act');
    if (w.step === 'tare') {
      const m = matchContainer(S.containers, r.g);
      S.containers.forEach((c) => { const el = $('c-' + c.id); if (el) el.querySelector('.chip').className = 'chip ' + (m && m.id === c.id ? 'ok' : 'wait'); });
      if (act) act.disabled = !(r.s && r.g > 0.5);
    } else if (w.step === 'sample') {
      const net = r.g - w.tare;
      const u = unitFromSample(net, w.sampleN);
      const warn = $('warn');
      if (warn) warn.textContent = u ? `한 개 약 ${fmt(u, 3)} g${u < 1.5 ? ' · 1.5g보다 가벼워 오차가 커요. 샘플을 늘려 주세요' : ''}` : '';
      if (act) act.disabled = !(r.s && net > 0.3);
    } else {
      const c = countFromWeight(r.g, w.unitG, w.tare);
      const cnt = $('cnt'); const err = $('err'); const adv = $('adv'); const warn = $('warn');
      if (!c) return;
      cnt.textContent = fmt(c.count);
      const e = countError(c.count, w.sampleN, w.unitG);
      err.textContent = `± ${fmt(e)}개`;
      const a = sampleAdvice(c.count, w.sampleN, w.unitG);
      adv.hidden = !a; if (a) adv.innerHTML = `샘플을 <b>${a.n}개</b>로 다시 재면 <b class="n">± ${a.err}개</b>까지 줄어요`;
      const ws = weightWarnings({ unitG: w.unitG, grossG: r.g, off: c.off });
      warn.hidden = !ws.length; warn.textContent = ws.map((k) => WARN_TEXT[k]).join(' ');
      if (act) { act.disabled = !(r.s && c.count > 0) || ws.includes('heavy'); act.textContent = r.s && c.count > 0 ? `${fmt(c.count)}개 저장` : '저장'; }
      w.result = { ...c, err: e, gross: r.g, warns: ws };
    }
  }

  let offs = [];
  return {
    html: screen({ ...base, body, actions }),
    mount() {
      offs = [
        onScale('reading', onReading),
        onScale('state', () => refresh()),
        onScale('event', (e) => {
          if (e.ev === 'tare_done' && w.step !== 'tare') { toast('사만다 영점이 다시 잡혔어요. 통 무게부터 다시 할게요.'); w.step = 'tare'; w.tare = 0; refresh(); }
        }),
      ];
      if (w.last && src !== 'manual' && Date.now() - w.last.at < 1500) onReading(w.last);
      const mg = document.getElementById('mg');
      if (mg) mg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('[data-act=manualg]').click(); } });
    },
    unmount() { offs.forEach((f) => f()); },
    on: {
      manualg() {
        const v = Number(String(document.getElementById('mg').value).replace(/,/g, ''));
        if (!Number.isFinite(v) || !String(document.getElementById('mg').value).trim()) return toast('숫자를 넣어 주세요');
        onReading({ g: v, s: 1, at: Date.now() });
      },
      sim(g) { S.scale?.put?.(Number(g)); },
      notare() { w.tare = 0; w.containerId = null; w.step = 'sample'; refresh(); },
      async usec(cid) { const c = S.containers.find((x) => x.id === cid); w.tare = c.grams; w.containerId = c.id; w.step = 'sample'; refresh(); },
      async tare() {
        const g = w.last?.g; if (!(g > 0)) return;
        const m = matchContainer(S.containers, g);
        if (m) { w.tare = m.grams; w.containerId = m.id; }
        else {
          w.tare = g;
          const r = await sheet(`<p class="sheet-t">이 통을 저장할까요?</p><p class="hint">${fmtG(g)} g · 다음부터 올리기만 하면 알아볼게요</p><label class="field">통 이름<input name="name" placeholder="예: 부품 트레이 (회색)"></label>`,
            [{ label: '저장 안 함', value: 'no' }, { label: '저장', value: 'yes', primary: true }]);
          if (r?.value === 'yes') { const c = await saveRow('containers', { name: r.form.name.trim() || `통 ${fmtG(g)}g`, grams: g }); w.containerId = c.id; }
        }
        w.step = 'sample'; refresh();
      },
      n(d) { w.sampleN = Math.max(1, Math.min(500, w.sampleN + Number(d))); refresh(); },
      reuse() { w.unitG = w.unitSaved.grams; w.sampleN = w.unitSaved.sample_n; w.unitFrom = 'saved'; w.step = 'all'; refresh(); },
      sample() {
        const net = (w.last?.g ?? 0) - w.tare;
        const u = unitFromSample(net, w.sampleN);
        if (!u) return toast('무게가 0이에요. 샘플을 올려 주세요.');
        w.unitG = u; w.sampleNet = net; w.unitFrom = 'new'; w.step = 'all'; refresh();
      },
      more() {
        const a = w.result && sampleAdvice(w.result.count, w.sampleN, w.unitG);
        if (a) w.sampleN = a.n;
        w.unitSaved = null; w.step = 'sample'; refresh();
      },
      async save() {
        const r = w.result; if (!r) return;
        if (w.unitFrom === 'new') {
          const u = await saveRow('unit_weights', { item_id: id, grams: w.unitG, sample_n: w.sampleN, measured_at: Date.now(), source: S.scale?.kind || 'manual' });
          w.unitSaved = u;
        }
        const quality = r.warns.includes('half') ? 'check' : null;
        const rec = await saveRecord({ item_id: id, qty: r.count, method: 'weight', err: r.err, quality,
          detail: { gross: r.gross, tare: w.tare, container_id: w.containerId, unit_g: w.unitG, sample_n: w.sampleN, exact: Math.round(r.exact * 100) / 100, source: S.scale?.kind || 'manual' } });
        S.flow.w = null;
        go(`#/saved/${rec.id}`, { replace: true });
      },
    },
  };
}
