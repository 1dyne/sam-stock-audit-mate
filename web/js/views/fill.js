// 담기 (설정에서 켰을 때만): 정한 개수만큼 덜어 담기. 계수 저울의 목표 수량 기능과 같다.
import { S, screen, say, btn, btn2, esc, fmt, fmtG, toast, itemById, placeItems, unitWeight, method, saveRow, F } from '../core.js';
import { fillState } from '../model.js';
import { eye, onScale } from '../scalectl.js';
import { go, refresh } from '../app.js';

export function fillPick() {
  if (!F().fill) return { html: screen({ title: '담기', back: '#/', body: say('담기가 꺼져 있어요', '설정 › 자주 쓰는 기능에서 켤 수 있어요') }) };
  const list = placeItems().filter((i) => method(i) === 'weight');
  const rows = list.map((i) => { const u = unitWeight(i.id); return `<a class="row${u ? '' : ' dim-row'}" href="${u ? `#/fill/${i.id}` : `#/weigh/${i.id}`}"><span><b>${esc(i.name)}</b><small>${u ? `개당 ${fmt(u.grams, 3)} g` : '먼저 무게로 세서 개당 무게를 재 주세요'}</small></span><span>›</span></a>`; }).join('');
  return { html: screen({ title: '담기', back: '#/', body: say('무엇을 담나요?', '개당 무게를 잰 품목만 담을 수 있어요') + `<section class="card list">${rows || '<p class="hint">무게로 세는 품목이 없어요</p>'}</section>` }) };
}

export function fill({ id }) {
  const it = itemById(id);
  const u = unitWeight(id);
  if (!it || !u) return { html: screen({ title: '담기', back: '#/fill', body: say('개당 무게가 필요해요', '먼저 무게로 세 주세요') }) };
  const f = (S.flow.f && S.flow.f.itemId === id) ? S.flow.f : (S.flow.f = { itemId: id, stage: 'set', per: 50, bags: 20, done: 0, tare: 0, okSeen: false, last: null });
  const unit = esc(it.unit || '개');
  const head = (q, small) => say(q, small, 'sam', eye(), true);
  const sim = S.scale?.kind === 'sim' ? `<div class="sim"><span class="hint">연습용 저울</span>
      <button type="button" class="fchip" data-act="sim" data-arg="8">빈 봉투</button>
      <button type="button" class="fchip" data-act="sim" data-arg="${(8 + (f.per - 13) * u.grams).toFixed(1)}">${f.per - 13}개</button>
      <button type="button" class="fchip" data-act="sim" data-arg="${(8 + f.per * u.grams).toFixed(1)}">${f.per}개</button>
      <button type="button" class="fchip" data-act="sim" data-arg="${(8 + (f.per + 2) * u.grams).toFixed(1)}">${f.per + 2}개</button>
      <button type="button" class="fchip" data-act="sim" data-arg="0">내리기</button></div>` : '';

  if (f.stage === 'set') {
    const ctl = (k, l, s, step) => `<div class="step"><span><b>${l}</b><small>${s}</small></span><span class="ctl"><button type="button" data-act="d" data-arg="${k}:-${step}" aria-label="${l} 줄이기">−</button><b>${f[k]}</b><button type="button" data-act="d" data-arg="${k}:${step}" aria-label="${l} 늘리기">+</button></span></div>`;
    const ready = S.scale?.live;
    return {
      html: screen({ title: `담기 · ${esc(it.name)}`, back: '#/fill',
        body: head('몇 개씩 몇 봉투 담나요?') + ctl('per', '한 봉투에', unit, 5) + ctl('bags', '봉투 수', '모르면 0', 1)
          + `<div class="card">빈 봉투를 올리고 시작하면 봉투 무게는 빼고 셀게요. 개당 무게는 <b class="n">${fmt(u.grams, 3)} g</b>을 써요.</div>`
          + (ready ? '' : '<div class="card hint">사만다를 먼저 연결해 주세요. <a href="#/connect">연결하기</a></div>') + sim,
        actions: btn('빈 봉투 올리고 시작', 'start', { primary: true, disabled: !ready, id: 'act' }) }),
      on: {
        d(a) { const [k, d] = a.split(':'); f[k] = Math.max(k === 'per' ? 1 : 0, f[k] + Number(d)); refresh(); },
        sim(g) { S.scale?.put?.(Number(g)); },
        start() { const r = S.scale?.last; f.tare = r && r.s ? r.g : 0; f.stage = 'go'; f.okSeen = false; refresh(); },
      },
      mount() { this._off = onScale('state', () => refresh()); },
      unmount() { this._off && this._off(); },
    };
  }

  const progress = f.bags ? `${f.done + 1} / ${f.bags}` : `${f.done + 1}번째`;
  const body = head('담아 주세요', S.scale?.kind === 'kbd' ? '사만다 버튼을 누를 때마다 확인해요' : '')
    + `<div class="band wait" id="band"><b id="bt">–</b><span id="bs">봉투 무게 ${fmtG(f.tare)} g 뺌</span></div>
      <p class="pm center" id="bn">± 1개</p>
      <p class="hint center">초록 = 맞아요 · 주황 = 더 넣기 · 빨강 = 빼기. 맞으면 봉투를 내려 주세요, 다음 봉투로 넘어가요.</p>` + sim;

  function onReading(r) {
    f.last = r;
    const band = document.getElementById('band'); if (!band) return;
    const net = r.g - f.tare;
    if (r.g < Math.max(1, f.tare * 0.5)) {
      // 봉투를 내렸다
      if (f.okSeen) { f.done++; f.okSeen = false; if (f.bags && f.done >= f.bags) return finish(); refresh(); return; }
      band.className = 'band wait'; document.getElementById('bt').textContent = '빈 봉투를 올려 주세요'; return;
    }
    const s = fillState(net, u.grams, f.per);
    const t = document.getElementById('bt'); const bs = document.getElementById('bs');
    if (!r.s) { band.className = 'band wait'; t.textContent = `약 ${fmt(s.count)}개`; bs.textContent = '움직이는 중'; return; }
    if (s.state === 'more') { band.className = 'band chk'; t.textContent = `${fmt(s.diff)}개 더`; bs.textContent = `지금 ${fmt(s.count)}개`; }
    else if (s.state === 'less') { band.className = 'band bad'; t.textContent = `${fmt(-s.diff)}개 빼세요`; bs.textContent = `지금 ${fmt(s.count)}개`; }
    else { band.className = 'band ok'; t.textContent = `${fmt(f.per)}개`; bs.textContent = `${f.done + 1}번째 봉투 맞아요`; f.okSeen = true; }
  }
  async function finish() {
    const total = f.done * f.per;
    if (f.done) await saveRow('fills', { item_id: id, place_id: S.place_id, per_bag: f.per, bags: f.done, total, at: Date.now() });
    toast(f.done ? `${fmt(f.per)}개 × ${f.done}봉투, ${fmt(total)}개 덜어 냈어요` : '담기를 끝냈어요');
    S.flow.f = null;
    go('#/');
  }
  let offs = [];
  return {
    html: screen({ title: `담기 · ${fmt(f.per)}개`, back: null, right: `<span class="n">${progress}</span>`, body,
      actions: btn('여기서 끝내기', 'end', { sm: true }) }),
    mount() { offs = [onScale('reading', onReading), onScale('state', () => refresh())]; },
    unmount() { offs.forEach((x) => x()); },
    on: { end: finish, sim(g) { S.scale?.put?.(Number(g)); } },
  };
}
void btn2;
