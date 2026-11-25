// 홈 · 품목 고르기
import { S, db, screen, say, btn, esc, fmt, chip, place, placeItems, method, unitWeight, photoProfile, currentBatch, recordsOfBatch, itemById, F, av } from '../core.js';
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
  const recOf = new Map(recs.map((r) => [r.item_id, r]));
  const st = recs.map((r) => recordStatus(r, itemById(r.item_id), previousRecord(S.records, r), F()));
  const n = { chk: st.filter((s) => s.tone === 'chk').length, bad: st.filter((s) => s.tone === 'bad').length };
  const left = items.filter((i) => !recOf.has(i.id)).length;
  const scaleMeta = await db.getMeta('scale');
  const needReconnect = scaleMeta?.kind === 'ble' && !(S.scale && S.scale.live);

  let line;
  if (!items.length) line = say('무엇을 세나요?', '세야 할 재고를 하나 넣어 주세요. 세는 방법은 셈이 정해요');
  else if (!left) line = say('다 셌어요', `${esc(b.label)} · 결과에서 확인하고 보낼 수 있어요`);
  else line = say('무엇을 셀까요?', `${esc(b.label)} · ${fmt(left)}개 남았어요`);

  // 검색
  const q = (S.flow.q || '').trim().toLowerCase();
  const match = (i) => !q || (i.name || '').toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q) || (i.location || '').toLowerCase().includes(q);
  const search = items.length > 8 ? `<input class="search" id="q" type="search" placeholder="품목·폴더 찾기" value="${esc(S.flow.q || '')}" aria-label="품목 찾기">` : '';

  // 폴더 = 보관 위치. 위치가 없는 품목은 '그 밖의 품목'
  const groups = new Map();
  for (const it of [...items].filter(match).sort((a, c) => (a.name || '').localeCompare(c.name || '', 'ko'))) {
    const k = (it.location || '').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const keys = [...groups.keys()].sort((a, c) => (a === '') - (c === '') || a.localeCompare(c, 'ko'));
  const folds = (S.flow.folds ||= {});
  const tile = (it) => {
    const r = recOf.get(it.id);
    const s = r && st[recs.indexOf(r)];
    const state = r
      ? `<span class="tile-n"><b class="n">${fmt(r.qty)}</b>${esc(it.unit || '개')}${s && s.tone !== 'ok' ? ' ' + chip(s.label, s.tone) : ''}</span>`
      : '<span class="tile-n todo">아직 안 셈</span>';
    return `<a class="tile${r ? ' done' : ''}" href="${routeFor(it)}"><b class="tile-t">${esc(it.name)}</b><small>${METHODS[method(it)].by} 세기</small>${state}</a>`;
  };
  const addTile = '<a class="tile add" href="#/item/new?then=count"><span aria-hidden="true">＋</span>새 재고</a>';
  const folder = (k, i) => {
    const list = groups.get(k);
    const done = list.filter((it) => recOf.has(it.id)).length;
    const open = q || folds[k] !== false;
    const last = i === keys.length - 1;
    const name = k || (keys.length > 1 ? '그 밖의 품목' : '모든 품목');
    return `<details class="folder" data-fold="${esc(k)}"${open ? ' open' : ''}><summary><span class="folder-t">${esc(name)}</span><span class="n folder-c">${fmt(done)} / ${fmt(list.length)}</span></summary>
      <div class="tiles">${list.map(tile).join('')}${last && !q ? addTile : ''}</div></details>`;
  };
  const grid = items.length
    ? (keys.length ? keys.map(folder).join('') : '<p class="hint">찾는 품목이 없어요.</p>')
    : '';
  const alert = n.chk || n.bad ? `<a class="card between" href="#/results" style="text-decoration:none"><span>${n.chk ? chip('확인 필요 ' + n.chk, 'chk') : ''} ${n.bad ? chip('다시 세기 ' + n.bad, 'bad') : ''}</span><span class="hint">결과 보기 ›</span></a>` : '';

  // 오른쪽 위: 사만다가 연결됐는지 글자로도 보여 준다(그림만으로는 뭔지 알기 어려움)
  const live = !!(S.scale && S.scale.live);
  const right = `<a href="#/connect" class="scale-link${live ? ' on' : ''}" aria-label="사만다 ${live ? '연결됨' : '연결하기'}">${av('sam', eye(), 22, 'live')}<span>${live ? '연결됨' : '사만다 연결'}</span></a>`;
  const body = `${line}
    ${needReconnect ? `<div class="card media">${av('sam', 'off', 36)}<span><b>사만다와 연결이 끊겼어요</b><small class="hint">블루투스는 다시 눌러서 연결해야 해요</small></span>${btn('연결', 'reble', { sm: true })}</div>` : ''}
    ${alert}${search}${grid}`;
  const actions = !items.length
    ? btn('재고 넣기', 'add', { primary: true }) + btn('엑셀·CSV로 한 번에 넣기', 'items', { sm: true })
    : (F().fill ? btn('정한 개수씩 나눠 담기', 'fill', { sm: true }) : '');
  return {
    html: screen({ title: `<a href="#/places" class="place-t">${esc(p?.name || '세는 곳')} ▾</a>`, back: false, right, body, actions, tab: 'home' }),
    on: {
      add: () => go('#/item/new?then=count'),
      items: () => go('#/items?import=1'),
      fill: () => go('#/fill'),
      async reble() { await connectScale('ble'); refresh(); },
    },
    mount(root) {
      root.querySelectorAll('details.folder').forEach((d) => d.addEventListener('toggle', () => { if (!q) folds[d.dataset.fold] = d.open; }));
      const i = root.querySelector('#q');
      if (!i) return;
      let t;
      i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.flow.q = i.value; refresh().then(() => { const n2 = document.getElementById('q'); if (n2) { n2.focus(); n2.setSelectionRange(n2.value.length, n2.value.length); } }); }, 250); });
    },
  };
}
