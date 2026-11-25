// 사만다(재고 측정기) 연결. 모든 연결 방식은 같은 이벤트를 낸다.
//   'reading' {g, s, at}   g=그램(영점 기준 순무게, 용기 포함), s=1이면 기록해도 되는 값
//   'event'   펌웨어 이벤트(tare_done, unit_result, cal_step, error, mode)
//   'state'   off | connecting | live | kbd | error
// 메시지 형식은 docs/protocol.md(펌웨어 0.2.0)가 기준이다.

export const SVC = '8f54b060-bfdc-4675-9b5c-7e456e1be5a7';
const CH = {
  reading: '1f2184fe-273d-4949-be14-af1f11ea3346',
  event: '6f6a7bfe-c30c-44f1-9b40-9bf5b0965d0b',
  command: '3db8af36-2b8d-4e5e-9ba4-5388f2606dc4',
  info: '052f3d6b-6e53-44d2-864b-7cbbc0f1f557',
};
export const NAME_PREFIX = 'dalgrak-scale-';

class Scale extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.state = 'off'; this.last = null; this.info = null; this.name = ''; }
  setState(s) { if (this.state !== s) { this.state = s; this.dispatchEvent(new CustomEvent('state', { detail: s })); } }
  emitReading(g, s) {
    this.last = { g, s: s ? 1 : 0, at: Date.now() };
    this.dispatchEvent(new CustomEvent('reading', { detail: this.last }));
  }
  emitEvent(e) { this.dispatchEvent(new CustomEvent('event', { detail: e })); }
  get live() { return this.state === 'live' || this.state === 'kbd'; }
  /** 화면 속 사만다 눈 색 = 측정기 LED (펌웨어 §3.4, protocol.md) */
  get eye() {
    if (this.state === 'error') return 'red';
    if (this.state === 'connecting') return 'cyan';
    if (this.state === 'kbd') return 'purple';
    if (this.state === 'live') return this.last && this.last.s ? 'green' : 'yellow';
    return 'off';
  }
  async tare() { return false; }
  async command() { return false; }
  disconnect() { this.setState('off'); }
}

// ---------- 블루투스 직접 (안드로이드·PC 크롬, 웹 블루투스) ----------
export class BleScale extends Scale {
  constructor() { super('ble'); this.device = null; this.cmdCh = null; this.retry = 0; this.wantOn = false; }
  static supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }
  async connect() {
    if (!BleScale.supported()) throw new Error('이 브라우저는 블루투스 연결을 지원하지 않아요. 안드로이드 크롬에서 열어 주세요.');
    this.setState('connecting');
    try {
      this.device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: NAME_PREFIX }, { services: [SVC] }], optionalServices: [SVC] });
    } catch (e) { this.setState('off'); throw e; }
    this.name = this.device.name || '';
    this.wantOn = true;
    this.device.addEventListener('gattserverdisconnected', () => this.onDrop());
    await this.attach();
  }
  async attach() {
    this.setState('connecting');
    const server = await this.device.gatt.connect();
    const svc = await server.getPrimaryService(SVC);
    const dec = new TextDecoder();
    const parse = (v) => { try { return JSON.parse(dec.decode(v.buffer ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : v)); } catch { return null; } };
    const rd = await svc.getCharacteristic(CH.reading);
    rd.addEventListener('characteristicvaluechanged', (e) => { const m = parse(e.target.value); if (m && m.t === 'r') this.emitReading(Number(m.g), m.s === 1); });
    await rd.startNotifications();
    const ev = await svc.getCharacteristic(CH.event);
    ev.addEventListener('characteristicvaluechanged', (e) => { const m = parse(e.target.value); if (m && m.t === 'e') this.emitEvent(m); });
    await ev.startNotifications();
    this.cmdCh = await svc.getCharacteristic(CH.command);
    try { this.info = parse(await (await svc.getCharacteristic(CH.info)).readValue()); } catch { this.info = null; }
    this.retry = 0;
    this.setState('live');
  }
  async onDrop() {
    this.cmdCh = null;
    if (!this.wantOn) return this.setState('off');
    this.setState('connecting');
    while (this.wantOn && this.retry < 5) {
      this.retry++;
      await new Promise((r) => setTimeout(r, 800 * this.retry));
      try { await this.attach(); return; } catch { /* 다시 */ }
    }
    this.setState('error');
  }
  async command(obj) {
    if (!this.cmdCh) return false;
    const data = new TextEncoder().encode(JSON.stringify(obj));
    if (this.cmdCh.writeValueWithoutResponse) await this.cmdCh.writeValueWithoutResponse(data); else await this.cmdCh.writeValue(data);
    return true;
  }
  tare() { return this.command({ cmd: 'tare' }); }
  disconnect() { this.wantOn = false; try { this.device?.gatt?.disconnect(); } catch { /* */ } this.setState('off'); }
}

