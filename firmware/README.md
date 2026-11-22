# sam 저울 측정기 펌웨어

M5Stack ATOMS3 Lite + HX711 + 5kg 로드셀. 전체 사양·서버 계약은 [`../SAM_SPEC.md`](../SAM_SPEC.md), 블루투스 메시지 형식은 [`../docs/protocol.md`](../docs/protocol.md).

동작 모드(한 번에 하나, NVS 저장): **gatt**(기본, 안드로이드 웹 블루투스) / **kbd**(아이폰 BLE 키보드) / **wifi**(서버 전송·AP). 버튼 세 번 또는 시리얼 `ble gatt`·`ble kbd`·`net wifi`로 전환.

```
firmware/
  sam_scale/          Arduino 스케치 (본체는 main.cpp, .ino는 비어 있음)
    config.h          핀·임계값·주기 (13대 공통)
    secrets.example.h → secrets.h 로 복사 (공유기·서버 기본값, git 제외)
    ScaleAdc.h        ADC 인터페이스  ← Hx711Adc.*  (다른 ADC는 여기 구현 추가)
    Scale.*           필터·안정·영점·보정·수량
    Settings.*        NVS (namespace "sam")
    Net.* WebPage.h   Wi-Fi, AP/캡티브 포털, 내장 페이지, 서버 업로드
    Ble.*             블루투스 GATT(웹 블루투스) / BLE HID 키보드
    Led.* Button.*    입출력
    SerialCli.*       시리얼 명령
  tools/
    provision.py      1대 양산 설정 (번호·Wi-Fi·서버·보정)
    mock_server.py    계약 기준 목업 서버 (웹 없이 ⑤ 확인)
  test/               측정 코어 호스트 시뮬레이션
```

## 빌드 환경 (Windows)

| 항목 | 버전 |
|---|---|
| arduino-cli | 1.1.1 이상 |
| 보드 패키지 | **esp32:esp32 3.3.13** (Espressif, 버전 고정 — 4.x 아님) |
| 외부 라이브러리 | **없음** — 블루투스도 보드 패키지에 기본으로 들어 있는 `BLE` 라이브러리(3.3.13) 사용. HX711도 직접 구현이라 HX711 라이브러리가 없어도 되고, 설치돼 있어도 충돌 없음 |
| 보드 | `m5stack_atoms3` |
| USB CDC On Boot | **Enabled** (`CDCOnBoot=cdc`) — 이게 꺼져 있으면 시리얼 로그가 안 나옴 |
| USB Mode | Hardware CDC and JTAG (`USBMode=hwcdc`) |
| Partition | **8M with spiffs (3MB APP/1.5MB SPIFFS)** (`PartitionScheme=default_8MB`) — 0.2.0은 1.38MB라 기본 파티션(1.2MB)에는 안 들어감 |

**Arduino IDE 보드는 **M5AtomS3** (esp32 by Espressif 3.3.x 안의 항목, `M5Atom`은 다른 보드라 안 됨). `ESP32S3 Dev Module`로 해도 됩니다.** 그 경우 USB CDC On Boot **Enabled**, Flash Size **8MB**, Partition **8M with spiffs (3MB APP)**, PSRAM **Disabled**(켜면 LED 핀 G35를 PSRAM이 가져감). FQBN: `esp32:esp32:esp32s3:CDCOnBoot=cdc,USBMode=hwcdc,FlashSize=8M,PartitionScheme=default_8MB,PSRAM=disabled` — 두 보드 설정 모두 컴파일 확인. 아래 명령의 FQBN을 이것으로 바꿔도 됨.

처음 한 번:

