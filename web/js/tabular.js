// 표 파일 읽기·쓰기: CSV, XLSX(읽기·쓰기). 외부 라이브러리 없음.
//  XLSX 읽기는 DecompressionStream, 쓰기는 압축하지 않는 ZIP(저장 방식)으로 만든다.
import { parseMethod } from './model.js';

// ---------- CSV ----------
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

export function csvField(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // 수식 주입 방지
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 엑셀에서 한글이 깨지지 않게 BOM을 붙인다 */
export function toCSV(rows) {
  return '﻿' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// ---------- XLSX (첫 번째 시트만) ----------
export async function parseXLSX(arrayBuffer) {
  const files = await unzip(new Uint8Array(arrayBuffer));
  const dec = new TextDecoder();
  const shared = files['xl/sharedStrings.xml'] ? parseShared(dec.decode(files['xl/sharedStrings.xml'])) : [];
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))[0];
  if (!sheetName) throw new Error('엑셀 파일에서 시트를 찾지 못했습니다.');
  return parseSheet(dec.decode(files[sheetName]), shared);
}

function unxml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
function parseShared(xml) {
  const out = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const tm of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += tm[1];
    out.push(unxml(t));
  }
  return out;
}
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row = [];
    const body = rm[1] || '';
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const inner = cm[2] || '';
      let v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (type === 's') v = shared[+v];
      else if (type === 'inlineStr') v = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
      v = v == null ? '' : unxml(String(v));
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push('');
      row[idx] = v;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀(xlsx) 파일이 아닙니다. CSV로 저장해서 올려 보세요.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name)) continue;
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    out[name] = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
  }
  return out;
}

// ---------- 표 → 품목 ----------

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s_()]/g, '');

// 품목 열 이름(여러 표기를 받음)
export const ITEM_HEADERS = {
  code: ['코드', '품목코드', '품번', 'sku', 'code'],
  name: ['품목', '이름', '품목명', '품명', 'name'],
  unit: ['단위', 'unit'],
  method: ['세는방법', '방법', '측정방식', '기본측정방식', 'method'],
  unit_g: ['개당무게', '개당무게g', '단위무게', 'unitweight', 'unit_g'],
  pack_qty: ['입수량', '박스당', '박스입수', 'packqty'],
  min_qty: ['최소수량', '안전재고', '정수', 'minqty'],
  ledger_qty: ['장부수량', '장부', '재고수량', 'ledger', 'bookqty'],
  location: ['보관위치', '위치', 'location'],
};
const NUM = new Set(['unit_g', 'pack_qty', 'min_qty', 'ledger_qty']);

/**
 * 첫 행을 머리글로 보고 품목 배열로 바꾼다. 이름만 있어도 된다.
 * @returns {{items:object[], errors:{row:number,msg:string}[], unknownHeaders:string[]}}
 */
export function rowsToItems(rows) {
  rows = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) return { items: [], errors: [{ row: 0, msg: '빈 파일이에요.' }], unknownHeaders: [] };
  const map = {};
  const unknownHeaders = [];
  rows[0].forEach((h, i) => {
    const f = Object.entries(ITEM_HEADERS).find(([, names]) => names.map(norm).includes(norm(h)));
    if (f && !Object.values(map).includes(f[0])) map[i] = f[0]; else if (String(h ?? '').trim()) unknownHeaders.push(String(h));
  });
  const items = [], errors = [];
  if (!Object.values(map).includes('name') && !Object.values(map).includes('code')) {
    return { items, errors: [{ row: 1, msg: '"품목" 또는 "코드" 열이 없어요.' }], unknownHeaders };
  }
  rows.slice(1).forEach((r, k) => {
    const it = {};
    for (const [i, f] of Object.entries(map)) {
      let v = String(r[i] ?? '').trim();
      if (f === 'method') v = parseMethod(v);
      else if (NUM.has(f)) {
        if (v === '') v = null;
        else {
          const n = Number(v.replace(/,/g, ''));
          if (Number.isNaN(n)) { errors.push({ row: k + 2, msg: `${rows[0][i]}: 숫자가 아니에요 (${v})` }); v = null; } else v = n;
        }
      }
      if (v !== null && v !== '') it[f] = v;
    }
    if (!it.name && !it.code) return;
    if (!it.name) it.name = it.code;
    items.push(it);
  });
  return { items, errors, unknownHeaders };
}

export function itemTemplateCSV() {
  return toCSV([
    ['코드', '품목', '단위', '세는 방법', '개당 무게(g)', '입수량', '최소 수량', '장부 수량', '보관 위치'],
    ['B-M3-8', 'M3 볼트 8mm', '개', '무게', 0.953, '', 500, '', '서랍 B-3'],
    ['LED-3R', '3mm LED 빨강', '개', '사진', '', '', 30, '', '서랍 A-1'],
    ['P-A4', 'A4 복사지', '권', '박스', '', 5, 10, '', '창고'],
    ['T-IRON', '납땜 인두', '개', '직접', '', '', '', '', '작업대'],
  ]);
}

// ---------- XLSX 쓰기 ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** 압축 없는 ZIP. files = [{name, data:Uint8Array}] */
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const xesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/** rows: 2차원 배열(첫 행 머리글). 숫자는 숫자 칸, 나머지는 글자 칸 */
export function writeXLSX(rows, sheetName = '셈') {
  const enc = new TextEncoder();
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
    if (v === null || v === undefined || v === '') return '';
    return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const widths = (rows[0] || []).map((_, ci) => Math.min(40, Math.max(6, ...rows.map((r) => String(r[ci] ?? '').length * 1.6 + 2))));
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(1)}" customWidth="1"/>`).join('')}</cols>` : '';
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xesc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipStore(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })));
}

/** 객체 배열 → 2차원 배열(첫 행 머리글) */
export function objectsToRows(objs) {
  const keys = [];
  for (const o of objs) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  return [keys, ...objs.map((o) => keys.map((k) => o[k] ?? ''))];
}
