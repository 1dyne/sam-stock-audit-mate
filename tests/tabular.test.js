import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, toCSV, parseXLSX, rowsToItems, itemTemplateCSV, writeXLSX, objectsToRows } from '../web/js/tabular.js';

test('CSV: 따옴표·줄바꿈·세미콜론·BOM', () => {
  assert.deepEqual(parseCSV('﻿a,b\n"x,1","y ""q"""\n'), [['a', 'b'], ['x,1', 'y "q"']]);
  assert.deepEqual(parseCSV('a;b\r\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCSV('a\tb\n"멀티\n라인"\t2'), [['a', 'b'], ['멀티\n라인', '2']]);
});

test('CSV 쓰기: BOM + 수식 주입 방지', () => {
  const s = toCSV([['=SUM(A1)', '-5', 'a,b']]);
  assert.ok(s.startsWith('﻿'));
  assert.ok(s.includes("'=SUM(A1)"));
  assert.ok(s.includes('"a,b"'));
});

test('품목 양식 CSV를 다시 읽으면 4개, 방법·숫자 해석', () => {
  const { items, errors } = rowsToItems(parseCSV(itemTemplateCSV()));
  assert.equal(errors.length, 0);
  assert.equal(items.length, 4);
  assert.equal(items[0].method, 'weight');
  assert.equal(items[0].unit_g, 0.953);
  assert.equal(items[0].min_qty, 500);
  assert.equal(items[2].pack_qty, 5);
  assert.equal(items[3].method, 'manual');
});

test('이름 열 하나만 있어도 된다 · 빈 줄 무시 · 숫자 오류 표시', () => {
  const r = rowsToItems([['품명'], ['나사'], [''], ['너트']]);
  assert.deepEqual(r.items.map((i) => i.name), ['나사', '너트']);
  const e = rowsToItems([['품목', '최소 수량'], ['나사', '많이']]);
  assert.equal(e.errors.length, 1);
  assert.equal(rowsToItems([['수량'], ['1']]).items.length, 0);
});

test('XLSX 쓰기 → 다시 읽기 (한글·숫자·빈칸·특수문자)', async () => {
  const rows = objectsToRows([{ 품목: 'M3 볼트 <8mm> & "와셔"', 수량: 1284, 오차: '±14' }, { 품목: '인두', 수량: 6 }]);
  const buf = writeXLSX(rows, '작업실');
  assert.equal(buf[0], 0x50); assert.equal(buf[1], 0x4b);
  const back = await parseXLSX(buf.buffer);
  assert.deepEqual(back[0], ['품목', '수량', '오차']);
  assert.equal(back[1][0], 'M3 볼트 <8mm> & "와셔"');
  assert.equal(Number(back[1][1]), 1284);
  assert.equal(back[2][0], '인두');
});

test('XLSX(openpyxl로 만든 실제 파일) 읽기', async () => {
  const buf = readFileSync(new URL('./fixtures/items.xlsx', import.meta.url));
  const rows = await parseXLSX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(rows.length >= 2);
  const { items } = rowsToItems(rows);
  assert.ok(items.length >= 1);
});
