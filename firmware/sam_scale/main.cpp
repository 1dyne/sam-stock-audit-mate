#include <Arduino.h>
// sam (smart audit mate, "셈") — 저울 측정기 펌웨어 본체 (.ino 전처리를 피하려고 .cpp에 둠)
// 보드: M5Stack ATOMS3 Lite (ESP32-S3) + HX711 + 5kg 로드셀
#include <Preferences.h>
#include "config.h"
#include "Settings.h"
#include "Hx711Adc.h"
#include "Scale.h"
#include "Led.h"
#include "Button.h"
#include "Net.h"
#include "SerialCli.h"

static Hx711Adc s_adc(PIN_HX711_SCK, PIN_HX711_DT);
static uint32_t s_seq = 0, s_identifyUntil = 0, s_lastLog = 0, s_calResultT = 0;

// 'ap' 명령/버튼으로 다음 부팅을 AP 모드로
void requestApReboot() {
  Preferences p;
  p.begin("sam_rt", false);
  p.putBool("force_ap", true);
  p.end();
  Serial.println("[SYS] reboot into AP mode");
  delay(300);
  ESP.restart();
}
static bool consumeForceAp() {
  Preferences p;
  p.begin("sam_rt", false);
  bool v = p.getBool("force_ap", false);
  if (v) p.remove("force_ap");
  p.end();
  return v;
}

static const char *stateName() {
  if (!g_scale.adcOk()) return "adc_error";
  if (g_scale.calibrating()) return "calibrating";
  if (!g_settings.calibrated()) return "uncalibrated";
  if (g_scale.taring()) return "taring";
  if (!g_scale.ready()) return "boot";
  if (fabsf(g_scale.weightG()) > OVERLOAD_G) return "overload";
  return "measuring";
}

// LED 우선순위: 오류 > 보정 > 식별 > 부팅 > 영점 > AP 대기 > 측정(안정/흔들림, 서버 문제면 깜빡임)
static void updateLed(uint32_t now) {
  CalPhase cp = g_scale.calPhase();
  if (!g_scale.adcOk()) return g_led.set(Color::Red, Blink::Solid);
  if (cp == CalPhase::Empty) return g_led.set(Color::White, Blink::Slow);
  if (cp == CalPhase::Load) return g_led.set(Color::Cyan, Blink::Slow);
  if (cp == CalPhase::Ok || cp == CalPhase::Fail) {
    if (!s_calResultT) s_calResultT = now;
    if (now - s_calResultT < 3000) return g_led.set(cp == CalPhase::Ok ? Color::Green : Color::Red, Blink::Flash3);
    g_scale.clearCalResult();
    s_calResultT = 0;
  }
  if (g_button.holding() && g_button.heldMs(now) > 800) return g_led.set(Color::White, Blink::Solid);  // 길게 누르는 중
  if (now < s_identifyUntil) return g_led.set(Color::White, Blink::Fast);
  if (!g_scale.ready() || g_net.mode() == NetMode::Connecting) return g_led.set(Color::Blue, g_scale.ready() ? Blink::Slow : Blink::Solid);
  if (g_scale.taring()) return g_led.set(Color::White, Blink::Solid);
  if ((g_net.mode() == NetMode::Ap || g_net.mode() == NetMode::ApSta) && !g_net.apHasClients())
    return g_led.set(Color::Purple, Blink::Solid);
  if (!g_settings.calibrated()) return g_led.set(Color::Red, Blink::Slow);
  ServerStatus sv = g_net.server();
  bool online = g_net.mode() == NetMode::Online;
  bool srvProblem = online && sv.configured && !sv.ok;
  g_led.set(g_scale.stable() ? Color::Green : Color::Yellow, srvProblem ? Blink::Slow : Blink::Solid);
}

static void logLine(uint32_t now, bool newSample) {
  uint8_t lv = g_settings.logLevel;
  if (lv == 0) return;
  if (lv == 1 && now - s_lastLog < 500) return;
  if (lv == 2 && !newSample) return;
  s_lastLog = now;
  ServerStatus sv = g_net.server();
  Serial.printf("[M] raw=%ld med=%.0f filt=%.1f w=%.2fg stable=%d state=%s | wifi=%s ip=%s rssi=%d | srv=%s code=%d %lums ok=%lu fail=%lu\n",
                (long)g_scale.raw(), g_scale.medRaw(), g_scale.filtRaw(), g_scale.weightG(), g_scale.stable(),
                stateName(), g_net.modeName(), g_net.ip().c_str(), g_net.rssi(),
                sv.configured ? (sv.ok ? "ok" : "err") : "none", sv.lastCode, (unsigned long)sv.lastLatencyMs,
                (unsigned long)sv.sent, (unsigned long)sv.failed);
}

void setup() {
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);  // 모니터가 안 열려 있어도 로그 때문에 루프가 막히지 않게 (버퍼 차면 버림)
  g_led.begin(PIN_LED);
  g_led.set(Color::Blue);
  g_led.loop(0);
  g_button.begin(PIN_BUTTON);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 1500) delay(10);  // USB CDC 잠깐 기다림 (없어도 진행)

  g_settings.load();
  bool forceAp = consumeForceAp();
  delay(50);
  if (g_button.heldRaw()) { forceAp = true; Serial.println("[BOOT] button held → AP 설정 모드"); }

  Serial.printf("\n[BOOT] sam fw %s contract v%d | id=%s mac=%s | calibrated=%d cpg=%.3f\n", SAM_FW_VERSION,
                SAM_CONTRACT_VERSION, deviceId().c_str(), macHex().c_str(), g_settings.calibrated(),
                g_settings.countsPerG);
  g_scale.begin(&s_adc);
  g_net.begin(forceAp);
  Serial.println("[BOOT] 'help' 로 명령 목록");
}

void loop() {
  uint32_t now = millis();
  bool newSample = g_scale.update(now);

  switch (g_button.loop(now)) {
    case BtnEvent::Short:
      if (g_scale.calibrating()) g_scale.cancelCal();
      else g_scale.requestTare();
      break;
    case BtnEvent::Long:
      if (!g_scale.calibrating()) g_scale.startCal(0);
      break;
    default: break;
  }
  if (g_net.takeTareCmd()) g_scale.requestTare();
  if (g_net.takeIdentifyCmd()) s_identifyUntil = now + 5000;

  if (newSample) {
    Reading r;
    r.seq = ++s_seq;
    r.tsMs = now;
    r.weightG = g_scale.weightG();
    r.filtRaw = g_scale.filtRaw();
    r.raw = g_scale.raw();
    r.stable = g_scale.stable() && !g_scale.taring() && !g_scale.calibrating();
    r.calibrated = g_settings.calibrated();
    r.adcOk = g_scale.adcOk();
    r.tareCount = g_scale.tareCount();
    r.state = stateName();
    g_net.publish(r);
  } else if (!g_scale.adcOk()) {
    Reading r;
    r.seq = ++s_seq;
    r.tsMs = now;
    r.adcOk = false;
    r.state = "adc_error";
    r.calibrated = g_settings.calibrated();
    static uint32_t lastErrPub = 0;
    if (now - lastErrPub > 1000) { lastErrPub = now; g_net.publish(r); }
  }

  updateLed(now);
  g_led.loop(now);
  g_net.loop(now);
  cliLoop();
  logLine(now, newSample);
  delay(1);
}
