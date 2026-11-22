#include <Arduino.h>
// sam (smart audit mate, "셈") — 저울 측정기 펌웨어 본체. setup()/loop()은 sam_scale.ino에서 samSetup()/samLoop()을 부른다
// 보드: M5Stack ATOMS3 Lite (ESP32-S3) + HX711 + 5kg 로드셀
// 동작 모드(NVS, 한 번에 하나): gatt(기본, 웹 블루투스) / kbd(BLE 키보드) / wifi(서버 전송·AP)
#include <Preferences.h>
#include <driver/gpio.h>
#include "config.h"
#include "Settings.h"
#include "Hx711Adc.h"
#include "Scale.h"
#include "Led.h"
#include "Button.h"
#include "Net.h"
#include "Ble.h"
#include "SerialCli.h"

static Hx711Adc *s_adc = nullptr;  // 핀은 NVS에서 읽은 뒤 만든다
static RunMode s_run = RunMode::Gatt;  // 이번 부팅에 실제로 켠 모드
static uint32_t s_seq = 0, s_identifyUntil = 0, s_lastLog = 0, s_calResultT = 0;

// 잠깐 덮어쓰는 LED (타이핑 성공/실패, 모드 전환)
static uint32_t s_flashUntil = 0;
static Rgb s_flashColor = Color::Off;
static Blink s_flashBlink = Blink::Solid;
static void flash(Rgb c, Blink b, uint32_t ms) { s_flashColor = c; s_flashBlink = b; s_flashUntil = millis() + ms; }

// 키보드 모드: 버튼 → 안정 대기 → 타이핑
static bool s_kbdPending = false;
static uint32_t s_kbdDeadline = 0;
// GATT unit 명령: 안정 대기
static int s_unitPendingN = 0;
static uint32_t s_unitDeadline = 0;
// 이벤트 감지용 이전 상태
static uint32_t s_prevTareCount = 0;
static CalPhase s_prevCal = CalPhase::Idle;
static bool s_prevAdcOk = true;

RunMode currentRunMode() { return s_run; }

// ── 재부팅 경로 ──
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
static Rgb modeColor(RunMode m) {
  return m == RunMode::Kbd ? Color::Purple : m == RunMode::Gatt ? Color::Cyan : Color::Blue;
}
void requestModeSwitch(RunMode m) {
  g_settings.mode = m;
  g_settings.save();
  Serial.printf("[SYS] mode → %s (NVS 저장) → reboot\n", runModeName(m));
  if (s_run == RunMode::Gatt) {
    char b[48];
    snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"mode\",\"v\":\"%s\"}", runModeName(m));
    bleEvent(b);
  }
  uint32_t t0 = millis();  // 새 모드 색으로 1.5초 깜빡이고 재부팅
  while (millis() - t0 < 1500) { g_led.set(modeColor(m), Blink::Flash3); g_led.loop(millis()); delay(10); }
  ESP.restart();
}

static bool measuringOk() {
  return g_scale.ready() && g_scale.adcOk() && g_settings.calibrated() && !g_scale.taring() &&
         !g_scale.calibrating() && fabsf(g_scale.weightG()) <= OVERLOAD_G;
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

// ── GATT 이벤트 ──
static void sendError(const char *code, const char *cmd = nullptr) {
  char b[96];
  if (cmd) snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"error\",\"code\":\"%s\",\"cmd\":\"%s\"}", code, cmd);
  else snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"error\",\"code\":\"%s\"}", code);
  bleEvent(b);
}

static void emitStateEvents() {
  if (s_run != RunMode::Gatt) return;
  char b[BLE_MSG_MAX + 1];
  if (g_scale.tareCount() != s_prevTareCount) {
    s_prevTareCount = g_scale.tareCount();
    snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"tare_done\",\"count\":%lu}", (unsigned long)s_prevTareCount);
    bleEvent(b);
  }
  CalPhase cp = g_scale.calPhase();
  if (cp != s_prevCal) {
    const char *step = cp == CalPhase::Empty ? "empty" : cp == CalPhase::Load ? "load" : cp == CalPhase::Ok ? "ok"
                       : cp == CalPhase::Fail ? "fail" : nullptr;
    if (step && cp == CalPhase::Ok)
      snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"cal_step\",\"step\":\"ok\",\"factor\":%.3f,\"ref\":%.1f}",
               g_settings.countsPerG, g_settings.calRefG);
    else if (step)
      snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"cal_step\",\"step\":\"%s\",\"ref\":%.1f}", step, g_settings.calRefG);
    else if (s_prevCal == CalPhase::Empty || s_prevCal == CalPhase::Load)
      snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"cal_step\",\"step\":\"cancel\"}");
    else b[0] = 0;
    if (b[0]) bleEvent(b);
    s_prevCal = cp;
  }
  if (g_scale.adcOk() != s_prevAdcOk) {
    s_prevAdcOk = g_scale.adcOk();
    if (!s_prevAdcOk) sendError("adc");
  }
}

