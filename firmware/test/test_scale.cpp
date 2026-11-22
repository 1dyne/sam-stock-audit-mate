// 측정 코어 시뮬레이션: 가짜 HX711 (10Hz, 무부하 -90650, 노이즈 ±30, 무게↑ → raw↓)
#include "Arduino.h"
#include "../sam_scale/Scale.h"
#include "../sam_scale/Settings.h"
#include <random>
uint32_t g_fakeMillis = 0;
FakeSerial Serial;
std::map<std::string, std::string> g_nvs;

static const float TRUE_CPG = -431.7f;  // "실제" 계수 (펌웨어는 모름)
static float g_load = 0;                // 저울 위 실제 무게 g
static float g_shake = 0;               // 흔들림 진폭 g
static std::mt19937 rng(42);
static int fails = 0;

class FakeAdc : public ScaleAdc {
 public:
  uint32_t next = 0;
  bool begin() override { return true; }
  bool read(int32_t &o) override {
    if (millis() < next) return false;
    next = millis() + 100;
    std::uniform_int_distribution<int> n(-30, 30);
    std::uniform_real_distribution<float> s(-1, 1);
    o = (int32_t)lroundf(-90650 + TRUE_CPG * (g_load + g_shake * s(rng))) + n(rng);
    return true;
  }
  const char *name() const override { return "fake"; }
} adc;

static void run(uint32_t ms) { for (uint32_t t = 0; t < ms; t += 5) { g_fakeMillis += 5; g_scale.update(g_fakeMillis); } }
static void check(bool c, const char *what) { printf("  %s %s\n", c ? "PASS" : "FAIL", what); if (!c) fails++; }
static uint32_t timeToStable(uint32_t max) { uint32_t t0 = g_fakeMillis; while (!g_scale.stable() && g_fakeMillis - t0 < max) run(5); return g_fakeMillis - t0; }

int main() {
  g_settings.load();
  g_scale.begin(&adc);
  printf("1) 부팅: 500ms 대기 + 5샘플 버림 + 자동 영점\n");
  run(400); check(!g_scale.ready(), "부팅 직후 ready=false");
  run(4600); check(g_scale.ready() && g_scale.tareCount() == 1, "ready & 자동 영점 1회");
  check(fabsf(g_scale.weightG()) < 0.3f, "영점 후 |w|<0.3g");

  printf("2) 보정: 1000g 기준\n");
  g_scale.startCal(1000);
  run(3000); check(g_scale.calPhase() == CalPhase::Load, "빈 저울 안정 → Load 단계");
  g_load = 1000; run(4000);
  check(g_scale.calPhase() == CalPhase::Ok, "기준 무게 안정 → 보정 OK");
  printf("  counts_per_g=%.2f (실제 %.2f)\n", g_settings.countsPerG, TRUE_CPG);
  check(fabsf(g_settings.countsPerG / TRUE_CPG - 1) < 0.002f, "계수 오차 < 0.2%");
  g_scale.clearCalResult();
  check(fabsf(g_scale.weightG() - 1000) < 1.0f, "1000g 표시 ±1g");
  g_load = 0; run(3000);
  check(fabsf(g_scale.weightG()) < 0.5f, "내리면 0g ±0.5g");

  printf("3) 보정 취소/타임아웃은 저장 안 함\n");
  float keep = g_settings.countsPerG;
  g_scale.startCal(500); run(2000); g_scale.cancelCal();
  check(g_scale.calPhase() == CalPhase::Idle && g_settings.countsPerG == keep, "취소 → 계수 유지");
  g_scale.startCal(500); run(62000);
  check(g_scale.calPhase() == CalPhase::Fail && g_settings.countsPerG == keep, "60s 타임아웃 → 계수 유지");
  g_scale.clearCalResult();

  printf("4) 안정 판정 / 흔들림\n");
  g_load = 250; run(150); check(!g_scale.stable(), "올린 직후 unstable");
  uint32_t ts = timeToStable(5000); printf("  안정까지 %ums\n", ts);
  check(ts < 2500, "2.5s 안에 stable");
  check(fabsf(g_scale.weightG() - 250) < 0.5f, "250g ±0.5g");
  g_shake = 3; run(2000); check(!g_scale.stable(), "±3g 흔들림 → unstable");
  g_shake = 0; ts = timeToStable(5000); check(ts < 2500, "흔들림 멈추면 다시 stable");

  printf("5) 용기 50g + 개당 2.5g 부품 — 수량 계산\n");
  g_load = 0; run(3000); g_scale.requestTare(); run(3000);
  g_load = 50; run(3000); String err;
  check(g_scale.setContainerFromCurrent(err), "용기 무게 등록");
  g_load = 50 + 10 * 2.5f; run(3000);
  check(g_scale.registerUnit(10, err), "10개로 개당 무게 등록");
  printf("  unit_g=%.3f\n", g_settings.unitG);
  for (int n : {1, 37, 120, 400}) {
    g_load = 50 + n * 2.5f; run(3000);
    CountResult c = Scale::count(g_scale.weightG(), g_settings.unitG, g_settings.containerG, g_settings.stableBandG);
    char m[80]; snprintf(m, 80, "%d개 → %ld개 (exact %.2f) check=%d", n, c.count, c.exact, c.needsCheck);
    check(c.valid && c.count == n && !c.needsCheck, m);
  }
  g_load = 50 + 37 * 2.5f + 1.25f; run(3000);  // 반 개 무게 (이물질/다른 부품)
  CountResult c = Scale::count(g_scale.weightG(), g_settings.unitG, g_settings.containerG, g_settings.stableBandG);
  check(c.needsCheck, "반 개 남는 무게 → 확인 필요");

  printf("6) 개당 무게가 너무 작으면 거부\n");
  g_load = 50 + 10 * 0.5f; run(3000);
  { bool r = g_scale.registerUnit(10, err); printf("  err=%s\n", err.c_str()); check(!r, "0.5g/개 거부"); }

  printf("7) ADC 끊김 → 오류\n");
  adc.next = 0xFFFFFFFF; run(1500); check(!g_scale.adcOk(), "1초 무응답 → adc_ok=false");
  adc.next = 0; run(500); check(g_scale.adcOk(), "복구");

  printf("8) 재부팅 후 NVS 값 유지\n");
  Settings s2; s2.load();
  check(s2.countsPerG == g_settings.countsPerG && s2.unitG > 2.4f, "계수·개당무게 NVS 저장됨");

  printf("\n%s (%d fail)\n", fails ? "FAILED" : "ALL PASS", fails);
  return fails ? 1 : 0;
}
