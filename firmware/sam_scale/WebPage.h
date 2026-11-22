// 기기 내장 페이지 (AP 모드 비상 측정 + Wi-Fi 설정). 외부 리소스 없음.
#pragma once
static const char PAGE_MAIN[] PROGMEM = R"HTML(<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>sam 측정기</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f6f5f2;color:#222;max-width:480px;margin:auto}
h1{font-size:18px;margin:0 0 4px}.sub{color:#666;font-size:13px}
.card{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 3px #0001}
.w{font-size:48px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:4px 10px;border-radius:99px;font-size:13px;font-weight:600}
.ok{background:#d8f3dc;color:#1b5e20}.wait{background:#fff3c4;color:#7a5b00}.bad{background:#ffd6d6;color:#8a1c1c}
button{font-size:16px;padding:12px;border:0;border-radius:10px;background:#2d6a4f;color:#fff;width:100%;margin-top:8px}
button.alt{background:#e9ecef;color:#222}
input{font-size:16px;padding:10px;width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;margin-top:6px}
.row{display:flex;gap:8px}.row>*{flex:1}.big{font-size:32px;font-weight:700}
small{color:#666}a{color:#2d6a4f}
</style></head><body>
<h1 id="id">sam 측정기</h1><div class="sub" id="net">연결 확인 중…</div>
<div class="card" style="text-align:center"><div class="w" id="w">–</div><span id="st" class="badge wait">확인 중</span>
<button onclick="post('/api/tare')">영점 (빈 저울/빈 용기 올리고)</button></div>
<div class="card"><b>수량 세기</b><br><small>① 빈 용기를 올리고 "용기 무게로" → ② N개 올리고 "개당 무게 등록" → ③ 전부 올리면 수량</small>
<div class="row"><button class="alt" onclick="post('/api/container')">현재 무게를 용기로</button><button class="alt" onclick="post('/api/container?clear=1')">용기 0g</button></div>
<div class="row"><input id="n" type="number" min="1" value="10" inputmode="numeric"><button onclick="post('/api/unit?n='+v('n'))">개당 무게 등록</button></div>
<p>용기 <b id="cg">–</b> · 개당 <b id="ug">–</b></p>
<div style="text-align:center"><div class="big" id="cnt">–</div><span id="cst"></span></div>
<input id="led" type="number" inputmode="numeric" placeholder="장부 수량 (선택)"><p id="diff"></p></div>
<div class="card"><a href="/setup">Wi-Fi 설정</a> · <small id="fw"></small></div>
<script>
function v(i){return document.getElementById(i).value}function $(i){return document.getElementById(i)}
async function post(u){try{let r=await fetch(u,{method:'POST'});let j=await r.json();if(!j.ok)alert(j.error||'실패')}catch(e){alert('기기와 연결 안 됨')}}
async function poll(){try{let s=await (await fetch('/api/state')).json();
$('id').textContent=s.device_id+' 측정기';$('fw').textContent='fw '+s.fw_version;
$('net').textContent=s.wifi.mode+(s.wifi.ip?' · '+s.wifi.ip:'')+(s.server.configured?' · 서버 '+(s.server.ok?'연결됨':'안 됨'):'');
$('w').textContent=s.adc_ok?s.weight_g.toFixed(1)+' g':'저울 오류';
let st=$('st');if(!s.adc_ok){st.className='badge bad';st.textContent='배선 확인'}else if(!s.calibrated){st.className='badge bad';st.textContent='보정 필요'}
else if(s.taring){st.className='badge wait';st.textContent='영점 잡는 중'}else if(s.stable){st.className='badge ok';st.textContent='안정'}else{st.className='badge wait';st.textContent='흔들림'}
$('cg').textContent=s.container_g.toFixed(1)+'g';$('ug').textContent=s.unit_g>0?s.unit_g.toFixed(2)+'g':'미등록';
if(s.count!==null){$('cnt').textContent=s.count+'개';$('cst').innerHTML=!s.stable?'<span class="badge wait">기다리는 중</span>':s.needs_check?'<span class="badge bad">확인 필요 ('+s.count_exact.toFixed(2)+')</span>':'<span class="badge ok">확정 가능</span>';
let l=parseInt(v('led'));$('diff').textContent=isNaN(l)?'':'장부 대비 '+(s.count-l>0?'+':'')+(s.count-l)+'개'}else{$('cnt').textContent='–';$('cst').textContent='';$('diff').textContent=''}
}catch(e){$('net').textContent='기기와 연결 안 됨'}setTimeout(poll,300)}poll();
</script></body></html>)HTML";

static const char PAGE_SETUP[] PROGMEM = R"HTML(<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>sam Wi-Fi 설정</title>
<style>body{font-family:system-ui,sans-serif;padding:16px;max-width:480px;margin:auto;background:#f6f5f2}
input,select,button{font-size:16px;padding:12px;width:100%;box-sizing:border-box;margin-top:8px;border-radius:8px;border:1px solid #ccc}
button{background:#2d6a4f;color:#fff;border:0}small{color:#666}</style></head><body>
<h2>Wi-Fi 설정</h2><small>2.4GHz Wi-Fi만 됩니다. 저장하면 측정기가 다시 켜집니다.</small>
<select id="s"><option>검색 중…</option></select><input id="m" placeholder="직접 입력 (목록에 없을 때)">
<input id="p" type="password" placeholder="비밀번호"><button onclick="save()">저장하고 연결</button>
<p><a href="/">← 측정 화면</a></p>
<script>
fetch('/api/scan').then(r=>r.json()).then(l=>{let s=document.getElementById('s');s.innerHTML='';
l.forEach(n=>{let o=document.createElement('option');o.value=n.ssid;o.textContent=n.ssid+' ('+n.rssi+')';s.appendChild(o)})});
function save(){let m=document.getElementById('m').value,ss=m||document.getElementById('s').value;
let b=new URLSearchParams({ssid:ss,pass:document.getElementById('p').value});
fetch('/api/wifi',{method:'POST',body:b}).then(r=>r.json()).then(j=>{document.body.innerHTML=j.ok?'<h2>저장됨</h2><p>측정기가 다시 켜지고 '+ss+'에 연결합니다. LED가 보라색이면 연결 실패입니다.</p>':'<h2>실패</h2>'+j.error})}
</script></body></html>)HTML";