```bash
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

```bash
arduino-cli core update-index
```

```bash
arduino-cli core install esp32:esp32@3.3.13
```


## 컴파일·업로드·모니터

`firmware` 폴더에서 (COM 번호는 장치 관리자에서 확인):

```bash
arduino-cli compile --fqbn "esp32:esp32:m5stack_atoms3:CDCOnBoot=cdc,USBMode=hwcdc,PartitionScheme=default_8MB" --output-dir build sam_scale
```

```bash
arduino-cli upload -p COM5 --fqbn "esp32:esp32:m5stack_atoms3:CDCOnBoot=cdc,USBMode=hwcdc,PartitionScheme=default_8MB" --input-dir build sam_scale
```

```bash
arduino-cli monitor -p COM5 -c baudrate=115200
```

- `upload`는 NVS(보정값·번호)를 **지우지 않는다**. 펌웨어만 바꿀 때 다시 보정할 필요 없음.
- `build/sam_scale.ino.merged.bin`을 0x0에 쓰는 방식(웹 플래셔 등)은 **NVS까지 지워진다** → 처음 굽는 경우에만.
- 업로드가 안 되면: 리셋 버튼을 LED가 초록으로 바뀔 때까지 약 2초 누르면 다운로드 모드 (ATOMS3 공통).

## 처음 연결 확인 (COM 포트가 안 보일 때)

1. 꽂은 채로 옆면 리셋을 2초 누르고 뗀다 → 장치 관리자 "포트(COM & LPT)"에 새 COM 포트가 생기는지, 윈도우 연결음이 나는지
2. 아무 변화 없으면 **케이블이 충전 전용**일 가능성이 큼 → 데이터 케이블(휴대폰 데이터 전송 되는 것)로 교체
3. COM이 생기면 업로드 → 리셋 짧게 1회 → **LED 파랑**이 켜지면 펌웨어가 도는 것 (0.2.0부터 부팅 즉시 파랑)
4. LED가 **빨강 고정**이면 HX711 응답 없음 → `info`의 `"hx"`가 배선과 맞는지 확인 (실험용 `[6,5,7]`)

## 시리얼 로그 (115200)

```
[BOOT] sam fw 0.1.0 contract v1 | id=sam-07 mac=D4F98D012A3B | calibrated=1 cpg=-431.690
[BOOT] auto tare (w=-0.1g)
[WIFI] online ip=192.168.8.23 rssi=-48
[M] raw=-144745 med=-144748 filt=-144747.5 w=125.34g stable=1 state=measuring | wifi=online ip=192.168.8.23 rssi=-48 | srv=ok code=200 45ms ok=812 fail=0
```

`log 0|1|2` = 끔 / 2Hz / 샘플마다(10Hz). 그 밖의 태그: `[TARE] [CAL] [UNIT] [CONTAINER] [WIFI] [SRV]`

## 시리얼 명령

`help`로 전체 목록. 주요 명령:

| 명령 | 설명 |
|---|---|
| `info` | 설정·상태 JSON 한 줄 |
| `id 7` | 스티커 번호 → `sam-07` (재부팅) |
| `ssid <이름>` / `pass <비번>` | Wi-Fi (재부팅 후 적용) |
| `server <url>` / `key <키>` | 서버 주소·키 (`-`로 지움) |
| `tare` | 영점 |
| `cal 1000` / `cal cancel` | 1000g 기준 보정 시작 / 취소 |
| `band 0.5` | 안정 밴드(g) |
| `unit 10` / `container` | 비상 페이지용 개당 무게·용기 |
| `ble gatt` / `ble kbd` / `net wifi` | 모드 저장 후 재부팅 |
| `ble unpair` | 저장된 블루투스 페어링 전부 삭제 (블루투스 모드에서) |
| `hxpins 6 5 7` / `hxpins 6 5 -1` | HX711 핀 DT SCK GND대용 (실험용 = G7을 GND로 / 밋업 = 진짜 G 배선) → 재부팅 |
| `ap` | 이번 부팅만 Wi-Fi AP 설정 모드로 재부팅 |
| `factory` | NVS 초기화 |

## 단계별 확인 (다인 PC에서)

① 원시값: `log 2` → `raw=`가 약 −90,650 ±30, 누르면 감소
② g 단위: `cal 1000` → 로그 안내대로 비우기 → 분동 올리기 → `[CAL] ok` → 분동 올리면 `w≈1000.0g`, 내리면 `0.0g`
③ 안정·수량: 동전 올리고 `stable=0 → 1`이 1초쯤 걸리는지. `container`(빈 용기) → 동전 10개 `unit 10` → 동전 30개 올리고 폰으로 내장 페이지에서 수량 30 확인
④ AP: 버튼 누른 채 전원 → LED 보라 → 폰 Wi-Fi에서 `sam-07` 접속 → 페이지 자동으로 뜨는지(안 뜨면 `http://192.168.4.1`) → `/setup`에서 공유기 저장 → 재부팅 후 초록
⑤ 서버: PC에서 `python tools/mock_server.py --key test` → 측정기 `server http://<PC IP>:8080/api/v1/readings`, `key test` → 서버 콘솔에 `[sam-07] ... g` 출력, 브라우저 `http://localhost:8080`에서 영점/찾기 명령
⑥ 버튼/LED: 짧게 → 흰색 잠깐 후 초록, 길게 3초 → 흰색 깜빡(보정), 다시 짧게 → 취소

