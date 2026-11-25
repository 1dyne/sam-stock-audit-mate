import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  methodFor, deviceAdvice, defaultFeatures, parseMethod, unitFromSample, countFromWeight, countError, sampleAdvice,
  weightWarnings, matchContainer, fillState, countFromBoxes, photoAccuracy, stackedBlobs, previousRecord, latestPerItem,
  recordStatus, exportRows, dayKey,
} from '../web/js/model.js';

test('재고 종류 → 세는 방법 (정해진 규칙)', () => {
  assert.equal(methodFor({}, ['small']), 'weight');
  assert.equal(methodFor({}, ['loose', 'small']), 'photo');
  assert.equal(methodFor({ pack_qty: 5 }, ['small']), 'box');
  assert.equal(methodFor({ unit_g: 2 }, ['big']), 'weight');
  assert.equal(methodFor({ method: 'manual', unit_g: 2 }, ['small']), 'manual');
  assert.equal(methodFor({}, []), 'manual');
  assert.deepEqual(deviceAdvice([{ method: 'weight' }, { method: 'photo' }, {}], ['small']), { weight: 2, photo: 1, box: 0, manual: 0 });
  assert.equal(parseMethod('저울'), 'weight');
  assert.equal(parseMethod(' 사진 '), 'photo');
  assert.equal(parseMethod('뭐'), null);
  assert.equal(defaultFeatures(['big']).min_qty, false);
  assert.equal(defaultFeatures(['small']).fill, false);
});

test('무게로 세기: 개수 = (무게 − 통) ÷ 개당 무게', () => {
  const u = unitFromSample(9.53, 10);
  assert.ok(Math.abs(u - 0.953) < 1e-9);
  const c = countFromWeight(48.2 + 1284 * 0.953, 0.953, 48.2);
  assert.equal(c.count, 1284);
  assert.ok(c.off < 0.01);
  assert.equal(countFromWeight(10, 0), null);
  assert.equal(countFromWeight(40, 1, 48).count, 0);
  assert.equal(unitFromSample(0, 10), null);
});

test('오차: 샘플이 많을수록 줄어든다 (0.1g 저울, 0.953g 부품)', () => {
  assert.equal(countError(1284, 10, 0.953), 14); // 1284×0.1/(10×0.953)=13.5 + 0.1 → 14
  assert.equal(countError(1284, 30, 0.953), 5);
  const a = sampleAdvice(1284, 10, 0.953);
  assert.deepEqual(a, { n: 30, err: 5, now: 14 });
  assert.equal(sampleAdvice(20, 10, 5), null); // 30개가 전체보다 많으면 제안 안 함
});

test('무게 경고 · 통 알아보기', () => {
  assert.deepEqual(weightWarnings({ unitG: 0.9, grossG: 100, off: 0.1 }), ['light']);
  assert.deepEqual(weightWarnings({ unitG: 3, grossG: 5200, off: 0.4 }), ['heavy', 'half']);
  const cs = [{ id: 'a', grams: 48.2 }, { id: 'b', grams: 120 }];
  assert.equal(matchContainer(cs, 48.6).id, 'a');
  assert.equal(matchContainer(cs, 60), null);
  assert.equal(matchContainer(cs, 121.5).id, 'b');
});

test('담기: 더 / 맞아요 / 빼기', () => {
  assert.deepEqual(fillState(37 * 0.953, 0.953, 50), { count: 37, diff: 13, state: 'more' });
  assert.equal(fillState(50 * 0.953, 0.953, 50).state, 'ok');
  assert.deepEqual(fillState(52 * 0.953, 0.953, 50), { count: 52, diff: -2, state: 'less' });
});

test('박스: 앞줄 × 안쪽 × 층 × 입수량 + 낱개', () => {
  assert.deepEqual(countFromBoxes({ front: 4, depth: 2, layers: 3, packQty: 5, loose: 3 }), { boxes: 24, total: 123 });
  assert.equal(countFromBoxes({ front: 0, packQty: 5, loose: 2 }).total, 2);
});

test('사진 학습 정확도 · 쌓인 덩어리', () => {
  assert.equal(photoAccuracy([]), null);
  assert.equal(photoAccuracy([{ final: 50, added: 1, removed: 1 }, { final: 50, added: 0, removed: 0 }]), 0.98);
  assert.equal(stackedBlobs([{ r: 10 }, { r: 30 }, { r: 25 }], 10), 2);
});

test('지난번 · 상태(측정 품질과 비교 결과를 나눔)', () => {
  const recs = [
    { id: 'a', item_id: 'i', place_id: 'p', batch_id: 'b1', qty: 100, counted_at: 1 },
    { id: 'b', item_id: 'i', place_id: 'p', batch_id: 'b1', qty: 120, counted_at: 2 },
    { id: 'c', item_id: 'i', place_id: 'p', batch_id: 'b2', qty: 60, counted_at: 3 },
    { id: 'd', item_id: 'i', place_id: 'q', batch_id: 'b3', qty: 5, counted_at: 4 },
  ];
  assert.equal(previousRecord(recs, recs[2]).id, 'b');
  assert.equal(previousRecord(recs, recs[3]), null);
  assert.deepEqual(latestPerItem(recs).map((r) => r.id).sort(), ['b', 'c', 'd']);
  const all = { compare_last: true, min_qty: true, ledger: true };
  let s = recordStatus(recs[2], { min_qty: 50 }, recs[1], all);
  assert.equal(s.key, 'drop'); assert.equal(s.diff, -60);
  s = recordStatus(recs[2], { min_qty: 80 }, recs[1], all);
  assert.equal(s.key, 'order'); assert.equal(s.flags.length, 2);
  s = recordStatus({ ...recs[2], quality: 'recount' }, {}, null, all);
  assert.equal(s.tone, 'bad');
  s = recordStatus({ qty: 98, err: 3 }, { ledger_qty: 100 }, null, all);
  assert.equal(s.key, 'done');
  s = recordStatus({ qty: 90, err: 3 }, { ledger_qty: 100 }, null, all);
  assert.equal(s.key, 'ledger');
  s = recordStatus(recs[2], { min_qty: 80 }, recs[1], {});
  assert.equal(s.key, 'done'); // 꺼 둔 기능은 판단하지 않음
});

test('보내기: 켜 둔 기능의 열만, 같은 묶음은 최신 1건', () => {
  const rows = exportRows({
    records: [
      { id: 'r1', item_id: 'i1', place_id: 'p', batch_id: 'b', qty: 10, method: 'weight', err: 2, counted_at: 1 },
      { id: 'r2', item_id: 'i1', place_id: 'p', batch_id: 'b', qty: 12, method: 'weight', err: 2, counted_at: 2 },
    ],
    items: [{ id: 'i1', name: '볼트', code: 'B1', unit: '개', min_qty: 20 }],
    places: [{ id: 'p', name: '작업실' }], batches: [{ id: 'b', label: '11월 23일' }],
    features: { compare_last: false, min_qty: true, ledger: false },
    edits: [{ record_id: 'r2', reason: '다시 셈' }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].수량, 12);
  assert.equal(rows[0].상태, '주문 필요');
  assert.equal(rows[0].고친이유, '다시 셈');
  assert.ok(!('지난번' in rows[0]) && !('장부수량' in rows[0]) && '최소수량' in rows[0]);
  assert.match(dayKey(Date.UTC(2026, 10, 23, 3)), /^2026-11-2[34]$/);
});
