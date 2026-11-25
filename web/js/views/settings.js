// 설정 · 사만다 연결 · 세는 곳
import { S, db, screen, say, btn, btn2, esc, toast, sheet, shareFile, pickFile, saveSettings, setPlace, saveRow, load, F, av } from '../core.js';
import { FEATURES, VERSION } from '../model.js';
import { BleScale, isIOS } from '../scale.js';
import { connectScale, disconnectScale, onScale, eye } from '../scalectl.js';
import { go, back, refresh } from '../app.js';

const sw = (on) => `<span class="sw${on ? ' on' : ''}" aria-hidden="true"></span>`;

// ---------- 사만다 연결 (처음 시작 5단계와 설정에서 같이 씀) ----------
export function connectBody() {
  const ios = isIOS();
  const ble = BleScale.supported();
  const sc = S.scale;
  if (sc && sc.live) {
    const kbd = sc.kind === 'kbd';
    return {
      text: say(kbd ? '키보드로 연결돼 있어요' : '사만다와 연결됐어요', kbd ? '사만다 버튼을 한 번 누르면 무게가 들어와요' : esc(sc.name || ''), 'sam', eye(), true),
      body: `${kbd ? kbdTest() : liveBox()}
        <div class="card hint">${kbd ? '움직이는 숫자는 볼 수 없어요. 사만다 눈이 보라색이면 연결된 거예요.' : '사만다 눈이 초록이면 무게가 멈춘 거예요. 노랑은 흔들리는 중이에요.'}</div>`,
      actions: btn('연결 끊기', 'disconnect', { sm: true }),
    };
  }
  if (ios) {
    return {
      text: say('아이폰은 키보드로 연결해요', '사만다가 무게를 글자처럼 입력해 줘요', 'sam', 'purple'),
      body: `<ol class="card steps">
          <li>사만다 버튼을 <b>세 번</b> 눌러 눈이 <b>보라색</b>이 되게 해요</li>
          <li>아이폰 <b>설정 › 블루투스</b>에서 <b>dalgrak-scale-번호</b>를 눌러 연결해요</li>
          <li>셈으로 돌아와 아래 버튼을 누르세요</li></ol>
        <p class="hint">블루투스 웹 연결은 아이폰 사파리에서 안 돼요. 키보드 모드에서는 무게가 멈췄을 때 사만다 버튼을 한 번 누르면 그 값이 들어와요.</p>`,
      actions: `${btn('키보드로 연결했어요', 'kbd', { primary: true })}${btn('연습용 저울로 해 보기', 'sim', { sm: true })}`,
    };
  }
  return {
    text: say('사만다예요', '측정기 전원을 켜 주세요. 켜지면 바로 연결할게요', 'sam', 'cyan'),
    body: `<div class="card hint">${ble ? '아래 버튼을 누르면 가까운 사만다(dalgrak-scale-번호)가 보여요. 스티커 번호와 같은 것을 고르세요.' : '이 브라우저는 블루투스 연결을 지원하지 않아요. 안드로이드 크롬에서 열어 주세요.'}</div>
      <p class="hint">사만다 눈이 청록색으로 깜빡이면 연결을 기다리는 중이에요. 보라색이면 키보드 모드라서 버튼을 세 번 눌러 바꿔 주세요.</p>`,
    actions: `${btn('사만다 찾기', 'ble', { primary: true, disabled: !ble })}${btn('연습용 저울로 해 보기', 'sim', { sm: true })}`,
  };
}
const liveBox = () => `<div class="count live-g"><div class="big"><span id="lg">–</span><span class="u">g</span></div><div class="stable" id="ls"><i></i><span>기다리는 중</span></div></div>`;
const kbdTest = () => `<label class="kbd"><span><small>시험 칸 · 저울에 아무거나 올리고 사만다 버튼을 한 번</small><b id="lg">–</b></span><span id="ls" class="chip wait">기다림</span></label>`;

export const connectActions = {
  async ble() { await connectScale('ble'); toast('사만다와 연결됐어요'); refresh(); },
  async kbd() { await connectScale('kbd'); refresh(); },
  async sim() { await connectScale('sim'); toast('연습용 저울이에요. 실제 무게가 아니에요.'); refresh(); },
  async disconnect() { await disconnectScale(); refresh(); },
};
export function connectMount() {
  const offs = [onScale('reading', (r) => {
    const g = document.getElementById('lg'); const s = document.getElementById('ls');
    if (g) g.textContent = (S.scale?.kind === 'kbd' ? r.g.toFixed(1) + ' g' : r.g.toFixed(1));
    if (s) {
      if (S.scale?.kind === 'kbd') { s.className = 'chip ok'; s.textContent = '받음'; }
      else { s.classList.toggle('mv', !r.s); s.querySelector('span').textContent = r.s ? '멈췄어요' : '움직이는 중'; }
    }
  }), onScale('state', () => refresh())];
  return () => offs.forEach((f) => f());
}