// ── GATT 명령 (최소 JSON 파서) ──
static bool jsonStr(const String &j, const char *key, String &out) {
  int k = j.indexOf(String("\"") + key + "\"");
  if (k < 0) return false;
  int c = j.indexOf(':', k);
  int q1 = j.indexOf('"', c + 1), q2 = j.indexOf('"', q1 + 1);
  if (c < 0 || q1 < 0 || q2 < 0) return false;
  out = j.substring(q1 + 1, q2);
  return true;
}
static bool jsonNum(const String &j, const char *key, float &out) {
  int k = j.indexOf(String("\"") + key + "\"");
  if (k < 0) return false;
  int c = j.indexOf(':', k);
  if (c < 0) return false;
  String rest = j.substring(c + 1);
  rest.trim();
  if (rest.startsWith("\"")) rest = rest.substring(1);
  out = rest.toFloat();
  return true;
}

static void handleCommand(const String &j) {
  Serial.printf("[BLE] command %s\n", j.c_str());
  String cmd, v;
  float num = 0;
  if (!jsonStr(j, "cmd", cmd)) return sendError("bad_json");
  if (cmd == "tare") {
    if (g_scale.calibrating()) return sendError("busy", "tare");
    g_scale.requestTare();
  } else if (cmd == "unit") {
    if (!jsonNum(j, "n", num) || num < 1) return sendError("bad_arg", "unit");
    if (!g_settings.calibrated()) return sendError("uncalibrated", "unit");
    s_unitPendingN = (int)num;
    s_unitDeadline = millis() + CMD_UNIT_WAIT_MS;
  } else if (cmd == "cal") {
    if (!jsonNum(j, "ref", num) || num <= 0) num = 0;  // 없으면 저장된 기준 무게
    if (g_scale.calibrating()) return sendError("busy", "cal");
    g_scale.startCal(num);
  } else if (cmd == "cal_cancel") {
    g_scale.cancelCal();
  } else if (cmd == "mode") {
    if (!jsonStr(j, "v", v)) return sendError("bad_arg", "mode");
    if (v == "gatt") requestModeSwitch(RunMode::Gatt);
    else if (v == "kbd") requestModeSwitch(RunMode::Kbd);
    else if (v == "wifi") requestModeSwitch(RunMode::Wifi);
    else sendError("bad_arg", "mode");
  } else {
    sendError("unknown_cmd");
  }
}

static void processUnitPending(uint32_t now) {
  if (!s_unitPendingN) return;
  char b[BLE_MSG_MAX + 1];
  if (g_scale.stable() && measuringOk()) {
    String err;
    float net = g_scale.weightG() - g_settings.containerG;
    if (g_scale.registerUnit(s_unitPendingN, err))
      snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"unit_result\",\"ok\":true,\"n\":%d,\"unit\":%.3f,\"net\":%.1f}",
               s_unitPendingN, g_settings.unitG, net);
    else
      snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"unit_result\",\"ok\":false,\"n\":%d,\"err\":\"too_small\",\"net\":%.1f}",
               s_unitPendingN, net);
    bleEvent(b);
    s_unitPendingN = 0;
  } else if (now > s_unitDeadline) {
    snprintf(b, sizeof b, "{\"t\":\"e\",\"ev\":\"unit_result\",\"ok\":false,\"n\":%d,\"err\":\"unstable\"}", s_unitPendingN);
    bleEvent(b);
    s_unitPendingN = 0;
  }
}

// ── 키보드 모드: 버튼 → 안정 대기 → 무게 입력 ──
static void kbdRequest() {
  if (!bleConnected()) { Serial.println("[KBD] not connected"); flash(Color::Red, Blink::Solid, 1500); return; }
  s_kbdPending = true;
  s_kbdDeadline = millis() + KBD_WAIT_STABLE_MS;
  Serial.println("[KBD] waiting for stable");
}
static void processKbd(uint32_t now) {
  if (!s_kbdPending) return;
  if (g_scale.stable() && measuringOk()) {
    char b[24];
    snprintf(b, sizeof b, "%.1f\n", g_scale.weightG());
    bool ok = bleTypeText(b);
    Serial.printf("[KBD] typed %.1f ok=%d\n", g_scale.weightG(), ok);
    flash(ok ? Color::White : Color::Red, Blink::Solid, ok ? 150 : 1500);
    s_kbdPending = false;
  } else if (now > s_kbdDeadline || !bleConnected()) {
    Serial.printf("[KBD] not stable in %ums → nothing typed (state=%s)\n", KBD_WAIT_STABLE_MS, stateName());
    flash(Color::Red, Blink::Solid, 1500);
    s_kbdPending = false;
  }
}

