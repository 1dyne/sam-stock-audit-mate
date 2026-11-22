// Wi-Fi (STA 우선, 실패 시 AP+캡티브 포털), 기기 내장 웹서버, 서버 업로드(별도 태스크).
#pragma once
#include <Arduino.h>

enum class NetMode : uint8_t { Off, Connecting, Online, Ap, ApSta };

// 측정 루프 → 업로드 태스크로 넘기는 스냅샷
struct Reading {
  uint32_t seq = 0, tsMs = 0, tareCount = 0;
  float weightG = 0, filtRaw = 0;
  int32_t raw = 0;
  bool stable = false, calibrated = false, adcOk = true;
  const char *state = "boot";
};

struct ServerStatus {
  bool configured = false, ok = false;
  int lastCode = 0;
  uint32_t lastLatencyMs = 0, sent = 0, failed = 0, lastOkMs = 0;
};

class Net {
 public:
  void begin(bool forceAp);
  void loop(uint32_t now);
  void publish(const Reading &r);  // 최신 측정값 갱신 (메인 루프에서)
  NetMode mode() const { return mode_; }
  const char *modeName() const;
  String ip() const;
  int rssi() const;
  bool apHasClients() const;
  ServerStatus server() const;
  // 서버가 내린 명령 (메인 루프가 꺼내 처리)
  bool takeTareCmd();
  bool takeIdentifyCmd();

  // 업로드 태스크 내부용
  void uploaderTask();

 private:
  void startSta();
  void startAp(bool keepSta);
  void stopAp();
  void setupWeb();
  NetMode mode_ = NetMode::Off;
  bool forcedAp_ = false, apOn_ = false, mdnsOn_ = false;
  uint32_t modeT_ = 0, lostT_ = 0, lastRetryT_ = 0;
};

extern Net g_net;
const String &deviceId();
const String &macHex();
