// 기기별 값 — NVS(Preferences, namespace "sam")에 저장. 같은 바이너리 13대 공통.
#pragma once
#include <Arduino.h>

enum class RunMode : uint8_t { Wifi = 0, Gatt = 1, Kbd = 2 };
const char *runModeName(RunMode m);


struct Settings {
  int16_t devNo = -1;           // 기기 번호 0~99 (0 = 샘플), -1 = 미설정(MAC 뒤 4자리 사용)
  bool calLock = false;         // true면 버튼·블루투스 보정 막음 (시리얼 보정만 가능)
  //
  int8_t hxSck = 5, hxDt = 6, hxGnd = 7;  // HX711 핀 (config.h 기본값, NVS로 변경)            // 스티커 번호 1~99, 0 = 미설정(MAC 뒤 4자리 사용)
  String wifiSsid, wifiPass;
  String serverUrl, serverKey;
  float countsPerG = 0;         // 0 = 미보정
  float zeroOffset = 0;         // 영점 raw
  float calRefG = 0;
  float bandCounts = 0;         // 안정 판정 밴드 (counts)
  float unitG = 0;              // 비상 페이지용 개당 무게 (온라인 수량은 PWA가 계산)
  float containerG = 0;         // 비상 페이지용 빈 용기 무게
  bool azt = true;              // 영점 추적
  uint8_t logLevel = 1;
  RunMode mode = RunMode::Gatt; // 기본: 혼자·폰 하나·서버 없음 (안드로이드 웹 블루투스)         // 0 끔, 1 = 2Hz 요약, 2 = 샘플마다

  void load();
  void save();
  void saveZero();              // 영점만 빠르게 저장
  void factoryReset();
  bool calibrated() const { return countsPerG != 0; }
};

extern Settings g_settings;
