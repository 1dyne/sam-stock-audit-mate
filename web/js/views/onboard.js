// 처음 시작: 인사 → 세는 곳 이름 → 사만다 연결(건너뛸 수 있음)
import { S, db, screen, say, sayBig, btn, esc, toast, pickFile, saveSettings, setPlace, saveRow, load } from '../core.js';
import { KINDS, defaultFeatures } from '../model.js';
import { connectBody, connectActions, connectMount } from './settings.js';
import { go } from '../app.js';

const REPO = 'https://github.com/1dyne/sam-stock-audit-mate';
// 처음에는 꼭 필요한 것만 묻는다: 세는 곳 이름 → 사만다 연결(건너뛸 수 있음).
// 무엇을 어떻게 셀지는 재고를 넣을 때 종류만 고르면 셈이 정하고, 자주 쓰는 기능은 기본값으로 켜 두고 설정에서 바꾼다.
const ALL_KINDS = Object.keys(KINDS);
const ob = () => (S.flow.ob ||= { kinds: ALL_KINDS, features: null, name: '', catalog: 'shared' });
const TOTAL = 2;

export function start({ step }) {
  const n = Number(step) || 0;
  const o = ob();
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
    return {
      html: screen({ back: '#/start/0', step: [1, TOTAL], right: `1 / ${TOTAL}`,
        body: say('어디에 있는 재고를 세나요?', '이름만 붙여 주세요. 나중에 바꾸거나 더 만들 수 있어요')
          + `<label class="card field-line"><small class="hint">세는 곳 이름</small><input id="pname" value="${esc(o.name)}" placeholder="예: 작업실 부품장" autocomplete="off" enterkeyhint="next"></label>
          <p class="hint">비워 두면 "내 재고"로 할게요.</p>`,
        actions: btn('다음', 'next', { primary: true }) }),
      on: {
        async next() {
          o.name = document.getElementById('pname').value.trim() || '내 재고';
          await finishSetup(o);
          next(2);
        },
      },
      mount(root) { root.querySelector('#pname').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act=next]').click(); } }); },
    };
  }

  // 2: 사만다 연결
  const c = connectBody();
  const live = !!S.scale?.live;
  let off;
  return {
    html: screen({ back: '#/start/1', step: [2, TOTAL], right: `2 / ${TOTAL}`, cls: 'drop-in',
      body: c.text + c.body + (live ? '' : `<p class="hint">사만다는 작은 부품을 무게로 세는 재고 측정기예요. 없어도 사진·박스·직접 세기는 쓸 수 있어요. <a href="${REPO}#사만다-만들기" target="_blank" rel="noopener">만드는 법</a></p>`),
      actions: live ? btn('다 됐어요', 'finish', { primary: true }) : c.actions + btn('사만다 없이 시작', 'finish', { sm: true }) }),
    on: { ...connectActions, finish: () => done() },
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

async function done() {
  await saveSettings({ onboarded: true });
  S.flow.ob = null;
  go('#/', { replace: true });
}
