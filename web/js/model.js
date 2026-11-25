// 셈의 규칙과 계산. 화면·저장소와 무관한 순수 함수만 둔다(node --test로 검사).

export const VERSION = '0.3.0';

// ---------- 무엇을 세나요 → 세는 방법 (정해진 규칙, AI 판단 아님) ----------
export const KINDS = {
  small: { label: '작고 많은 부품', desc: '나사·너트·비즈·알약처럼 수백 개씩', method: 'weight' },
  loose: { label: '펼쳐 놓을 수 있는 낱개', desc: 'LED·커넥터·포장된 물건', method: 'photo' },
  box: { label: '같은 크기 박스', desc: '박스째 쌓아 둔 물건', method: 'box' },
  big: { label: '크거나 몇 개뿐인 것', desc: '장비·공구·큰 자재', method: 'manual' },
};

export const METHODS = {
  weight: { label: '무게', device: '사만다 · 무게', how: '개당 무게로 나눠서 셈', by: '무게로', plan: '사만다에 몇 개만 먼저 올려 한 개 무게를 잰 뒤, 전부 올리면 개수가 나와요' },
  photo: { label: '사진', device: '카메라 · 사진', how: '사진 속 물건을 셈', by: '사진으로', plan: '펼쳐 놓고 위에서 한 장 찍으면 셈이 세요' },
  box: { label: '박스', device: '카메라 · 입수량', how: '박스 수 × 입수량', by: '박스로', plan: '박스 몇 개인지만 넣으면 박스당 개수를 곱해요' },
  manual: { label: '직접', device: '직접', how: '눈으로 세고 숫자만 입력', by: '직접', plan: '눈으로 센 숫자만 넣어요' },
};

/** 세는 방법 → 그 방법을 고르게 되는 재고 종류(품목 화면에서 '어떤 재고인가요?'에 미리 표시) */
export function kindOfMethod(m) {
  return Object.keys(KINDS).find((k) => KINDS[k].method === m) || null;
}

export const FEATURES = {
  compare_last: { label: '지난번과 비교', desc: '지난번보다 얼마나 줄었는지' },
  min_qty: { label: '최소 수량 알림', desc: '이만큼 밑이면 "주문 필요"' },
  ledger: { label: '장부 수량과 비교', desc: '엑셀 장부를 불러와서 차이 보기' },
  daily_batch: { label: '날짜별로 묶기', desc: '센 날마다 기록을 한 묶음으로' },
  fill: { label: '나눠 담기', desc: '정한 개수씩 봉투에 덜어 담기' },
};

/** A1에서 고른 재고 종류에 맞춘 기능 기본값 */
export function defaultFeatures(kinds = []) {
  return { compare_last: true, min_qty: kinds.includes('small') || kinds.includes('loose'), ledger: false, daily_batch: true, fill: false };
}

export function methodsForKinds(kinds = []) {
  const out = [];
  for (const k of kinds) if (KINDS[k] && !out.includes(KINDS[k].method)) out.push(KINDS[k].method);
  return out;
}

/** 품목의 세는 방법. 사람이 정한 값이 우선, 없으면 품목 정보로 규칙 적용 */
export function methodFor(item, kinds = []) {
  if (item.method && METHODS[item.method]) return item.method;
  if (Number(item.pack_qty) > 1) return 'box';
  if (Number(item.unit_g) > 0) return 'weight';
  const m = methodsForKinds(kinds);
  return m[0] || 'manual';
}

/** 셈이 먼저 말하는 장치 제안 */
export function deviceAdvice(items, kinds = []) {
  const n = { weight: 0, photo: 0, box: 0, manual: 0 };
  for (const it of items) n[methodFor(it, kinds)]++;
  return n;
}

const METHOD_WORDS = { 무게: 'weight', 저울: 'weight', weight: 'weight', 사진: 'photo', 카메라: 'photo', photo: 'photo', camera: 'photo', 박스: 'box', box: 'box', 직접: 'manual', 사람: 'manual', manual: 'manual' };
export function parseMethod(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return METHOD_WORDS[s] || null;
}

