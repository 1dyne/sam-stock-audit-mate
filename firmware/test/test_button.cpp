// 버튼 판정 시뮬레이션: 한 번/두 번/세 번/길게, 채터링
#include "Arduino.h"
#include "../sam_scale/Button.h"
uint32_t g_fakeMillis = 0;
int g_fakePin = HIGH;
FakeSerial Serial;
static int fails = 0;
static std::string seen;

static void step(uint32_t ms) {
  for (uint32_t t = 0; t < ms; t++) {
    g_fakeMillis++;
    BtnEvent e = g_button.loop(g_fakeMillis);
    if (e == BtnEvent::Single) seen += "S";
    if (e == BtnEvent::Double) seen += "D";
    if (e == BtnEvent::Triple) seen += "T";
    if (e == BtnEvent::Long) seen += "L";
  }
}
static void press(uint32_t ms) { g_fakePin = LOW; step(ms); g_fakePin = HIGH; }
static void check(const char *name, const char *want) {
  bool ok = seen == want;
  printf("  %s %-28s got=%s want=%s\n", ok ? "PASS" : "FAIL", name, seen.c_str(), want);
  if (!ok) fails++;
  seen.clear();
}
int main() {
  g_button.begin(41);
  step(100);
  press(120); step(600); check("한 번", "S");
  press(100); step(150); press(100); step(600); check("두 번", "D");
  press(100); step(150); press(100); step(150); press(100); step(600); check("세 번", "T");
  press(3200); step(600); check("길게 3초 (떼기 전 발생)", "L");
  press(1500); step(600); check("1.5초 누름 = 한 번", "S");
  // 채터링: 누를 때 5ms 동안 튐
  for (int i = 0; i < 5; i++) { g_fakePin = (i & 1) ? HIGH : LOW; step(1); }
  press(100); step(600); check("채터링 있는 한 번", "S");
  press(100); step(500); press(100); step(600); check("간격 500ms = 한 번 + 한 번", "SS");
  printf("\n%s (%d fail)\n", fails ? "FAILED" : "ALL PASS", fails);
  return fails;
}
