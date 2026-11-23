// 홈 · 품목 고르기
import { S, db, screen, say, btn, btn2, esc, fmt, chip, dev, clock, place, placeItems, method, unitWeight, photoProfile, currentBatch, recordsOfBatch, itemById, F, av } from '../core.js';
import { METHODS, recordStatus, previousRecord, photoAccuracy } from '../model.js';
import { eye, connectScale } from '../scalectl.js';
import { go, refresh } from '../app.js';

export function routeFor(it) { const m = method(it); return `#/${m === 'weight' ? 'weigh' : m}/${it.id}`; }

export function itemHint(it) {
  const m = method(it);
  if (m === 'weight') { const u = unitWeight(it.id); return u ? `개당 ${fmt(u.grams, 3)} g 저장됨` : '처음이면 10개로 개당 무게를 재요'; }
  if (m === 'photo') { const p = photoProfile(it.id); const a = p && photoAccuracy(p.runs); return a != null ? `사진 학습 · 정확도 ${Math.round(a * 100)}%` : '처음이면 샘플 하나를 골라요'; }
  if (m === 'box') return it.pack_qty ? `박스당 ${fmt(it.pack_qty)}${esc(it.unit || '개')}` : '박스당 개수를 정해 주세요';
  return it.location ? esc(it.location) : '';
}

export async function home() {
  const p = place();
  const items = placeItems();
  const b = p ? await currentBatch() : null;
  const recs = b ? recordsOfBatch(b.id) : [];
  const counted = new Set(recs.map((r) => r.item_id));
  const st = recs.map((r) => recordStatus(r, itemById(r.item_id), previousRecord(S.records, r), F()));
  const n = { chk: st.filter((s) => s.tone === 'chk').length, bad: st.filter((s) => s.tone === 'bad').length, ok: st.filter((s) => s.tone === 'ok').length };
  const left = items.filter((i) => !counted.has(i.id)).length;
  const scaleMeta = await db.getMeta('scale');
  const needReconnect = scaleMeta?.kind === 'ble' && !(S.scale && S.scale.live);

  let line;
  if (!items.length) line = say('품목을 넣어 주세요', '엑셀로 불러오거나, 세면서 하나씩 넣어도 돼요');
  else if (!left) line = say(`${esc(b.label)} 묶음, 다 셌어요`, '결과에서 확인하고 보낼 수 있어요');
  else line = say(`${esc(b.label)} 묶음, ${fmt(left)}개 남았어요`);

  const recent = [...recs].sort((a, b2) => b2.counted_at - a.counted_at).slice(0, 5).map((r, i) => {
    const it = itemById(r.item_id);
    const s = st[recs.indexOf(r)];
    return `<a class="row" href="#/record/${r.id}"><span><b>${esc(it?.name || r.item_name)}</b><small>${METHODS[r.method]?.label || ''} · ${clock(r.counted_at)} ${s.tone !== 'ok' ? chip(s.label, s.tone) : ''}</small></span><span class="n strong">${fmt(r.qty)}</span></a>`;
    void i;
  }).join('');

  const prog = items.length ? `<section class="card"><div class="between"><b>${esc(b.label)}</b><span class="n">${fmt(counted.size)} / ${fmt(items.length)}</span></div>
      <div class="prog in"><i style="width:${items.length ? (counted.size / items.length) * 100 : 0}%"></i></div>
      <div class="chips">${n.chk ? chip('확인 필요 ' + n.chk, 'chk') : ''}${n.bad ? chip('다시 세기 ' + n.bad, 'bad') : ''}${chip('완료 ' + n.ok, 'ok')}</div></section>` : '';

  const right = `<a href="#/connect" class="scale-link" aria-label="사만다 연결">${av('sam', eye(), 30, 'live')}</a>`;
  const body = `${line}
    ${needReconnect ? `<div class="card media">${av('sam', 'off', 36)}<span><b>사만다와 연결이 끊겼어요</b><small class="hint">블루투스는 다시 눌러서 연결해야 해요</small></span>${btn('연결', 'reble', { sm: true })}</div>` : ''}
    ${prog}
    ${recent ? `<div class="sec-h">최근 센 것</div><section class="card list">${recent}</section>` : ''}`;
  const actions = (items.length ? btn('세기', 'count', { primary: true }) : btn('품목 넣기', 'items', { primary: true }) + btn('세면서 넣기', 'count', { sm: true }))
    + (F().fill ? btn('담기', 'fill', { sm: true }) : '');
  return {
    html: screen({ title: `<a href="#/places" class="place-t">${esc(p?.name || '세는 곳')} ▾</a>`, back: false, right, body, actions, tab: 'home' }),
    on: {
      count: () => go('#/count'),
      items: () => go('#/items?import=1'),
      fill: () => go('#/fill'),
      async reble() { await connectScale('ble'); refresh(); },
    },
  };
}

export async function pick() {
  const items = placeItems();
  const b = await currentBatch();
  const counted = new Set(recordsOfBatch(b.id).map((r) => r.item_id));
  const q = (S.flow.q || '').toLowerCase();
  const match = (i) => !q || (i.name || '').toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q);
  const row = (i) => `<a class="row" href="${routeFor(i)}"><span><b>${esc(i.name)}</b><small>${itemHint(i)}</small></span>${dev(METHODS[method(i)].label)}</a>`;
  const todo = items.filter((i) => !counted.has(i.id) && match(i));
  const done = items.filter((i) => counted.has(i.id) && match(i));
  const body = `${say('무엇을 셀까요?')}
    <input class="search" id="q" type="search" placeholder="품목 이름·코드 찾기" value="${esc(S.flow.q || '')}" aria-label="품목 찾기">
    ${todo.length ? `<div class="sec-h">아직 안 센 품목 · ${todo.length}</div><section class="card list">${todo.map(row).join('')}</section>` : ''}
    ${done.length ? `<div class="sec-h">이번 묶음에서 센 품목 · ${done.length}</div><section class="card list">${done.map(row).join('')}</section>` : ''}
    ${!items.length ? '<p class="hint">아직 품목이 없어요. 아래에서 새 품목을 넣으면서 바로 셀 수 있어요.</p>' : ''}`;
  return {
    html: screen({ title: '세기', back: '#/', body, actions: btn('목록에 없는 새 품목', 'add', { sm: true }) }),
    on: { add: () => go('#/item/new?then=count') },
    mount(root) {
      const i = root.querySelector('#q');
      let t;
      i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.flow.q = i.value; refresh().then(() => { const n = document.getElementById('q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); });
    },
  };
}
void btn2;