// ── LED ──
// 우선순위: 잠깐 덮어쓰기 > 오류 > 보정 > 길게 누르는 중 > 식별 > 부팅 > 영점 > 모드별
static void updateLed(uint32_t now) {
  if (now < s_flashUntil) return g_led.set(s_flashColor, s_flashBlink);
  CalPhase cp = g_scale.calPhase();
  if (!g_scale.adcOk()) return g_led.set(Color::Red, Blink::Solid);
  if (cp == CalPhase::Empty) return g_led.set(Color::White, Blink::Slow);
  if (cp == CalPhase::Load) return g_led.set(Color::Cyan, Blink::Fast);
  if (cp == CalPhase::Ok || cp == CalPhase::Fail) {
    if (!s_calResultT) s_calResultT = now;
    if (now - s_calResultT < 3000) return g_led.set(cp == CalPhase::Ok ? Color::Green : Color::Red, Blink::Flash3);
    g_scale.clearCalResult();
    s_calResultT = 0;
  }
  if (g_button.holding() && g_button.heldMs(now) > 800) return g_led.set(Color::White, Blink::Solid);
  if (now < s_identifyUntil) return g_led.set(Color::White, Blink::Fast);
  if (!g_scale.ready()) return g_led.set(Color::Blue, Blink::Solid);
  if (g_scale.taring()) return g_led.set(Color::White, Blink::Solid);
  if (!g_settings.calibrated()) return g_led.set(Color::Red, Blink::Slow);

  switch (s_run) {
    case RunMode::Kbd:  // 보라 = 키보드 모드. 연결 전 깜빡, 연결 후 안정이면 보라 / 흔들리면 노랑
      if (!bleConnected()) return g_led.set(Color::Purple, Blink::Slow);
      if (s_kbdPending) return g_led.set(Color::Purple, Blink::Fast);
      return g_led.set(g_scale.stable() ? Color::Purple : Color::Yellow, Blink::Solid);
    case RunMode::Gatt:  // 청록 깜빡 = 폰 연결 대기, 연결 후 초록/노랑
      if (!bleConnected()) return g_led.set(Color::Cyan, Blink::Slow);
      return g_led.set(g_scale.stable() ? Color::Green : Color::Yellow, Blink::Solid);
    case RunMode::Wifi: {
      if (g_net.mode() == NetMode::Connecting) return g_led.set(Color::Blue, Blink::Slow);
      if ((g_net.mode() == NetMode::Ap || g_net.mode() == NetMode::ApSta) && !g_net.apHasClients())
        return g_led.set(Color::Purple, Blink::Solid);
      ServerStatus sv = g_net.server();
      bool srvProblem = g_net.mode() == NetMode::Online && sv.configured && !sv.ok;
      return g_led.set(g_scale.stable() ? Color::Green : Color::Yellow, srvProblem ? Blink::Slow : Blink::Solid);
    }
  }
}

static void logLine(uint32_t now, bool newSample) {
  uint8_t lv = g_settings.logLevel;
  if (lv == 0) return;
  if (lv == 1 && now - s_lastLog < 500) return;
  if (lv == 2 && !newSample) return;
  s_lastLog = now;
  char link[96];
  if (s_run == RunMode::Wifi) {
    ServerStatus sv = g_net.server();
    snprintf(link, sizeof link, "wifi=%s ip=%s rssi=%d srv=%s/%d", g_net.modeName(), g_net.ip().c_str(), g_net.rssi(),
             sv.configured ? (sv.ok ? "ok" : "err") : "none", sv.lastCode);
  } else {
    snprintf(link, sizeof link, "ble=%s conn=%d sec=%d sub=%d", runModeName(s_run), bleConnected(), bleSecured(),
             bleReadingSubscribed());
  }
  Serial.printf("[M] raw=%ld med=%.0f filt=%.1f w=%.2fg stable=%d state=%s | %s\n", (long)g_scale.raw(),
                g_scale.medRaw(), g_scale.filtRaw(), g_scale.weightG(), g_scale.stable(), stateName(), link);
}

static void handleButton(uint32_t now) {
  BtnEvent e = g_button.loop(now);
  if (e == BtnEvent::None) return;
  if (g_scale.calibrating() && e != BtnEvent::Long) { g_scale.cancelCal(); return; }  // 보정 중 아무 클릭 = 취소
  switch (e) {
    case BtnEvent::Single:
      if (s_run == RunMode::Kbd) kbdRequest();
      else g_scale.requestTare();
      break;
    case BtnEvent::Double:
      g_scale.requestTare();
      break;
    case BtnEvent::Triple: {  // 모드 순환 gatt → kbd → wifi → gatt
      RunMode next = s_run == RunMode::Gatt ? RunMode::Kbd : s_run == RunMode::Kbd ? RunMode::Wifi : RunMode::Gatt;
      requestModeSwitch(next);
      break;
    }
    case BtnEvent::Long:
      if (!g_scale.calibrating()) g_scale.startCal(0);
      break;
    default: break;
  }
}

