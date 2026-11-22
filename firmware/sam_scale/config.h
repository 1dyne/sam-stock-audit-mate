// sam 저울 측정기 펌웨어 — 고정 설정 (13대 공통, 기기별 값은 NVS)
#pragma once
#include <Arduino.h>

#define SAM_FW_VERSION "0.2.0"
#define SAM_CONTRACT_VERSION 1   // SAM_SPEC.md "펌웨어 ↔ 서버 데이터 계약" 버전

// ── 핀 (ATOMS3 Lite) ──
// HX711 핀은 기본값이고 기기마다 NVS로 바꿀 수 있다 (시리얼 'hxpins <DT> <SCK> <GND|-1>').
//   실험용 1세트(11/16): HX711 헤더를 왼쪽 소켓에 직접 꽂아 GND가 G7에 닿음 → G7을 LOW로 만들어 GND 대용
//   밋업 13세트: GND를 진짜 G에 배선 예정 → 'hxpins 6 5 -1' (G7을 LOW로 둬도 해는 없음)
#define HX_SCK_DEFAULT 5
#define HX_DT_DEFAULT  6
#define HX_GND_DEFAULT 7    // GND 대용 GPIO. -1 = 사용 안 함. 이 핀은 절대 HIGH로 만들지 않는다
#define PIN_BUTTON    41   // 내장 버튼, active LOW (M5Unified 공식 소스 확인)
#define PIN_LED       35   // 내장 RGB LED WS2812C-2020 1개 (M5Unified 공식 소스 확인)

// ── 측정 ──
#define BOOT_SETTLE_MS        500   // 부팅 후 대기
#define BOOT_DISCARD_SAMPLES  5     // 초기 샘플 버리기
#define MEDIAN_N              5     // 중앙값 창 (10Hz 기준 0.5s)
#define AVG_N                 4     // 이동평균 창
#define FAST_TRACK_G          20.0f // 이보다 크게 바뀌면 평균 버퍼 리셋(빠른 반응)
#define STEP_DETECT_G         2.0f  // 원시값 한 샘플이 이만큼 튀면 즉시 unstable
#define STABLE_WINDOW_MS      1000  // 안정 판정 창
#define STABLE_BAND_G_DEFAULT 0.5f  // 창 안 최대-최소 ≤ 이 값이면 stable (미검증: 실측 후 조정)
#define HX711_TIMEOUT_MS      1000  // 이 시간 동안 데이터 없으면 오류(빨강)
#define OVERLOAD_G            5200.0f // 5kg 로드셀 정격 초과
#define TARE_SAMPLES          10    // 영점 평균 샘플 수
#define BOOT_AUTOZERO_G       50.0f // 부팅 시 |무게|가 이 안이면 자동 영점
#define AZT_BAND_G            0.3f  // 영점 추적: 안정 & |w|<band 일 때 천천히 0으로
#define DEFAULT_COUNTS_PER_G  (-430.0f) // 미보정 추정치(미검증). 누르면 raw 감소 → 음수
#define CAL_REF_G_DEFAULT     1000.0f   // 기준 분동 무게 (NVS로 변경 가능)
#define CAL_MIN_DELTA_COUNTS  20000     // 기준 무게 올렸다고 판단할 최소 raw 변화
#define CAL_TIMEOUT_MS        60000
#define COUNT_FRAC_LIMIT      0.25f // |x-round(x)| 이 값 초과면 "확인 필요"

// ── 버튼 ──
#define BTN_DEBOUNCE_MS  30
#define BTN_LONG_MS      3000
#define BTN_MULTI_MS     350   // 두 번/세 번 누름 판정 간격 (한 번 누름은 이만큼 늦게 확정)

// ── 통신 ──
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define WIFI_LOST_TO_AP_MS      60000  // STA 끊긴 채 이만큼 지나면 AP 같이 켬
#define AP_RETRY_STA_MS         30000  // AP 모드에서 접속자 없을 때 STA 재시도 주기
#define UPLOAD_MIN_INTERVAL_MS  250    // 최대 4Hz
#define UPLOAD_HEARTBEAT_MS     2000   // 변화 없어도 2초마다
#define UPLOAD_DELTA_G          0.2f   // 이만큼 바뀌면 즉시 전송
#define HTTP_TIMEOUT_MS         3000
#define AP_IP_STR               "192.168.4.1"

// ── 블루투스 (docs/protocol.md) ──
#define BLE_NAME_PREFIX     "dalgrak-scale-"   // + 스티커 번호 2자리 (미설정이면 MAC 뒤 4자리)
#define BLE_SVC_UUID        "8f54b060-bfdc-4675-9b5c-7e456e1be5a7"
#define BLE_READING_UUID    "1f2184fe-273d-4949-be14-af1f11ea3346"
#define BLE_EVENT_UUID      "6f6a7bfe-c30c-44f1-9b40-9bf5b0965d0b"
#define BLE_COMMAND_UUID    "3db8af36-2b8d-4e5e-9ba4-5388f2606dc4"
#define BLE_INFO_UUID       "052f3d6b-6e53-44d2-864b-7cbbc0f1f557"
#define BLE_MTU             247
#define BLE_MSG_MAX         180   // 모든 JSON 메시지 상한 (MTU 협상 실패해도 잘리지 않게 관리)
#define GATT_READING_MS     200   // 구독 중 5Hz
#define KBD_WAIT_STABLE_MS  5000  // 키보드 모드: 버튼 후 안정까지 최대 대기
#define KBD_KEY_DELAY_MS    12    // 키 누름/뗌 사이 간격
#define CMD_UNIT_WAIT_MS    5000  // unit 명령: 안정까지 최대 대기

// ── 빌드 시 기본값 (선택) ──
// firmware/sam_scale/secrets.h 를 만들면(깃에 안 올라감) 13대 공통 Wi-Fi/서버를 바이너리에 넣을 수 있다.
// NVS 값이 있으면 NVS가 우선.
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef SAM_DEFAULT_WIFI_SSID
#define SAM_DEFAULT_WIFI_SSID ""
#endif
#ifndef SAM_DEFAULT_WIFI_PASS
#define SAM_DEFAULT_WIFI_PASS ""
#endif
#ifndef SAM_DEFAULT_SERVER_URL
#define SAM_DEFAULT_SERVER_URL ""
#endif
#ifndef SAM_DEFAULT_SERVER_KEY
#define SAM_DEFAULT_SERVER_KEY ""
#endif