## 블루투스 확인 (0.2.0, 다인 PC·폰에서)

1. **GATT 5Hz**: `ble gatt` → LED 청록 깜빡 → 안드로이드 Chrome에서 PWA(또는 `chrome://bluetooth-internals`)로 `dalgrak-scale-07` 연결 → reading 구독 → 시리얼 `[BLE] subscribe reading=1`, 1초에 5개 들어오는지
2. **명령**: command에 `{"cmd":"tare"}` → event `tare_done`. `{"cmd":"unit","n":10}` → `unit_result`. `{"cmd":"cal","ref":1000}` → `cal_step` empty → load → ok
3. **아이폰 페어링**: `ble kbd` → LED 보라 깜빡 → 아이폰 설정 → 블루투스 → `dalgrak-scale-07` 탭 → 시리얼 `[BLE] auth encrypted=1 bonded=1`, LED 보라 고정
4. **입력**: 메모 앱 커서 → 저울에 물건 → 버튼 한 번 → `1000.0` + 줄바꿈
5. **흔들림**: 손으로 흔들면서 버튼 → 5초 뒤 LED 빨강, 아무것도 입력 안 됨 (`[KBD] not stable`)
6. **유지**: 전원 껐다 켜기 → `[BOOT] ... mode=kbd`, 아이폰이 자동 재연결 (다시 페어링 안 함)

아이폰에서 하드웨어 키보드가 연결되면 화면 키보드가 숨겨진다. 메모 앱 화면 아래 키보드 아이콘(⌄)을 길게 누르면 다시 나온다 (미검증).

## 양산 (1대 5분 목표)

```bash
pip install pyserial
```

`sam_scale/secrets.h`에 공유기·서버·키를 넣고 한 번 컴파일한 뒤, 보드마다:

```bash
arduino-cli upload -p COM5 --fqbn "esp32:esp32:m5stack_atoms3:CDCOnBoot=cdc,USBMode=hwcdc,PartitionScheme=default_8MB" --input-dir build sam_scale
```

```bash
python tools/provision.py --port COM5 --id 7 --ref 1000
```

스크립트가 번호 저장 → 보정 안내(비우기 → 분동) → 재부팅 → Wi-Fi·서버 확인 → `provision_log.jsonl` 기록. 끝나면 스티커 붙이기.
secrets.h 없이 하려면 `--ssid --pass --server --key` 옵션.

## 호스트 시뮬레이션 (리눅스/맥, 선택)

```bash
cd test && g++ -std=gnu++17 -Istub -I../sam_scale -o /tmp/test_scale test_scale.cpp ../sam_scale/Scale.cpp ../sam_scale/Settings.cpp && /tmp/test_scale
```
