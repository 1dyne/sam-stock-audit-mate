#!/usr/bin/env python3
"""sam 측정기 수신 확인용 목업 서버 (표준 라이브러리만 사용).

실제 서버는 웹 세션이 만든다. 이 서버는 SAM_SPEC.md 의 '펌웨어 ↔ 서버 데이터 계약'을
그대로 구현한 기준 구현이다. 펌웨어 단계 ⑤를 웹 없이 확인할 때 쓴다.

  python mock_server.py --port 8080 --key test-key
  측정기:  server http://<PC의 IP>:8080/api/v1/readings
           key test-key

  브라우저:  http://localhost:8080/            → 기기별 최신값 표
  명령:      http://localhost:8080/cmd?device=sam-07&type=tare      (또는 identify)
"""
import argparse, json, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

REQUIRED = {"v": int, "device_id": str, "fw_version": str, "seq": int, "ts_ms": int,
            "weight_g": (int, float), "stable": bool, "raw": int, "calibrated": bool,
            "adc_ok": bool, "state": str, "tare_count": int}
latest, pending, lock = {}, {}, threading.Lock()
cmd_seq = 0


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj, ctype="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if urlparse(self.path).path != "/api/v1/readings":
            return self._send(404, {"ok": False, "error": "not found"})
        if ARGS.key and self.headers.get("Authorization") != f"Bearer {ARGS.key}":
            return self._send(401, {"ok": False, "error": "bad key"})
        try:
            d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except Exception as e:
            return self._send(400, {"ok": False, "error": f"json: {e}"})
        bad = [k for k, t in REQUIRED.items() if not isinstance(d.get(k), t) or (t is int and isinstance(d.get(k), bool))]
        if bad:
            print("계약 위반 필드:", bad, d)
            return self._send(400, {"ok": False, "error": f"bad fields {bad}"})
        dev = d["device_id"]
        d["received_at"] = time.time()
        with lock:
            prev = latest.get(dev)
            latest[dev] = d
            cmds = pending.pop(dev, [])
        if prev and d["seq"] <= prev["seq"]:
            print(f"[{dev}] seq 역행 {prev['seq']} → {d['seq']} (재부팅?)")
        print(f"[{dev}] {d['weight_g']:8.1f} g  stable={d['stable']!s:5}  state={d['state']:12} "
              f"seq={d['seq']} rssi={d.get('rssi')} ack={d.get('ack', '')}")
        self._send(200, {"ok": True, "cmds": cmds})

    def do_GET(self):
        global cmd_seq
        u = urlparse(self.path)
        if u.path == "/cmd":
            q = parse_qs(u.query)
            dev, typ = q.get("device", [""])[0], q.get("type", ["tare"])[0]
            with lock:
                cmd_seq += 1
                c = {"id": f"c{cmd_seq}", "type": typ}
                pending.setdefault(dev, []).append(c)
            return self._send(200, {"queued": c, "device": dev})
        if u.path == "/api/v1/devices":
            with lock:
                return self._send(200, list(latest.values()))
        rows = "".join(
            f"<tr><td>{k}</td><td>{v['weight_g']:.1f} g</td><td>{'안정' if v['stable'] else '흔들림'}</td>"
            f"<td>{v['state']}</td><td>{time.time() - v['received_at']:.1f}s 전</td>"
            f"<td><a href='/cmd?device={k}&type=tare'>영점</a> <a href='/cmd?device={k}&type=identify'>찾기</a></td></tr>"
            for k, v in sorted(latest.items()))
        html = (f"<meta charset=utf-8><meta http-equiv=refresh content=1><h3>sam mock server</h3>"
                f"<table border=1 cellpadding=6><tr><th>기기</th><th>무게</th><th>상태</th><th>state</th>"
                f"<th>수신</th><th>명령</th></tr>{rows}</table>")
        self._send(200, html.encode(), "text/html; charset=utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--key", default="")
    ARGS = ap.parse_args()
    print(f"listening on 0.0.0.0:{ARGS.port}  (key {'필요' if ARGS.key else '없음'})")
    ThreadingHTTPServer(("0.0.0.0", ARGS.port), H).serve_forever()
