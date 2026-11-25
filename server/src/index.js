// 셈 서버 (선택) — Cloudflare Worker 무료 범위
//  혼자 쓰면 필요 없다. 각자 자기 계정에 배포해서 두 가지만 맡긴다.
//   ① 여러 휴대폰 기록 합치기: D1 한 표(rows)에 앱의 행을 그대로 저장, 마지막에 고친 것이 이김
//   ② Wi-Fi 사만다 무게 전달: 펌웨어 POST /api/v1/readings(SAM_SPEC §4) → Durable Object → 앱 WebSocket
//  앱 화면(web/)도 같이 올라가서 서버 주소로 바로 열 수 있다.
const VERSION = '0.3.0';
const TABLES = new Set(['places', 'catalogs', 'items', 'unit_weights', 'containers', 'photo_profiles', 'batches', 'records', 'record_edits', 'fills', 'photos']);
const SCHEMA = 2;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-sam-code,authorization,x-sam-device',
  'access-control-max-age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
const err = (msg, status = 400) => json({ error: msg }, status);

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER, srv_ts INTEGER NOT NULL, PRIMARY KEY (tbl, id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_rows_srv ON rows(srv_ts)'),
    env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema',?)").bind(String(SCHEMA)),
  ]);
  schemaReady = true;
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function getSetting(env, key) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return r ? r.value : null;
}
/** 접속 코드 확인. 앱은 x-sam-code(또는 WebSocket ?code=), 사만다는 Authorization: Bearer <코드> */
async function checkCode(env, code) {
  const salt = await getSetting(env, 'salt');
  const hash = await getSetting(env, 'code_hash');
  if (!salt || !hash) return { ok: false, setup: true };
  return { ok: timingSafeEq(await sha256(salt + ':' + (code || '')), hash) };
}

// ---------- 동기화 ----------
const MAX = 500;
async function pull(env, since) {
  const { results } = await env.DB.prepare(`SELECT tbl, data, srv_ts FROM rows WHERE srv_ts > ? ORDER BY srv_ts LIMIT ${MAX + 1}`).bind(since).all();
  const more = results.length > MAX;
  const list = results.slice(0, MAX);
  const tables = {};
  for (const r of list) (tables[r.tbl] ||= []).push(JSON.parse(r.data));
  return { tables, cursor: list.length ? list[list.length - 1].srv_ts : since, more };
}
async function push(env, tables) {
  const base = Date.now() * 1000; // 행마다 고유한 커서(ms×1000 + 순번)
  let seq = 0, n = 0;
  const stmts = [];
  for (const [t, rows] of Object.entries(tables || {})) {
    if (!TABLES.has(t) || !Array.isArray(rows)) continue;
    for (const row of rows.slice(0, MAX)) {
      if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 64) continue;
      const data = JSON.stringify(row);
      if (data.length > 1_500_000) continue;
      stmts.push(env.DB.prepare(`INSERT INTO rows (tbl,id,data,updated_at,srv_ts) VALUES (?,?,?,?,?)
        ON CONFLICT(tbl,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, srv_ts=excluded.srv_ts
        WHERE COALESCE(excluded.updated_at,0) >= COALESCE(rows.updated_at,0)`).bind(t, row.id, data, Number(row.updated_at) || 0, base + seq++));
    }
  }
  for (let i = 0; i < stmts.length; i += 50) { const res = await env.DB.batch(stmts.slice(i, i + 50)); for (const r of res) n += r.meta?.changes || 0; }
  return { applied: n };
}

