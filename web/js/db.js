// 기기 안 저장소(IndexedDB). 서버가 없어도 모든 기능이 여기서 동작한다.
// 서버(선택)를 켜면 같은 행을 그대로 주고받아 여러 휴대폰 기록을 합친다.

export const TABLES = ['places', 'catalogs', 'items', 'unit_weights', 'containers', 'photo_profiles', 'batches', 'records', 'record_edits', 'fills', 'photos'];
const DB_NAME = 'sem';
const DB_VER = 1;
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const t of TABLES) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(stores, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then((v) => { out = v; }, rej);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function all(table) {
  const rows = await tx(table, 'readonly', (t) => wrap(t.objectStore(table).getAll()));
  return rows.filter((r) => !r.deleted);
}
export function get(table, id) { return tx(table, 'readonly', (t) => wrap(t.objectStore(table).get(id))); }

export async function put(table, row) {
  const r = { ...row, id: row.id || uid(), updated_at: Date.now(), _dirty: 1 };
  await tx(table, 'readwrite', (t) => wrap(t.objectStore(table).put(r)));
  changed();
  return r;
}
export async function putMany(table, rows) {
  const now = Date.now();
  const out = rows.map((row) => ({ ...row, id: row.id || uid(), updated_at: now, _dirty: 1 }));
  await tx(table, 'readwrite', (t) => Promise.all(out.map((r) => wrap(t.objectStore(table).put(r)))));
  changed();
  return out;
}
export async function remove(table, id) {
  const r = await get(table, id);
  if (r) await put(table, { ...r, deleted: 1 });
}

export function getMeta(k) { return tx('meta', 'readonly', (t) => wrap(t.objectStore('meta').get(k))); }
export function setMeta(k, v) { return tx('meta', 'readwrite', (t) => wrap(t.objectStore('meta').put(v, k))); }

export async function clearAll() {
  await tx([...TABLES, 'meta'], 'readwrite', (t) => Promise.all([...TABLES, 'meta'].map((s) => wrap(t.objectStore(s).clear()))));
  changed();
}

// ---------- 백업 · 복원 ----------
export async function backup({ withPhotos = false } = {}) {
  const out = { app: 'sem', format: 1, at: Date.now(), meta: {}, tables: {} };
  for (const t of TABLES) {
    if (t === 'photos' && !withPhotos) continue;
    out.tables[t] = await tx(t, 'readonly', (x) => wrap(x.objectStore(t).getAll()));
  }
  for (const k of ['settings', 'place_id']) out.meta[k] = await getMeta(k);
  await setMeta('last_backup_at', out.at);
  return out;
}

export async function restore(data) {
  if (!data || data.app !== 'sem' || !data.tables) throw new Error('셈 백업 파일이 아니에요.');
  await tx([...TABLES, 'meta'], 'readwrite', async (t) => {
    for (const name of TABLES) {
      const rows = data.tables[name];
      if (!Array.isArray(rows)) continue;
      const s = t.objectStore(name);
      await Promise.all(rows.filter((r) => r && typeof r.id === 'string').map((r) => wrap(s.put(r))));
    }
    for (const [k, v] of Object.entries(data.meta || {})) if (v !== undefined) await wrap(t.objectStore('meta').put(v, k));
  });
  changed();
}

// ---------- 변경 알림 · 서버 동기화(선택) ----------
export const events = new EventTarget();
let syncTimer;
function changed() {
  events.dispatchEvent(new Event('change'));
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync().catch(() => {}), 2000);
}

export async function serverConfig() { return (await getMeta('server')) || null; }

export async function api(path, opts = {}) {
  const cfg = await serverConfig();
  if (!cfg || !cfg.url) throw new Error('서버가 꺼져 있어요.');
  const r = await fetch(cfg.url.replace(/\/$/, '') + path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-sam-code': cfg.code || '', ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `서버 오류 ${r.status}`);
  return body;
}

let syncing = null;
export function sync() {
  if (!syncing) syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}
async function doSync() {
  const cfg = await serverConfig();
  if (!cfg || !cfg.url || !cfg.on) return { skipped: true };
  // 1) 보내기
  const push = {};
  for (const t of TABLES) {
    const rows = (await tx(t, 'readonly', (x) => wrap(x.objectStore(t).getAll()))).filter((r) => r._dirty);
    if (rows.length) push[t] = rows.map(({ _dirty, ...r }) => r);
  }
  if (Object.keys(push).length) {
    await api('/api/sync', { method: 'POST', body: JSON.stringify({ tables: push }) });
    await tx(Object.keys(push), 'readwrite', (x) => Promise.all(Object.entries(push).flatMap(([t, rows]) =>
      rows.map((r) => wrap(x.objectStore(t).put(r))))));
  }
  // 2) 받기 (마지막에 고친 것이 이김)
  let since = (await getMeta('sync_since')) || 0;
  let got = 0;
  for (let i = 0; i < 20; i++) {
    const res = await api('/api/sync?since=' + since);
    const names = Object.keys(res.tables || {}).filter((t) => TABLES.includes(t));
    if (names.length) {
      await tx(names, 'readwrite', (x) => Promise.all(names.flatMap((t) => res.tables[t].map(async (row) => {
        const s = x.objectStore(t);
        const cur = await wrap(s.get(row.id));
        if (!cur || (cur.updated_at || 0) <= (row.updated_at || 0)) { await wrap(s.put(row)); got++; }
      }))));
    }
    since = res.cursor;
    if (!res.more) break;
  }
  await setMeta('sync_since', since);
  await setMeta('sync_at', Date.now());
  if (got) events.dispatchEvent(new Event('remote'));
  return { got };
}
