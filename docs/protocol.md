# 셈 저울 ↔ 폰/서버 메시지 형식

펌웨어 0.2.0 기준. 기기 쪽 구현: `firmware/sam_scale/Ble.cpp`, `sam_main.cpp`, `Net.cpp`.
이 문서가 PWA 블루투스 드라이버와 펌웨어 사이의 기준이다. 바꿀 때는 양쪽 세션이 함께 고친다.

## 동작 모드 (한 번에 하나, NVS 저장)

| 모드 | 용도 | 폰 쪽 | LED |
|---|---|---|---|
| `gatt` (기본) | 혼자·폰 하나·서버 없음, 실시간 | 안드로이드 Chrome 웹 블루투스 | 연결 전 청록 깜빡 → 연결 후 초록(안정)/노랑(흔들림) |
| `kbd` | 아이폰, 앱·서버 없음 | 설정 → 블루투스에서 키보드로 페어링 | 연결 전 보라 깜빡 → 연결 후 보라(안정)/노랑(흔들림), 입력 대기 중 보라 빠르게 깜빡, 입력 성공 흰색 한 번, 실패 빨강 1.5초 |
| `wifi` | 여럿이 기록을 합칠 때 (선택) | 서버 경유 (`SAM_SPEC.md` §4) | 기존과 같음 |

전환: 버튼 **세 번** (gatt ↔ kbd 만 오감, 새 모드 색으로 깜빡인 뒤 재부팅. wifi는 시리얼로만 — 0.2.1) · 시리얼 `ble gatt` / `ble kbd` / `net wifi` · GATT command `{"cmd":"mode","v":"kbd"}`.
GATT와 HID(0x1812)는 한 번에 같이 올리지 않는다 (웹 블루투스가 HID 서비스를 차단 목록에 둠).
모드마다 블루투스 주소가 다르다(정적 랜덤 주소). 폰이 GATT 서비스 목록과 키보드 서비스 목록을 섞어 캐시하지 않게 하려는 것.

## 0.2.3 변경 (11-27)

- 안정 판정·영점 추적·급변 감지 임계값을 **원시값(counts) 기준**으로 바꿈. 보정 기준물이 임의(드라이버 = "100")라 g 숫자의 비율이 기기마다 달라도 판정은 같게 동작
- 안정 밴드 기본 400 counts(일반 5kg 로드셀 약 1g). `info.band`는 이 값을 지금 보정 비율의 g로 환산한 값
- 개당 무게 등록·용기 무게·보정·키보드 입력은 1초 창 평균값을 씀 (순간값보다 정확)

## 0.2.1 변경 (11-27, 밋업 1인 1조립 대비)

- 번호 0 허용 (샘플). 미설정은 MAC 뒤 4자리
- **폰이 연결되는 순간 LED 흰색 빠르게 2초** → 참가자가 "내 저울에 붙었는지" 눈으로 확인
- 보정 안 된 상태에서 폰이 연결돼 있으면 빨강과 모드 색(청록/보라)이 번갈아 켜짐
- 보정 잠금 `callock 1`: 버튼 길게·GATT `cal` 막음 (시리얼 `cal`은 가능)
- 세 번 누름은 gatt ↔ kbd 만

## 기기 이름

`dalgrak-scale-NN` — NN = 기기 번호 2자리 (00 = 다인 샘플, 01~13 = 참가자. 시리얼 `id N`) (Wi-Fi AP `sam-NN`, 서버 `device_id`와 같은 번호).
번호 미설정이면 `dalgrak-scale-XXXX` (MAC 뒤 4자리).
웹 블루투스 필터 예: `{ filters: [{ namePrefix: "dalgrak-scale-" }], optionalServices: [SERVICE_UUID] }`
GATT 모드 광고 패킷 = 서비스 UUID, 이름은 스캔 응답에 있다 (31바이트 제한 때문). `filters: [{ services: [SERVICE_UUID] }]`도 된다.

## GATT 모드

서비스 `8f54b060-bfdc-4675-9b5c-7e456e1be5a7`

| 특성 | UUID | 속성 | 내용 |
|---|---|---|---|
| reading | `1f2184fe-273d-4949-be14-af1f11ea3346` | notify | 구독 중일 때 5Hz (200ms) |
| event | `6f6a7bfe-c30c-44f1-9b40-9bf5b0965d0b` | notify | 아래 이벤트 |
| command | `3db8af36-2b8d-4e5e-9ba4-5388f2606dc4` | write, write without response | 아래 명령 |
| info | `052f3d6b-6e53-44d2-864b-7cbbc0f1f557` | read | 읽을 때마다 새로 만듦 |

- 모든 메시지는 UTF-8 JSON, **180바이트 이하**, 영문·숫자만. 기기는 MTU 247을 요청한다.
- 보안(페어링) 없음.

### reading