const hub = (env) => env.SCALE_HUB.get(env.SCALE_HUB.idFromName('hub'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (!p.startsWith('/api/') && !p.startsWith('/ws/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      await ensureSchema(env);
      return await api(request, env, url, p);
    } catch (e) {
      console.error(e);
      return err('서버 오류: ' + (e?.message || e), 500);
    }
  },
};

async function api(request, env, url, p) {
  const m = request.method;
  if (p === '/api/health') return json({ ok: true, name: 'sem', version: VERSION, configured: !!(await getSetting(env, 'code_hash')), time: Date.now() });

  if (p === '/api/setup' && m === 'POST') {
    if (await getSetting(env, 'code_hash')) return err('이미 접속 코드가 정해져 있어요.', 409);
    const { code } = await request.json().catch(() => ({}));
    if (typeof code !== 'string' || code.length < 4) return err('접속 코드는 4자 이상이어야 해요.');
    const salt = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('salt',?)").bind(salt),
      env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('code_hash',?)").bind(await sha256(salt + ':' + code)),
    ]);
    return json({ ok: true });
  }

  // 사만다(Wi-Fi 모드) → 서버. 계약: SAM_SPEC.md §4 (v1)
  if (p === '/api/v1/readings' && m === 'POST') {
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const a = await checkCode(env, bearer);
    if (!a.ok) return err('인증 실패', 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.device_id !== 'string' || typeof body.weight_g !== 'number') return err('형식 오류', 400);
    const r = await hub(env).fetch('https://hub/ingest', { method: 'POST', body: JSON.stringify(body) });
    return json(await r.json());
  }

  const code = request.headers.get('x-sam-code') || url.searchParams.get('code') || '';
  const a = await checkCode(env, code);
  if (!a.ok) return err(a.setup ? '처음 설정이 필요해요.' : '접속 코드가 틀렸어요.', a.setup ? 412 : 401);

  if (p === '/ws/app') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return err('WebSocket 전용', 426);
    return hub(env).fetch(new Request('https://hub/app?device=' + encodeURIComponent(url.searchParams.get('device') || ''), request));
  }
  if (p === '/api/scales' && m === 'GET') return hub(env).fetch('https://hub/list');
  if (p === '/api/sync' && m === 'GET') return json(await pull(env, Number(url.searchParams.get('since') || 0)));
  if (p === '/api/sync' && m === 'POST') { const body = await request.json(); return json(await push(env, body.tables)); }
  return err('없는 주소', 404);
}

// ---------- Durable Object: 사만다 무게 전달 ----------
// 사만다가 POST로 보낸 무게를 그 번호를 구독한 앱에 WebSocket으로 넘기고,
// 앱의 명령(tare, identify)은 큐에 넣었다가 다음 POST 응답에 실어 보낸다. D1에는 쓰지 않는다.
export class ScaleHub {
  constructor(state, env) { this.state = state; this.env = env; this.devices = new Map(); this.seq = 0; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ingest') {
      const b = await request.json();
      const id = b.device_id;
      const d = this.devices.get(id) || { cmds: [] };
      d.at = Date.now();
      d.last = b;
      if (b.ack) d.cmds = d.cmds.filter((c) => c.id !== b.ack);
      this.devices.set(id, d);
      const usable = b.state === 'measuring' && b.stable && b.calibrated && b.adc_ok;
      this.send(id, { t: 'r', g: b.weight_g, s: usable ? 1 : 0, state: b.state, tare_count: b.tare_count, at: d.at });
      const cmds = d.cmds; d.cmds = []; // 한 번 내려보내면 큐에서 뺀다
      return Response.json({ ok: true, cmds });
    }
    if (url.pathname === '/list') {
      const now = Date.now();
      return Response.json({ scales: [...this.devices.entries()].map(([id, d]) => ({ id, online: now - d.at < 5000, at: d.at, state: d.last?.state, fw: d.last?.fw_version })) }, { headers: CORS });
    }
    if (url.pathname === '/app') {
      const dev = url.searchParams.get('device') || '';
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server, ['dev:' + dev]);
      server.serializeAttachment({ dev });
      const d = this.devices.get(dev);
      if (d && Date.now() - d.at < 5000) server.send(JSON.stringify({ t: 'r', g: d.last.weight_g, s: 0, state: d.last.state, tare_count: d.last.tare_count, at: d.at }));
      else server.send(JSON.stringify({ t: 'offline' }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  send(dev, msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets('dev:' + dev)) { try { ws.send(s); } catch { /* */ } }
  }

  async webSocketMessage(ws, message) {
    const { dev } = ws.deserializeAttachment() || {};
    let m; try { m = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); } catch { return; }
    if (!dev || !['tare', 'identify'].includes(m.cmd)) return;
    const d = this.devices.get(dev) || { cmds: [], at: 0 };
    d.cmds.push({ id: 'c' + (++this.seq), type: m.cmd });
    this.devices.set(dev, d);
  }
  async webSocketClose(ws) { try { ws.close(1000, 'bye'); } catch { /* */ } }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}
