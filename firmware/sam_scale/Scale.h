// 측정 코어: 필터(중앙값+이동평균), 안정 판정, 영점, 보정, 수량 계산.
// ADC 종류를 모른다 — ScaleAdc 인터페이스만 사용.
#pragma once
#include <Arduino.h>
#include "ScaleAdc.h"

enum class CalPhase : uint8_t { Idle, Empty, Load, Ok, Fail };
enum class TarePhase : uint8_t { Idle, WaitStable, Collect };

struct CountResult {
  bool valid = false;    // 개당 무게가 없거나 너무 작으면 false
  long count = 0;
  float exact = 0;       // 반올림 전 값
  bool needsCheck = false; // 소수부가 커서 사람 확인 필요
};

class Scale {
 public:
  void begin(ScaleAdc *adc);
  bool update(uint32_t now);  // 새 샘플 처리했으면 true

  // 상태
  int32_t raw() const { return raw_; }
  float medRaw() const { return med_; }
  float filtRaw() const { return filt_; }
  float weightG() const { return weight_; }
  bool stable() const { return stable_; }
  bool adcOk() const { return adcOk_; }
  bool ready() const { return ready_; }  // 부팅 대기·초기 샘플 버리기 끝남
  uint32_t samples() const { return nSamples_; }
  float countsPerG() const;

  // 영점
  void requestTare();
  bool taring() const { return tare_ != TarePhase::Idle; }
  uint32_t tareCount() const { return tareDone_; }

  // 보정
  void startCal(float refG);
  void cancelCal();
  CalPhase calPhase() const { return cal_; }
  bool calibrating() const { return cal_ == CalPhase::Empty || cal_ == CalPhase::Load; }
  void clearCalResult() { if (cal_ == CalPhase::Ok || cal_ == CalPhase::Fail) cal_ = CalPhase::Idle; }
  const char *calMsg() const { return calMsg_; }
  float calRef() const { return calRef_; }

  // 수량
  bool registerUnit(int n, String &err);   // 현재 (무게-용기)/n → 개당 무게, NVS 저장
  bool setContainerFromCurrent(String &err);
  static CountResult count(float weightG, float unitG, float containerG, float bandG);

 private:
  void processSample(int32_t r, uint32_t now);
  void updateStability(uint32_t now);
  void tick(uint32_t now);
  void saveCalibration(float zero, float cpg);

  ScaleAdc *adc_ = nullptr;
  uint32_t bootMs_ = 0, lastSampleMs_ = 0, nSamples_ = 0;
  uint8_t discarded_ = 0;
  bool ready_ = false, adcOk_ = true, bootZeroDone_ = false;

  int32_t raw_ = 0;
  int32_t medBuf_[8] = {0};
  uint8_t medN_ = 0, medI_ = 0;
  float avgBuf_[8] = {0};
  uint8_t avgN_ = 0, avgI_ = 0;
  float med_ = 0, filt_ = 0, weight_ = 0;

  // 안정 판정 링버퍼 (시간, 무게)
  static const int ST_N = 48;
  uint32_t stT_[ST_N];
  float stW_[ST_N];
  uint8_t stHead_ = 0, stCount_ = 0;
  bool stable_ = false;
  uint32_t stableSince_ = 0;

  TarePhase tare_ = TarePhase::Idle;
  uint32_t tareT0_ = 0, tareDone_ = 0;
  double tareSum_ = 0;
  uint8_t tareN_ = 0;

  CalPhase cal_ = CalPhase::Idle;
  float calRef_ = 0, calZero_ = 0;
  uint32_t calT0_ = 0;
  char calMsg_[64] = "";
};

extern Scale g_scale;
