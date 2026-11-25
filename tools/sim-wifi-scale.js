// 가짜 Wi-Fi 사만다: 펌웨어 계약(SAM_SPEC.md §4, v1)대로 서버에 무게를 POST한다.
//   node tools/sim-wifi-scale.js http://localhost:8787 <접속코드> [sam-07]
// 키보드: 숫자 입력 후 Enter = 그 무게(g)를 올림, t = 영점, q = 끝
import readline from 'node:readline';

const [url = 'http://localhost:8787', key = '', id = 'sam-07'] = process.argv.slice(2);
let target = 0, zero = 0, since = 0, seq = 0, tareCount = 0, ack = null;

async function send() {
  const moving = Date.now() - since < 1000;
  const g = (moving ? target + (Math.random() - 0.5) * 6 : target) - zero;
  const body = {
    v: 1, device_id: id, device_no: Number(id.replace(/\D/g, '')) || 0, mac: 'D4F98D000000', fw_version: 'sim',
    seq: ++seq, ts_ms: Math.round(performance.now()), weight_g: Math.round(g * 100) / 100, stable: !moving,
    raw: 0, calibrated: true, adc_ok: true, state: 'measuring', tare_count: tareCount, rssi: -50,
  };
  if (ack) body.ack = ack;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/api/v1/readings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, 'x-sam-device': id }, body: JSON.stringify(body) });
    const j = await r.json();
    ack = null;
    for (const c of j.cmds || []) {
      ack = c.id;
      if (c.type === 'tare') { zero = target; tareCount++; console.log('명령: 영점'); }
      if (c.type === 'identify') console.log('명령: 내 측정기 찾기 (LED 흰색 깜빡)');
    }
    if (!r.ok) console.log('서버 응답', r.status, j);
  } catch (e) { console.log('전송 실패', e.message); }
}
setInterval(send, 250);
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => {
  const s = l.trim();
  if (s === 'q') process.exit(0);
  if (s === 't') { zero = target; tareCount++; return; }
  const v = Number(s);
  if (Number.isFinite(v)) { target = v; since = Date.now(); console.log('올림', v, 'g'); }
});
console.log(`가짜 사만다 ${id} → ${url}  (숫자+Enter = 무게, t = 영점, q = 끝)`);