// ---------- 블루투스 키보드 (아이폰) ----------
// 사만다 버튼을 한 번 누르면 "12430.0⏎"이 입력된다. 숫자·점·빼기·엔터만 받는다.
export class KeyboardScale extends Scale {
  constructor() {
    super('kbd');
    this.buf = '';
    this.onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !t.dataset.scaleIn;
      if (typing) return;
      if (/^[0-9.\-]$/.test(e.key)) { this.buf += e.key; e.preventDefault(); return; }
      if (e.key === 'Enter') {
        const v = Number(this.buf);
        if (this.buf && Number.isFinite(v)) { this.emitReading(v, true); e.preventDefault(); }
        this.buf = '';
      } else if (e.key === 'Backspace') this.buf = this.buf.slice(0, -1);
    };
  }
  async connect() { this.name = '키보드 모드'; document.addEventListener('keydown', this.onKey, true); this.setState('kbd'); }
  disconnect() { document.removeEventListener('keydown', this.onKey, true); this.setState('off'); }
  /** 엔터로 끝난 입력이 칸에 직접 들어온 경우(일부 브라우저) */
  feed(text) { const v = Number(String(text).trim()); if (Number.isFinite(v) && String(text).trim()) this.emitReading(v, true); }
}

// ---------- 내 서버 경유 (Wi-Fi 모드, 선택) ----------
export class ServerScale extends Scale {
  constructor(cfg, deviceId) { super('server'); this.cfg = cfg; this.deviceId = deviceId; this.ws = null; this.wantOn = false; this.lastTare = null; }
  async connect() {
    this.wantOn = true;
    this.name = this.deviceId;
    this.open();
    // 5초 넘게 무게가 안 오면 끊긴 것으로 본다 (SAM_SPEC §4.3)
    this.watch = setInterval(() => { if (this.state === 'live' && this.last && Date.now() - this.last.at > 5000) this.setState('connecting'); }, 1000);
  }
  open() {
    this.setState('connecting');
    const u = new URL(this.cfg.url.replace(/\/$/, '') + '/ws/app');
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('code', this.cfg.code || '');
    u.searchParams.set('device', this.deviceId);
    const ws = new WebSocket(u);
    this.ws = ws;
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'r') {
        if (this.state !== 'live') this.setState('live');
        if (m.tare_count != null && this.lastTare != null && m.tare_count !== this.lastTare) this.emitEvent({ t: 'e', ev: 'tare_done', count: m.tare_count });
        this.lastTare = m.tare_count;
        this.emitReading(Number(m.g), m.s === 1);
      } else if (m.t === 'offline') this.setState('connecting');
    };
    ws.onclose = () => { this.ws = null; if (this.wantOn) setTimeout(() => this.wantOn && this.open(), 2000); else this.setState('off'); };
  }
  async command(obj) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; } return false; }
  tare() { return this.command({ cmd: 'tare' }); }
  disconnect() { this.wantOn = false; clearInterval(this.watch); try { this.ws?.close(); } catch { /* */ } this.setState('off'); }
}

// ---------- 연습용 가짜 저울 ----------
// 화면의 연습 버튼이나 window.__sim.put(g)으로 무게를 바꾼다. 실제 저울처럼 흔들리다 1초 뒤 멈춘다.
export class SimScale extends Scale {
  constructor() { super('sim'); this.target = 0; this.g = 0; this.since = 0; this.timer = null; this.zero = 0; this.tareCount = 0; }
  async connect() {
    this.name = '연습용 저울';
    this.info = { fw: 'sim', cal: true, band: 0.5, unit: 0 };
    this.timer = setInterval(() => this.tick(), 200);
    window.__sim = this;
    this.setState('live');
  }
  put(g) { this.target = g; this.since = Date.now(); }
  tick() {
    const moving = Date.now() - this.since < 900;
    this.g = moving ? this.target + (Math.random() - 0.5) * Math.min(20, Math.abs(this.target) * 0.05 + 2) : this.target;
    this.emitReading(Math.round((this.g - this.zero) * 10) / 10, !moving);
  }
  async tare() { this.zero = this.target; this.tareCount++; setTimeout(() => this.emitEvent({ t: 'e', ev: 'tare_done', count: this.tareCount }), 300); return true; }
  async command(o) { if (o.cmd === 'tare') return this.tare(); return true; }
  disconnect() { clearInterval(this.timer); this.setState('off'); }
}

export function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
