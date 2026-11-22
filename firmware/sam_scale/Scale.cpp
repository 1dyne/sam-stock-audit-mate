#include "Scale.h"
#include "Settings.h"
#include "config.h"

Scale g_scale;

static float medianOf(const int32_t *b, uint8_t n) {
  int32_t t[8];
  for (uint8_t i = 0; i < n; i++) t[i] = b[i];
  for (uint8_t i = 1; i < n; i++) {  // 삽입 정렬 (n ≤ 8)
    int32_t k = t[i];
    int j = i - 1;
    while (j >= 0 && t[j] > k) { t[j + 1] = t[j]; j--; }
    t[j + 1] = k;
  }
  return (n & 1) ? (float)t[n / 2] : 0.5f * ((float)t[n / 2 - 1] + (float)t[n / 2]);
}

void Scale::begin(ScaleAdc *adc) {
  adc_ = adc;
  adc_->begin();
  bootMs_ = millis();
  lastSampleMs_ = bootMs_;
}

float Scale::countsPerG() const {
  return g_settings.calibrated() ? g_settings.countsPerG : DEFAULT_COUNTS_PER_G;
}

bool Scale::update(uint32_t now) {
  int32_t r;
  bool got = false;
  if (adc_->read(r)) {
    lastSampleMs_ = now;
    adcOk_ = true;
    if (now - bootMs_ < BOOT_SETTLE_MS) {
      // 부팅 직후 값은 버린다
    } else if (discarded_ < BOOT_DISCARD_SAMPLES) {
      discarded_++;
    } else {
      processSample(r, now);
      got = true;
    }
  } else if (now - lastSampleMs_ > HX711_TIMEOUT_MS) {
    adcOk_ = false;  // 배선 끊김 / 전원 문제
    stable_ = false;
  }
  tick(now);
  return got;
}

void Scale::processSample(int32_t r, uint32_t now) {
  raw_ = r;
  nSamples_++;
  float cpg0 = countsPerG();
  // 원시값이 현재 필터값과 크게 다르면(물건 올림/내림) 중앙값 지연을 기다리지 않고 즉시 unstable.
  // 안정 창을 비워서 새 값으로 창이 다시 찰 때까지 stable 이 나오지 않게 한다.
  if (medN_ >= MEDIAN_N && fabsf(((float)r - filt_) / cpg0) > STEP_DETECT_G) {
    stCount_ = 0;
    stable_ = false;
  }
  medBuf_[medI_] = r;
  medI_ = (medI_ + 1) % MEDIAN_N;
  if (medN_ < MEDIAN_N) medN_++;
  med_ = medianOf(medBuf_, medN_);

  float cpg = countsPerG();
  // 큰 변화(물건 올림/내림)는 평균 버퍼를 비워 빠르게 따라간다
  if (avgN_ > 0 && fabsf((med_ - filt_) / cpg) > FAST_TRACK_G) {
    avgN_ = 0;
    avgI_ = 0;
  }
  avgBuf_[avgI_] = med_;
  avgI_ = (avgI_ + 1) % AVG_N;
  if (avgN_ < AVG_N) avgN_++;
  float s = 0;
  for (uint8_t i = 0; i < avgN_; i++) s += avgBuf_[i];
  filt_ = s / avgN_;

  if (!ready_ && medN_ >= MEDIAN_N) ready_ = true;
  if (g_settings.zeroOffset == 0 && !g_settings.calibrated() && !bootZeroDone_) {
    g_settings.zeroOffset = filt_;  // 완전 첫 부팅: 일단 현재값을 영점으로
  }
  weight_ = (filt_ - g_settings.zeroOffset) / cpg;
  updateStability(now);

  // 영점 추적: 빈 저울이 천천히 흐르는 것(온도·크리프)을 0으로 붙잡는다
  if (g_settings.azt && stable_ && !taring() && !calibrating() && fabsf(weight_) < AZT_BAND_G) {
    g_settings.zeroOffset += (filt_ - g_settings.zeroOffset) * 0.05f;
  }

  // 영점 수집
  if (tare_ == TarePhase::Collect) {
    tareSum_ += med_;
    if (++tareN_ >= TARE_SAMPLES) {
      g_settings.zeroOffset = (float)(tareSum_ / tareN_);
      g_settings.saveZero();
      tare_ = TarePhase::Idle;
      tareDone_++;
      weight_ = 0;
      Serial.printf("[TARE] done zero=%.1f\n", g_settings.zeroOffset);
    }
  }
}

void Scale::updateStability(uint32_t now) {
  stT_[stHead_] = now;
  stW_[stHead_] = weight_;
  stHead_ = (stHead_ + 1) % ST_N;
  if (stCount_ < ST_N) stCount_++;
  float mn = 1e9, mx = -1e9;
  uint32_t oldest = now;
  for (uint8_t i = 0; i < stCount_; i++) {
    int idx = (stHead_ - 1 - i + ST_N) % ST_N;
    if (now - stT_[idx] > STABLE_WINDOW_MS) break;
    oldest = stT_[idx];
    mn = min(mn, stW_[idx]);
    mx = max(mx, stW_[idx]);
  }
  // 창이 거의 다 찼고(≥90%) 변동이 밴드 이하
  bool st = (now - oldest) >= (STABLE_WINDOW_MS * 9 / 10) && (mx - mn) <= g_settings.stableBandG;
  if (st && !stable_) stableSince_ = now;
  stable_ = st;
}

