#!/usr/bin/env python3
"""측정기 1대 양산 설정 (업로드 직후 실행). 필요: pip install pyserial

  python provision.py --port COM5 --id 7 [--ssid sam-router --pass xxxx]
                      [--server https://.../api/v1/readings --key KEY] [--ref 1000] [--skip-cal]

순서: 번호 저장(재부팅) → Wi-Fi/서버 → 보정(빈 저울 → 기준 무게) → 확인 → info 저장(provision_log.jsonl)
"""
import argparse, json, sys, time
import serial  # pyserial


def open_port(port):
    for _ in range(20):
        try:
            return serial.Serial(port, 115200, timeout=0.2)
        except serial.SerialException:
            time.sleep(0.5)
    sys.exit(f"포트 {port} 열기 실패")


def send(s, line):
    s.write((line + "\n").encode())
    s.flush()
    time.sleep(0.3)


def wait_for(s, needles, timeout, echo=True):
    end, buf = time.time() + timeout, ""
    while time.time() < end:
        chunk = s.read(512).decode(errors="replace")
        if not chunk:
            continue
        buf += chunk
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            if echo and not line.startswith("[M]"):
                print("  │", line.rstrip())
            for n in needles:
                if n in line:
                    return n, line
    return None, ""


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--port", required=True)
    a.add_argument("--id", type=int, required=True)
    a.add_argument("--ssid"); a.add_argument("--pass", dest="pw")
    a.add_argument("--server"); a.add_argument("--key")
    a.add_argument("--ref", type=float, default=1000.0)
    a.add_argument("--skip-cal", action="store_true")
    o = a.parse_args()
    t0 = time.time()

    s = open_port(o.port)
    send(s, "log 0")
    print(f"① 번호 sam-{o.id:02d} 저장 → 재부팅")
    send(s, f"id {o.id}")
    s.close(); time.sleep(3)
    s = open_port(o.port)
    wait_for(s, ["'help'"], 8)
    send(s, "log 0")

    print("② Wi-Fi / 서버")
    if o.ssid: send(s, f"ssid {o.ssid}")
    if o.pw is not None: send(s, f"pass {o.pw}")
    if o.server: send(s, f"server {o.server}")
    if o.key: send(s, f"key {o.key}")
    send(s, f"calref {o.ref}")

    if not o.skip_cal:
        print(f"③ 보정: 저울 위를 비우세요. (기준 {o.ref:.0f}g)")
        input("   비웠으면 Enter ")
        send(s, f"cal {o.ref}")
        hit, _ = wait_for(s, ["기준 무게를 올리세요", "[CAL] fail"], 30)
        if hit != "기준 무게를 올리세요":
            sys.exit("보정 실패: 빈 저울이 안정되지 않음")
        print(f"   이제 {o.ref:.0f}g 분동을 가운데에 올리세요 (자동 인식)")
        hit, line = wait_for(s, ["[CAL] ok", "[CAL] fail"], 60)
        if hit != "[CAL] ok":
            sys.exit("보정 실패: " + line)
        input("   분동을 내리고 Enter ")
        time.sleep(2)

    print("④ 확인")
    send(s, "reboot"); s.close(); time.sleep(3); s = open_port(o.port)
    wait_for(s, ["[WIFI] online", "connect timeout", "AP \""], 30)
    send(s, "log 0")
    s.reset_input_buffer()
    send(s, "info")
    _, line = wait_for(s, ['{"device_id"'], 5, echo=False)
    info = json.loads(line[line.index("{"):])
    print(json.dumps(info, ensure_ascii=False, indent=1))
    with open("provision_log.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.strftime("%Y-%m-%d %H:%M:%S"), **info}, ensure_ascii=False) + "\n")
    ok = info["calibrated"] and info["adc_ok"] and abs(info["weight_g"]) < 1.0
    send(s, "log 1")
    print(f"\n{'✅ 완료' if ok else '⚠ 확인 필요'}  sam-{o.id:02d}  ({time.time() - t0:.0f}초)  스티커 번호 확인!")


if __name__ == "__main__":
    main()
