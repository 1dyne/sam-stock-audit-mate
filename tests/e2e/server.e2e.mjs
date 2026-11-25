// 서버(선택) 끝-끝 테스트: wrangler dev를 띄우고
//  접속 코드 설정 → 두 기기 동기화(마지막에 고친 것이 이김) → 사만다 POST(계약 v1) → 앱 WebSocket 수신 → 영점 명령 왕복
// 실행: node tests/e2e/server.e2e.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
// 이미 떠 있는 서버가 있으면(REUSE=1) 그대로 쓰고, 없으면 wrangler dev를 띄운다
const dev = process.env.REUSE ? null : spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', '.wrangler/e2e-state'], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
dev?.stdout.on('data', (d) => { log += d; });
dev?.stderr.on('data', (d) => { log += d; });
const ok = (s) => console.log('✓', s);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return r.json(); } catch { /* */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('wrangler dev가 뜨지 않음\n' + log.slice(-2000));
}
const call = (path, opts = {}, code = 'meetup-1128') => fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', 'x-sam-code': code, ...(opts.headers || {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

try {
  const h = await waitUp();
  ok(`서버 시작 (version ${h.version}, configured=${h.configured})`);
  if (!h.configured) assert.equal((await call('/api/setup', { method: 'POST', body: JSON.stringify({ code: 'meetup-1128' }) })).status, 200);
  assert.equal((await call('/api/sync', {}, 'wrong')).status, 401);
  ok('접속 코드 설정, 틀린 코드는 401');

  const t0 = Date.now();
  await call('/api/sync', { method: 'POST', body: JSON.stringify({ tables: { items: [{ id: 'it1', name: 'M3 볼트', updated_at: t0 }], records: [{ id: 'r1', item_id: 'it1', qty: 1284, updated_at: t0 }] } }) });
  await call('/api/sync', { method: 'POST', body: JSON.stringify({ tables: { items: [{ id: 'it1', name: '옛 이름', updated_at: t0 - 5000 }] } }) });
  await call('/api/sync', { method: 'POST', body: JSON.stringify({ tables: { records: [{ id: 'r1', item_id: 'it1', qty: 1280, updated_at: t0 + 1000 }], nope: [{ id: 'x' }] } }) });
  const pulled = await call('/api/sync?since=0');
  assert.equal(pulled.body.tables.items.find((x) => x.id === 'it1').name, 'M3 볼트');
  assert.equal(pulled.body.tables.records.find((x) => x.id === 'r1').qty, 1280);
  assert.equal(pulled.body.tables.nope, undefined);
  ok('동기화: 늦게 고친 값이 이김(1284→1280), 옛 값은 무시, 모르는 표는 거부');

  // 앱이 sam-07을 구독
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/app?code=meetup-1128&device=sam-07`);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(msgs[0].t, 'offline');

  const reading = (g, stable, extra = {}) => fetch(BASE + '/api/v1/readings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer meetup-1128', 'x-sam-device': 'sam-07' },
    body: JSON.stringify({ v: 1, device_id: 'sam-07', device_no: 7, mac: 'D4F98D012A3B', fw_version: '0.2.0', seq: 1, ts_ms: 1000, weight_g: g, stable, raw: -1, calibrated: true, adc_ok: true, state: 'measuring', tare_count: 1, rssi: -50, ...extra }) }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));
  const bad = await fetch(BASE + '/api/v1/readings', { method: 'POST', headers: { authorization: 'Bearer nope' }, body: '{}' });
  assert.equal(bad.status, 401);
  let r = await reading(125.34, false);
  assert.equal(r.status, 200); assert.deepEqual(r.body.cmds, []);
  r = await reading(125.3, true);
  await new Promise((res) => setTimeout(res, 300));
  const rs = msgs.filter((m) => m.t === 'r');
  assert.equal(rs.length, 2);
  assert.equal(rs[0].s, 0); assert.equal(rs[1].s, 1); assert.equal(rs[1].g, 125.3);
  ok('사만다 POST(계약 v1) → 앱 WebSocket: 흔들림 s=0, 안정 s=1, 틀린 키 401');

  await reading(10, true, { calibrated: false });
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(msgs.filter((m) => m.t === 'r').at(-1).s, 0);
  ok('보정 안 된 값은 기록 불가(s=0)');

  ws.send(JSON.stringify({ cmd: 'tare' }));
  await new Promise((res) => setTimeout(res, 300));
  r = await reading(0, true);
  assert.equal(r.body.cmds.length, 1); assert.equal(r.body.cmds[0].type, 'tare');
  r = await reading(0, true, { ack: r.body.cmds[0].id });
  assert.deepEqual(r.body.cmds, []);
  ok('앱 영점 명령 → 다음 POST 응답에 tare → 한 번만 내려감');

  const list = await call('/api/scales');
  assert.equal(list.body.scales[0].id, 'sam-07'); assert.equal(list.body.scales[0].online, true);
  ok('연결된 사만다 목록');
  const cors = await fetch(BASE + '/api/sync', { method: 'OPTIONS' });
  assert.equal(cors.headers.get('access-control-allow-origin'), '*');
  ok('다른 주소(GitHub Pages)의 앱에서 부를 수 있음(CORS)');
  ws.close();
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  dev?.kill('SIGTERM');
}