// HX711 GND 대용 핀: 가장 먼저 LOW (HX711 전원). 절대 HIGH로 바꾸지 않는다.
static bool hxPinOk(int p) { return p == 1 || p == 2 || p == 5 || p == 6 || p == 7 || p == 8 || p == 38 || p == 39; }
static void hxGroundEarly(int pin) {
  if (pin < 0 || !hxPinOk(pin)) return;
  digitalWrite(pin, LOW);  // 출력으로 바꾸기 전에 래치를 LOW로 → HIGH 순간이 생기지 않게
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  gpio_set_drive_capability((gpio_num_t)pin, GPIO_DRIVE_CAP_3);  // 최대 구동력 (싱크 전압 강하 최소화)
}

void samSetup() {
  // 1) HX711 GND 대용 핀 (NVS 읽기 전엔 기본값 G7로 먼저 — 실험용 보드가 바로 켜지게)
  hxGroundEarly(HX_GND_DEFAULT);
  // 2) 부팅 LED 파랑 — 전원·부팅 눈으로 확인
  g_led.begin(PIN_LED);
  g_led.set(Color::Blue);
  g_led.loop(0);
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);  // 모니터가 안 열려 있어도 로그 때문에 루프가 막히지 않게
  g_button.begin(PIN_BUTTON);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 1500) delay(10);

  g_settings.load();
  if (g_settings.hxGnd != HX_GND_DEFAULT) {
    // 밋업 보드(-1) 등: 기본 G7은 입력으로 되돌린다 (LOW 유지도 무해하지만 쓰지 않는 핀은 놓아 둠)
    if (HX_GND_DEFAULT >= 0 && g_settings.hxDt != HX_GND_DEFAULT && g_settings.hxSck != HX_GND_DEFAULT) pinMode(HX_GND_DEFAULT, INPUT);
    hxGroundEarly(g_settings.hxGnd);
  }
  Serial.printf("[BOOT] HX711 pins DT=G%d SCK=G%d GND=%s%d\n", g_settings.hxDt, g_settings.hxSck,
                g_settings.hxGnd >= 0 ? "G" : "", g_settings.hxGnd);
  bool forceAp = consumeForceAp();
  delay(50);
  if (g_button.heldRaw()) { forceAp = true; Serial.println("[BOOT] button held → 이번 부팅만 Wi-Fi AP 설정 모드"); }
  s_run = forceAp ? RunMode::Wifi : g_settings.mode;

  Serial.printf("\n[BOOT] sam fw %s | mode=%s | id=%s ble=%s mac=%s | calibrated=%d cpg=%.3f\n", SAM_FW_VERSION,
                runModeName(s_run), deviceId().c_str(), bleName().c_str(), macHex().c_str(), g_settings.calibrated(),
                g_settings.countsPerG);
  s_adc = new Hx711Adc(g_settings.hxSck, g_settings.hxDt);
  g_scale.begin(s_adc);
  if (s_run == RunMode::Wifi) g_net.begin(forceAp);
  else bleBegin(s_run);
  Serial.println("[BOOT] 'help' 로 명령 목록");
}

void samLoop() {
  uint32_t now = millis();
  bool newSample = g_scale.update(now);
  handleButton(now);

  if (s_run == RunMode::Wifi) {
    if (g_net.takeTareCmd()) g_scale.requestTare();
    if (g_net.takeIdentifyCmd()) s_identifyUntil = now + 5000;
    if (newSample || !g_scale.adcOk()) {
      static uint32_t lastErrPub = 0;
      if (newSample || now - lastErrPub > 1000) {
        lastErrPub = now;
        Reading r;
        r.seq = ++s_seq;
        r.tsMs = now;
        r.weightG = g_scale.weightG();
        r.filtRaw = g_scale.filtRaw();
        r.raw = g_scale.raw();
        r.stable = g_scale.stable() && measuringOk();
        r.calibrated = g_settings.calibrated();
        r.adcOk = g_scale.adcOk();
        r.tareCount = g_scale.tareCount();
        r.state = stateName();
        g_net.publish(r);
      }
    }
    g_net.loop(now);
  } else {
    char cmd[BLE_MSG_MAX + 1];
    while (bleTakeCommand(cmd, sizeof cmd)) handleCommand(String(cmd));
    processUnitPending(now);
    processKbd(now);
    emitStateEvents();
    bleLoop(now);
  }

  updateLed(now);
  g_led.loop(now);
  cliLoop();
  logLine(now, newSample);
  delay(1);
}