```json
{"t":"r","g":12430.0,"s":1}
```
- `g`: 그램, 소수 1자리, 영점 기준 순무게 (용기 포함)
- `s`: 1 = 이 값을 기록해도 됨 (안정 && 보정됨 && 저울 정상 && 영점·보정 중 아님 && 5200g 이하), 0 = 기다려야 함

### command (폰 → 기기)

| 명령 | 동작 | 결과 이벤트 |
|---|---|---|
| `{"cmd":"tare"}` | 안정되면(최대 3초) 10샘플 평균으로 영점 | `tare_done` |
| `{"cmd":"unit","n":10}` | 안정될 때까지 최대 5초 기다렸다가 `(무게 − 용기)/n`을 개당 무게로 저장 | `unit_result` |
| `{"cmd":"cal","ref":500}` | 보정 시작 (`ref` 없으면 저장된 기준 무게) | `cal_step` 여러 번 |
| `{"cmd":"cal_cancel"}` | 보정 취소, 저장 안 함 | `cal_step` cancel |
| `{"cmd":"mode","v":"kbd"}` | 모드 저장 후 재부팅 (`gatt`/`kbd`/`wifi`) | `mode` (연결 끊김) |

### event (기기 → 폰)

```json
{"t":"e","ev":"tare_done","count":3}
{"t":"e","ev":"unit_result","ok":true,"n":10,"unit":2.503,"net":25.0}
{"t":"e","ev":"unit_result","ok":false,"n":10,"err":"unstable"}
{"t":"e","ev":"unit_result","ok":false,"n":10,"err":"too_small","net":4.9}
{"t":"e","ev":"cal_step","step":"empty","ref":500.0}
{"t":"e","ev":"cal_step","step":"load","ref":500.0}
{"t":"e","ev":"cal_step","step":"ok","factor":-431.690,"ref":500.0}
{"t":"e","ev":"cal_step","step":"fail","ref":500.0}
{"t":"e","ev":"cal_step","step":"cancel"}
{"t":"e","ev":"error","code":"adc"}
{"t":"e","ev":"error","code":"busy","cmd":"tare"}
{"t":"e","ev":"mode","v":"kbd"}
```

- `tare_done.count`: 부팅 후 영점 횟수. 버튼으로 영점해도 온다 → PWA는 이 이벤트를 받으면 그 전에 잡은 용기 기준을 다시 확인
- `cal_step`: `empty` 저울 비우기 → `load` 기준 무게 올리기 → `ok`/`fail` (60초 타임아웃 = fail, 저장 안 함). 버튼으로 시작한 보정도 이벤트가 온다
- `unit_result.err`: `unstable` (5초 안에 안정 안 됨), `too_small` (개당 무게 < 안정 밴드, 약 1g — 0.2.3)
- `error.code`: `adc` (저울 무응답), `busy` (보정 중), `locked` (보정 잠금 `callock 1` 상태에서 cal 명령 — 0.2.1), `uncalibrated`, `bad_arg`, `bad_json`, `unknown_cmd`

### info

```json
{"fw":"0.2.0","cal":true,"factor":-431.690,"ref":500.0,"mode":"gatt","id":"dalgrak-scale-07","unit":2.503,"band":0.50}
```
`factor` = counts/g (음수 정상), `ref` = 보정 기준 무게(g), `unit` = 저장된 개당 무게(g, 0 = 없음), `band` = 안정 판정 밴드(g)

## 키보드 모드 (BLE HID)

- 표준 키보드 (Report ID 1), 본딩 + Just Works (비밀번호 입력 없음)
- 버튼 **한 번**: 안정될 때까지 최대 5초 기다렸다가 `12430.0` + Enter 입력 (그램, 소수 1자리)
  - 5초 안에 안정 안 됨 / 보정 안 됨 / 저울 오류 / 연결 안 됨 → **아무것도 입력 안 함**, LED 빨강 1.5초
- 버튼 **두 번** = 영점, **길게(3초)** = 보정, **세 번** = 모드 전환
- 입력하는 글자는 숫자, `.`, `-`, Enter뿐 → 아이폰 하드웨어 키보드 배열(한글/영문)과 상관없음

## 공통 버튼

| 동작 | gatt / wifi | kbd |
|---|---|---|
| 한 번 | 영점 | 무게 입력 |
| 두 번 | 영점 | 영점 |
| 세 번 | 모드 전환 | 모드 전환 |
| 길게 3초 | 보정 | 보정 |
| 보정 중 아무 클릭 | 보정 취소 | 보정 취소 |
| 누른 채 전원 켜기 | 이번 부팅만 Wi-Fi AP 설정 모드 | 같음 |

한 번 누름은 두 번·세 번과 구분하려고 손 뗀 뒤 0.35초 지나서 확정된다.

## Wi-Fi 모드 (선택)

서버로 HTTP(S) POST — `SAM_SPEC.md` §4 (계약 v1). 저장소의 펌웨어는 WebSocket이 아니라 POST 방식이다.
