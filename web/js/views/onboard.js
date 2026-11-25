// 처음 시작: 무엇을 세나요 → 이렇게 세면 정확해요(장치 제안) → 자주 쓸 기능 → 어디를 세나요 → 사만다 연결
import { S, db, screen, say, sayBig, btn, btn2, esc, toast, sheet, pickFile, saveSettings, setPlace, saveRow, load, av } from '../core.js';
import { KINDS, METHODS, FEATURES, defaultFeatures, methodsForKinds } from '../model.js';
import { connectBody, connectActions, connectMount } from './settings.js';
import { go, refresh } from '../app.js';

const REPO = 'https://github.com/1dyne/sam-stock-audit-mate';
const ob = () => (S.flow.ob ||= { kinds: ['small', 'loose', 'big'], features: null, name: '', catalog: 'shared', add: 'later' });
const TOTAL = 5;

export function start({ step }) {
  const n = Number(step) || 0;
  const o = ob();
  const needsSam = () => methodsForKinds(o.kinds).includes('weight');
  const next = (k) => go(`#/start/${k}`);

  if (n === 0) {
    return {
      html: screen({ back: false, cls: 'center-v', body: sayBig('안녕하세요, 셈이에요', '많아서 세기 힘든 재고를 같이 세요.<br>기록은 이 휴대폰에만 저장돼요.'),
        actions: btn('시작하기', 'go', { primary: true }) + btn('백업 파일로 이어서 하기', 'restore', { sm: true }) }),
      on: {
        go: () => next(1),
        async restore() {
          const f = await pickFile('.json,application/json'); if (!f) return;
          await db.restore(JSON.parse(await f.text())); await load();
          await saveSettings({ onboarded: true }); toast('이어서 할게요'); go('#/');
        },
      },
    };
  }

  if (n === 1) {
    const opts = Object.entries(KINDS).map(([k, d]) => `<button type="button" class="opt${o.kinds.includes(k) ? ' on' : ''}" data-act="kind" data-arg="${k}" aria-pressed="${o.kinds.includes(k)}"><span><b>${d.label}</b><small>${d.desc}</small></span><span class="ck">${o.kinds.includes(k) ? '✓' : ''}</span></button>`).join('');
    return {
      html: screen({ back: '#/start/0', step: [1, TOTAL], right: `1 / ${TOTAL}`, body: say('무엇을 세나요?', '해당하는 것을 모두 골라 주세요') + opts,
        actions: btn('다음', 'next', { primary: true, disabled: !o.kinds.length }) }),
      on: {
        kind(k) { o.kinds = o.kinds.includes(k) ? o.kinds.filter((x) => x !== k) : [...o.kinds, k]; o.features = null; refresh(); },
        next: () => next(2),
      },
    };
  }

  if (n === 2) {
    const rows = o.kinds.map((k) => { const m = METHODS[KINDS[k].method]; return `<div class="row"><span><b>${KINDS[k].label}</b><small>${m.how}</small></span><span class="dev">${m.device}</span></div>`; }).join('');
    const sam = needsSam() ? `<div class="card media">${av('sam', 'off', 44)}<span><b>작은 부품은 사만다가 필요해요</b><small class="hint">재고 측정기예요. 없어도 다른 방법으로 셀 수 있어요.</small></span></div>` : '';
    return {
      html: screen({ back: '#/start/1', step: [2, TOTAL], right: `2 / ${TOTAL}`, body: say('이렇게 세면 정확해요') + `<section class="card list">${rows}</section>` + sam,
        actions: needsSam() ? btn2(btn('만드는 법', 'how', { sm: true }), btn('다음', 'next', { primary: true, sm: true })) : btn('다음', 'next', { primary: true }) }),
      on: { how: () => window.open(REPO + '#사만다-만들기', '_blank', 'noopener'), next: () => next(3) },
    };
  }

  if (n === 3) {
    o.features ||= defaultFeatures(o.kinds);
    const rows = Object.entries(FEATURES).map(([k, d]) => `<button type="button" class="row tog" data-act="feat" data-arg="${k}" aria-pressed="${!!o.features[k]}"><span><b>${d.label}</b><small>${d.desc}</small></span><span class="sw${o.features[k] ? ' on' : ''}" aria-hidden="true"></span></button>`).join('');
    return {
      html: screen({ back: '#/start/2', step: [3, TOTAL], right: `3 / ${TOTAL}`, body: say('자주 쓸 기능만 켜 주세요', '나머지는 숨겨 둘게요. 설정에서 바꿀 수 있어요') + `<section class="card list">${rows}</section>`,
        actions: btn('다음', 'next', { primary: true }) }),
      on: { feat(k) { o.features[k] = !o.features[k]; refresh(); }, next: () => next(4) },
    };
  }

  if (n === 4) {
    const shared = S.catalogs.filter((c) => c.shared);
    const radio = (v, title, small) => `<button type="button" class="opt${o.catalog === v ? ' on' : ''}" data-act="cat" data-arg="${v}" aria-pressed="${o.catalog === v}"><span><b>${title}</b><small>${small}</small></span><span class="ck">${o.catalog === v ? '✓' : ''}</span></button>`;
    const addc = (v, l) => `<button type="button" class="fchip${o.add === v ? ' on' : ''}" data-act="add" data-arg="${v}" aria-pressed="${o.add === v}">${l}</button>`;
    return {
      html: screen({ back: '#/start/3', step: [4, TOTAL], right: `4 / ${TOTAL}`,
        body: say('어디를 세나요?') + `<label class="card field-line"><small class="hint">세는 곳 이름</small><input id="pname" value="${esc(o.name)}" placeholder="예: 작업실 부품장" autocomplete="off"></label>
          <div class="sec-h">품목 목록</div>
          ${radio('shared', '공통 목록 쓰기', shared.length ? '다른 세는 곳과 같은 품목, 수량만 따로' : '나중에 다른 세는 곳도 이 품목을 같이 써요')}
          ${radio('own', '이곳만 따로', '이 세는 곳에만 있는 품목')}
          <div class="sec-h">품목 넣기</div>
          <div class="chips">${addc('file', '엑셀·CSV 불러오기')}${addc('one', '하나씩 입력')}${addc('later', '세면서 넣기')}</div>`,
        actions: btn('다음', 'next', { primary: true }) }),
      on: {
        cat(v) { o.name = document.getElementById('pname').value; o.catalog = v; refresh(); },
        add(v) { o.name = document.getElementById('pname').value; o.add = v; refresh(); },
        async next() {
          o.name = document.getElementById('pname').value.trim() || '내 재고';
          await finishSetup(o);
          if (needsSam()) next(5); else done(o);
        },
      },
    };
  }

  // 5: 사만다 연결
  const c = connectBody();
  let off;
  return {
    html: screen({ back: '#/start/4', step: [5, TOTAL], right: `5 / ${TOTAL}`, cls: 'drop-in', body: c.text + c.body,
      actions: (S.scale?.live ? btn('다 됐어요', 'finish', { primary: true }) : c.actions) + (S.scale?.live ? '' : btn('사만다 없이 시작', 'finish', { sm: true })) }),
    on: { ...connectActions, finish: () => done(o) },
    mount() { off = connectMount(); },
    unmount() { off && off(); },
  };
}

/** 세는 곳·품목 목록 만들기(4단계 다음에 한 번) */
async function finishSetup(o) {
  await saveSettings({ kinds: o.kinds, features: o.features || defaultFeatures(o.kinds) });
  if (S.place_id && S.flow.obPlace === S.place_id) {
    const p = S.places.find((x) => x.id === S.place_id);
    await saveRow('places', { ...p, name: o.name });
    return;
  }
  const shared = S.catalogs.find((c) => c.shared);
  const cat = o.catalog === 'shared' && shared ? shared : await saveRow('catalogs', { name: o.name + ' 품목', shared: o.catalog === 'shared' });
  const p = await saveRow('places', { name: o.name, catalog_id: cat.id });
  await setPlace(p.id);
  S.flow.obPlace = p.id;
}

async function done(o) {
  await saveSettings({ onboarded: true });
  const add = o.add;
  S.flow.ob = null;
  if (add === 'file') go('#/items?import=1');
  else if (add === 'one') go('#/item/new');
  else go('#/');
}
void sheet;
