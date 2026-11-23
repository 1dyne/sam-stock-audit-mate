// 지금 연결된 사만다 하나를 관리하고, 화면 속 사만다 눈 색을 측정기 LED와 맞춘다.
import { S, db, toast } from './core.js';
import { BleScale, KeyboardScale, ServerScale, SimScale } from './scale.js';

export const bus = new EventTarget();

function wire(sc) {
  const fwd = (type) => (e) => { bus.dispatchEvent(new CustomEvent(type, { detail: e.detail })); updateEyes(); };
  sc.addEventListener('reading', fwd('reading'));
  sc.addEventListener('state', fwd('state'));
  sc.addEventListener('event', (e) => {
    bus.dispatchEvent(new CustomEvent('event', { detail: e.detail }));
    const ev = e.detail;
    if (ev.ev === 'error' && ev.code === 'adc') toast('사만다 저울이 응답하지 않아요. 선을 확인해 주세요.');
  });
}

export async function connectScale(kind, opts = {}) {
  if (S.scale) { S.scale.disconnect(); S.scale = null; }
  let sc;
  if (kind === 'ble') sc = new BleScale();
  else if (kind === 'kbd') sc = new KeyboardScale();
  else if (kind === 'sim') sc = new SimScale();
  else if (kind === 'server') sc = new ServerScale(await db.serverConfig(), opts.deviceId);
  else return null;
  wire(sc);
  S.scale = sc;
  try { await sc.connect(); } catch (e) { S.scale = null; updateEyes(); throw e; }
  await db.setMeta('scale', { kind, deviceId: opts.deviceId || null });
  updateEyes();
  return sc;
}

export async function disconnectScale() {
  if (S.scale) S.scale.disconnect();
  S.scale = null;
  await db.setMeta('scale', null);
  updateEyes();
}

/** 다시 열었을 때 자동으로 이어 붙일 수 있는 연결(키보드·연습·서버). 블루투스는 버튼을 눌러야 함 */
export async function resumeScale() {
  const m = await db.getMeta('scale');
  if (!m) return null;
  if (m.kind === 'kbd' || m.kind === 'sim' || m.kind === 'server') {
    try { return await connectScale(m.kind, m); } catch { return null; }
  }
  return m.kind; // 'ble' → 다시 연결 버튼
}

export const eye = () => (S.scale ? S.scale.eye : 'off');

/** data-live 표시가 있는 사만다 그림의 눈 색을 바꾼다 */
export function updateEyes(root = document) {
  const e = eye();
  root.querySelectorAll('.av[data-who="sam"][data-live] img:not(.shut)').forEach((img) => {
    const src = `chars/sam-${e}.webp`;
    if (!img.getAttribute('src').endsWith(src)) img.setAttribute('src', src);
  });
}

/** 화면이 바뀌어도 이어지는 구독. unmount에서 반환 함수를 부른다 */
export function onScale(type, fn) {
  const h = (e) => fn(e.detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
}