void Scale::tick(uint32_t now) {
  if (!ready_) return;

  // 부팅 자동 영점: 저울이 비어 있는 것 같으면(|w|<50g) 영점
  if (!bootZeroDone_ && (stable_ || now - bootMs_ > 4000)) {
    bootZeroDone_ = true;
    if (fabsf(weight_) < BOOT_AUTOZERO_G || !g_settings.calibrated()) {
      Serial.printf("[BOOT] auto tare (w=%.1fg)\n", weight_);
      requestTare();
    } else {
      Serial.printf("[BOOT] keep saved zero (w=%.1fg, 물건이 올라가 있는 듯)\n", weight_);
    }
  }

  if (tare_ == TarePhase::WaitStable && (stable_ || now - tareT0_ > 3000)) {
    tare_ = TarePhase::Collect;
    tareSum_ = 0;
    tareN_ = 0;
  }

  if (calibrating() && now - calT0_ > CAL_TIMEOUT_MS) {
    cal_ = CalPhase::Fail;
    snprintf(calMsg_, sizeof calMsg_, "timeout (저장 안 함)");
    Serial.printf("[CAL] fail: %s\n", calMsg_);
    return;
  }
  bool stableLong = stable_ && now - stableSince_ >= 1500;
  if (cal_ == CalPhase::Empty && stableLong) {
    calZero_ = filt_;
    cal_ = CalPhase::Load;
    calT0_ = now;
    Serial.printf("[CAL] zero=%.1f → 이제 %.0fg 기준 무게를 올리세요\n", calZero_, calRef_);
  } else if (cal_ == CalPhase::Load && stableLong && fabsf(filt_ - calZero_) > CAL_MIN_DELTA_COUNTS) {
    float cpg = (filt_ - calZero_) / calRef_;
    if (fabsf(cpg) < 50 || fabsf(cpg) > 5000) {
      cal_ = CalPhase::Fail;
      snprintf(calMsg_, sizeof calMsg_, "factor %.1f out of range (저장 안 함)", cpg);
      Serial.printf("[CAL] fail: %s\n", calMsg_);
    } else {
      saveCalibration(calZero_, cpg);
      cal_ = CalPhase::Ok;
      snprintf(calMsg_, sizeof calMsg_, "ok counts_per_g=%.3f", cpg);
      Serial.printf("[CAL] %s (저장됨) — 기준 무게를 내리세요\n", calMsg_);
    }
  }
}

void Scale::saveCalibration(float zero, float cpg) {
  g_settings.countsPerG = cpg;
  g_settings.zeroOffset = zero;
  g_settings.calRefG = calRef_;
  g_settings.save();
}

void Scale::requestTare() {
  if (calibrating()) return;
  tare_ = TarePhase::WaitStable;
  tareT0_ = millis();
  Serial.println("[TARE] requested");
}

void Scale::startCal(float refG) {
  if (refG <= 0) refG = g_settings.calRefG > 0 ? g_settings.calRefG : CAL_REF_G_DEFAULT;
  calRef_ = refG;
  cal_ = CalPhase::Empty;
  calT0_ = millis();
  tare_ = TarePhase::Idle;
  calMsg_[0] = 0;
  Serial.printf("[CAL] start ref=%.1fg → 저울을 비우고 기다리세요 (짧게 누르면 취소)\n", refG);
}

void Scale::cancelCal() {
  if (!calibrating()) return;
  cal_ = CalPhase::Idle;
  Serial.println("[CAL] cancelled (저장 안 함)");
}

bool Scale::registerUnit(int n, String &err) {
  if (n <= 0) { err = "개수는 1 이상"; return false; }
  if (!stable_) { err = "무게가 안정되지 않음"; return false; }
  float net = weight_ - g_settings.containerG;
  float u = net / n;
  if (u < g_settings.stableBandG * 3) { err = "개당 무게가 너무 작음 (저울로 세기 어려움)"; return false; }
  g_settings.unitG = u;
  g_settings.save();
  Serial.printf("[UNIT] n=%d net=%.2fg unit=%.3fg\n", n, net, u);
  return true;
}

bool Scale::setContainerFromCurrent(String &err) {
  if (!stable_) { err = "무게가 안정되지 않음"; return false; }
  g_settings.containerG = weight_;
  g_settings.save();
  Serial.printf("[CONTAINER] %.2fg\n", weight_);
  return true;
}

CountResult Scale::count(float w, float unitG, float containerG, float bandG) {
  CountResult r;
  if (unitG <= 0 || unitG < bandG * 3) return r;
  r.valid = true;
  r.exact = (w - containerG) / unitG;
  r.count = lroundf(r.exact);
  r.needsCheck = fabsf(r.exact - (float)r.count) > COUNT_FRAC_LIMIT || r.count < 0;
  return r;
}