// ---------- 무게로 세기 ----------
/** 저울 한 번 읽을 때의 오차 가정(g). 펌웨어 표시 단위 0.1g 기준 — 실기 미검증 */
export const SCALE_D = 0.1;
/** 펌웨어 안정 밴드(g) × 3 보다 가벼운 개당 무게는 오차가 큼 (SAM_SPEC §5-6) */
export const LIGHT_UNIT_G = 1.5;
export const MAX_G = 5000;

export function unitFromSample(netG, n) {
  if (!(n > 0) || !(netG > 0)) return null;
  return netG / n;
}

export function countFromWeight(grossG, unitG, tareG = 0) {
  if (!(unitG > 0)) return null;
  const net = grossG - (tareG || 0);
  const exact = net / unitG;
  const count = Math.max(0, Math.round(exact));
  return { net, exact, count, off: Math.abs(exact - Math.round(exact)) };
}

/** ± 몇 개: 샘플 무게 오차가 전체로 퍼지는 몫 + 전체 무게 오차 몫 */
export function countError(count, sampleN, unitG, d = SCALE_D) {
  if (!(unitG > 0) || !(sampleN > 0)) return null;
  return Math.max(1, Math.ceil((count * d) / (sampleN * unitG) + d / unitG));
}

/** 샘플을 늘리라는 제안(늘려서 오차가 줄어들 때만) */
export function sampleAdvice(count, sampleN, unitG, d = SCALE_D) {
  const now = countError(count, sampleN, unitG, d);
  const n2 = Math.max(30, sampleN * 3);
  if (n2 > count) return null;
  const then = countError(count, n2, unitG, d);
  return then < now ? { n: n2, err: then, now } : null;
}

/** 무게 측정 결과의 품질 경고 */
export function weightWarnings({ unitG, grossG, off }) {
  const w = [];
  if (grossG > MAX_G) w.push('heavy');
  if (unitG > 0 && unitG < LIGHT_UNIT_G) w.push('light');
  if (off != null && off > 0.25) w.push('half');
  return w;
}

export const WARN_TEXT = {
  heavy: '5kg를 넘었어요. 나눠서 재 주세요.',
  light: '한 개가 1.5g보다 가벼워서 오차가 커요. 샘플을 늘려 주세요.',
  half: '반 개쯤 남거나 모자라요. 다른 물건이 섞였는지 봐 주세요.',
};

/** 저장한 통 중 지금 무게와 ±2% 안인 것 */
export function matchContainer(containers, g) {
  let best = null;
  for (const c of containers) {
    const tol = Math.max(0.5, c.grams * 0.02);
    const d = Math.abs(c.grams - g);
    if (d <= tol && (!best || d < best.d)) best = { c, d };
  }
  return best && best.c;
}

// ---------- 담기 ----------
export function fillState(netG, unitG, target) {
  if (!(unitG > 0)) return null;
  const exact = netG / unitG;
  const count = Math.max(0, Math.round(exact));
  const diff = target - count;
  return { count, diff, state: diff > 0 ? 'more' : diff < 0 ? 'less' : 'ok' };
}

// ---------- 박스 ----------
export function countFromBoxes({ front = 0, depth = 1, layers = 1, packQty = 1, loose = 0 }) {
  const boxes = Math.max(0, front) * Math.max(1, depth) * Math.max(1, layers);
  return { boxes, total: boxes * Math.max(1, packQty) + Math.max(0, loose) };
}

// ---------- 사진 학습 ----------
/** 최근 5번 기준 정확도: 1 − 고친 개수 ÷ 센 개수 */
export function photoAccuracy(runs = []) {
  const r = runs.slice(-5);
  const counted = r.reduce((a, x) => a + (x.final || 0), 0);
  const edits = r.reduce((a, x) => a + (x.added || 0) + (x.removed || 0), 0);
  if (!counted) return null;
  return Math.max(0, 1 - edits / counted);
}

/** 쌓인 덩어리: 샘플 크기의 6배가 넘는 덩어리 수 (OpenTally 결과 r 기준) */
export function stackedBlobs(objects, exemplarR) {
  if (!exemplarR) return 0;
  return objects.filter((o) => (o.r || 0) ** 2 > 6 * exemplarR ** 2).length;
}