export function connect() {
  const c = connectBody();
  let off;
  return {
    html: screen({ title: '사만다 연결', back: '#/settings', body: c.text + c.body, actions: c.actions }),
    on: connectActions,
    mount() { off = connectMount(); },
    unmount() { off && off(); },
  };
}

// ---------- 설정 ----------
export async function settings() {
  const last = await db.getMeta('last_backup_at');
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const needBackup = (days == null && S.records.length > 0) || days >= 6;
  const srv = await db.serverConfig();
  const f = F();
  const sc = S.scale;
  const head = needBackup
    ? say(days == null ? '아직 백업한 적이 없어요' : `백업한 지 ${days}일 됐어요`, '아이폰은 7일 동안 안 열면 기록이 지워질 수 있어요')
    : say('설정', last ? `마지막 백업 ${new Date(last).toLocaleDateString('ko-KR')}` : '');
  const body = `${head}
    ${btn('지금 백업하기', 'backup', { primary: needBackup, sm: true })}
    <section class="card list">
      <div class="sec-h">자주 쓰는 기능</div>
      ${Object.entries(FEATURES).map(([k, d]) => `<button type="button" class="row tog" data-act="feat" data-arg="${k}" aria-pressed="${!!f[k]}"><span><b>${d.label}</b><small>${d.desc}</small></span>${sw(f[k])}</button>`).join('')}
    </section>
    <section class="card list">
      <a class="row" href="#/connect"><span><b>사만다</b><small>${sc && sc.live ? esc(sc.name) : '연결 안 됨'}</small></span>${av('sam', eye(), 30, 'live')}</a>
      <a class="row" href="#/places"><span><b>세는 곳 · 품목 목록</b><small>${S.places.length}곳 · 품목 목록 ${S.catalogs.length}개</small></span><span>›</span></a>
      <button type="button" class="row" data-act="server"><span><b>내 서버 (선택)</b><small>여러 휴대폰 기록 합치기 · Wi-Fi 사만다</small></span><span class="hint">${srv?.on ? '켜짐' : '꺼짐'}</span></button>
      <button type="button" class="row" data-act="restore"><span><b>백업 파일 불러오기</b><small>기기를 바꿨을 때</small></span><span>›</span></button>
      <button type="button" class="row" data-act="reset"><span><b>처음부터 다시</b><small>이 휴대폰의 셈 기록을 모두 지워요</small></span><span>›</span></button>
    </section>
    <p class="hint center">셈 ${VERSION} · 기록은 이 휴대폰에만 저장돼요 · <a href="https://github.com/1dyne/sam-stock-audit-mate" target="_blank" rel="noopener">오픈소스</a></p>`;
  return {
    html: screen({ title: '설정', body, tab: 'settings' }),
    on: {
      async feat(k) { await saveSettings({ features: { ...F(), [k]: !F()[k] } }); refresh(); },
      async backup() {
        const data = await db.backup({ withPhotos: false });
        const d = new Date();
        const name = `셈_백업_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
        await shareFile(name, JSON.stringify(data), 'application/json');
        toast('백업 파일을 만들었어요. 파일 앱이나 메일에 저장해 두세요.');
        refresh();
      },
      async restore() {
        const file = await pickFile('.json,application/json');
        if (!file) return;
        const data = JSON.parse(await file.text());
        const ok = await sheet(`<p class="sheet-t">백업을 불러올까요?</p><p class="hint">${new Date(data.at || 0).toLocaleString('ko-KR')}에 만든 백업이에요. 지금 기록과 합쳐져요.</p>`, [{ label: '취소', value: 'no' }, { label: '불러오기', value: 'yes', primary: true }]);
        if (ok?.value !== 'yes') return;
        await db.restore(data); await load(); toast('불러왔어요'); go('#/');
      },
      async reset() {
        const ok = await sheet('<p class="sheet-t">셈 기록을 모두 지울까요?</p><p class="hint">되돌릴 수 없어요. 먼저 백업해 두세요.</p>', [{ label: '취소', value: 'no' }, { label: '모두 지우기', value: 'yes' }]);
        if (ok?.value !== 'yes') return;
        await disconnectScale(); await db.clearAll(); await load(); location.hash = '#/start/0';
      },
      async server() {
        const cur = (await db.serverConfig()) || { url: '', code: '', on: false };
        const r = await sheet(`<p class="sheet-t">내 서버 (선택)</p>
          <p class="hint">혼자 쓰면 필요 없어요. 각자 Cloudflare에 배포한 셈 서버 주소와 접속 코드를 넣으면 여러 휴대폰 기록이 합쳐져요.</p>
          <label class="field">서버 주소<input name="url" inputmode="url" placeholder="https://sam-stock-audit-mate.내이름.workers.dev" value="${esc(cur.url)}"></label>
          <label class="field">접속 코드<input name="code" value="${esc(cur.code)}" autocomplete="off"></label>
          <label class="field">Wi-Fi 사만다 번호 (선택)<input name="dev" placeholder="예: sam-07" value="${esc(cur.dev || '')}"></label>`,
        [{ label: '끄기', value: 'off' }, { label: '저장하고 켜기', value: 'on', primary: true }]);
        if (!r) return;
        const cfg = { url: r.form.url.trim(), code: r.form.code.trim(), dev: r.form.dev.trim(), on: r.value === 'on' && !!r.form.url.trim() };
        await db.setMeta('server', cfg);
        if (cfg.on) {
          try {
            const h = await fetch(cfg.url.replace(/\/$/, '') + '/api/health').then((x) => x.json());
            if (!h.configured) await db.api('/api/setup', { method: 'POST', body: JSON.stringify({ code: cfg.code }) });
            await db.sync(); await load();
            if (cfg.dev) await connectScale('server', { deviceId: cfg.dev });
            toast('서버와 연결했어요');
          } catch (e) { toast('서버 연결 실패: ' + e.message); }
        }
        refresh();
      },
    },
  };
}

// ---------- 세는 곳 ----------
export function places() {
  const rows = S.places.map((p) => {
    const cat = S.catalogs.find((c) => c.id === p.catalog_id);
    const shared = S.places.filter((x) => x.catalog_id === p.catalog_id).length > 1;
    return `<button type="button" class="row" data-act="use" data-arg="${p.id}"><span><b>${esc(p.name)}</b><small>${shared ? '공통 목록' : '이곳만 따로'} · ${esc(cat?.name || '')} · 품목 ${S.items.filter((i) => i.catalog_id === p.catalog_id).length}개</small></span>${p.id === S.place_id ? '<span class="chip ok">지금</span>' : '<span>›</span>'}</button>`;
  }).join('');
  return {
    html: screen({ title: '세는 곳', back: '#/settings', body: `${say('어디를 셀까요?', '세는 곳마다 기록이 따로 모여요')}<section class="card list">${rows || '<p class="hint">아직 없어요</p>'}</section>`, actions: btn('새 세는 곳', 'add', { primary: true }) }),
    on: {
      async use(id) { await setPlace(id); toast('바꿨어요'); back('#/'); },
      async add() { const p = await newPlaceSheet(); if (p) { await setPlace(p.id); back('#/'); } },
    },
  };
}

/** 세는 곳 만들기: 품목 목록을 "공통 목록 쓰기 / 이곳만 따로" 중에 고른다 */
export async function newPlaceSheet() {
  const shared = S.catalogs.filter((c) => c.shared);
  const r = await sheet(`<p class="sheet-t">새 세는 곳</p>
    <label class="field">이름<input name="name" placeholder="예: 2호점 창고"></label>
    <div class="sec-h">품목 목록</div>
    <label class="radio"><input type="radio" name="cat" value="shared" ${shared.length ? 'checked' : 'disabled'}><span><b>공통 목록 쓰기</b><small>${shared.length ? esc(shared[0].name) + '의 품목, 수량만 따로' : '아직 공통 목록이 없어요'}</small></span></label>
    <label class="radio"><input type="radio" name="cat" value="own" ${shared.length ? '' : 'checked'}><span><b>이곳만 따로</b><small>이 세는 곳에만 있는 품목</small></span></label>`,
  [{ label: '취소', value: '' }, { label: '만들기', value: 'ok', primary: true }]);
  if (!r || !r.form.name.trim()) return null;
  let catalogId;
  if (r.form.cat === 'shared' && shared.length) catalogId = shared[0].id;
  else catalogId = (await saveRow('catalogs', { name: r.form.name.trim() + ' 품목', shared: false })).id;
  return saveRow('places', { name: r.form.name.trim(), catalog_id: catalogId });
}