// ---------- 묶음 ----------
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayLabel(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// ---------- 비교 · 상태 ----------
/** 같은 세는 곳의 이전 묶음에서 그 품목의 마지막 값 */
export function previousRecord(records, rec) {
  let best = null;
  for (const r of records) {
    if (r.deleted || r.item_id !== rec.item_id || r.place_id !== rec.place_id || r.batch_id === rec.batch_id) continue;
    if (r.counted_at >= rec.counted_at) continue;
    if (!best || r.counted_at > best.counted_at) best = r;
  }
  return best;
}

/** 같은 묶음·품목에서 가장 최근 기록만 */
export function latestPerItem(records) {
  const m = new Map();
  for (const r of records) {
    if (r.deleted) continue;
    const k = r.batch_id + '|' + r.item_id;
    const cur = m.get(k);
    if (!cur || r.counted_at > cur.counted_at) m.set(k, r);
  }
  return [...m.values()];
}

/**
 * 기록 하나의 상태. 측정 품질(quality)과 비교 결과를 나눠 계산하고, 대표 하나를 고른다.
 * @returns {{key:string,label:string,tone:'ok'|'chk'|'bad', flags:object[], prev:object|null, diff:number|null}}
 */
export function recordStatus(rec, item = {}, prev = null, features = {}) {
  const flags = [];
  if (rec.quality === 'recount') flags.push({ key: 'recount', label: '다시 세기', tone: 'bad' });
  if (rec.quality === 'check') flags.push({ key: 'check', label: '확인 필요', tone: 'chk' });
  if (features.min_qty && Number(item.min_qty) > 0 && rec.qty < Number(item.min_qty)) flags.push({ key: 'order', label: '주문 필요', tone: 'chk' });
  if (features.ledger && item.ledger_qty !== '' && item.ledger_qty != null && Number.isFinite(Number(item.ledger_qty))) {
    const tol = rec.err || 0;
    if (Math.abs(rec.qty - Number(item.ledger_qty)) > tol) flags.push({ key: 'ledger', label: '장부와 다름', tone: 'chk' });
  }
  let diff = null;
  if (features.compare_last && prev) {
    diff = rec.qty - prev.qty;
    if (prev.qty > 0 && rec.qty < prev.qty * 0.7) flags.push({ key: 'drop', label: '많이 줄었음', tone: 'chk' });
  }
  const top = flags[0] || { key: 'done', label: '완료', tone: 'ok' };
  return { ...top, flags, prev, diff };
}

// ---------- 보내기 ----------
export function exportRows({ records, items, places, batches, features, edits = [] }) {
  const itemBy = new Map(items.map((i) => [i.id, i]));
  const placeBy = new Map(places.map((p) => [p.id, p]));
  const batchBy = new Map(batches.map((b) => [b.id, b]));
  const all = records.filter((r) => !r.deleted);
  const latest = latestPerItem(all).sort((a, b) => a.counted_at - b.counted_at);
  return latest.map((r) => {
    const it = itemBy.get(r.item_id) || {};
    const prev = previousRecord(all, r);
    const st = recordStatus(r, it, prev, features);
    const reason = edits.filter((e) => e.record_id === r.id).map((e) => e.reason).filter(Boolean).join(' / ');
    const row = {
      세는곳: placeBy.get(r.place_id)?.name || '',
      묶음: batchBy.get(r.batch_id)?.label || '',
      코드: it.code || '',
      품목: it.name || r.item_name || '',
      수량: r.qty,
      단위: it.unit || '개',
      방법: METHODS[r.method]?.label || r.method,
      오차: r.err ? `±${r.err}` : '',
      상태: st.flags.length ? st.flags.map((f) => f.label).join(', ') : '완료',
    };
    if (features.compare_last) { row.지난번 = prev ? prev.qty : ''; row.차이 = st.diff ?? ''; }
    if (features.min_qty) row.최소수량 = it.min_qty ?? '';
    if (features.ledger) row.장부수량 = it.ledger_qty ?? '';
    row.보관위치 = it.location || '';
    row.센시각 = new Date(r.counted_at).toLocaleString('ko-KR');
    row.고친이유 = reason;
    return row;
  });
}
