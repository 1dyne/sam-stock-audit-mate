#include "Net.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_mac.h>
#include "Settings.h"
#include "Scale.h"
#include "config.h"
#include "WebPage.h"

Net g_net;
static WebServer s_web(80);
static DNSServer s_dns;
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static Reading s_latest;
static ServerStatus s_srv;
static volatile bool s_cmdTare = false, s_cmdIdentify = false;
static char s_ackId[24] = "";

const String &macHex() {
  static String s;
  if (s.isEmpty()) {
    uint8_t m[6];
    esp_read_mac(m, ESP_MAC_WIFI_STA);
    char b[13];
    snprintf(b, sizeof b, "%02X%02X%02X%02X%02X%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
    s = b;
  }
  return s;
}

const String &deviceId() {
  static String s;
  if (s.isEmpty()) {
    char b[16];
    if (g_settings.devNo >= 0) snprintf(b, sizeof b, "sam-%02d", g_settings.devNo);
    else snprintf(b, sizeof b, "sam-%s", macHex().substring(8).c_str());  // MAC 뒤 4자리
    s = b;
  }
  return s;
}

const char *Net::modeName() const {
  switch (mode_) {
    case NetMode::Off: return "off";
    case NetMode::Connecting: return "connecting";
    case NetMode::Online: return apOn_ ? "online+ap" : "online";
    case NetMode::Ap: return "ap";
    case NetMode::ApSta: return "ap+retry";
  }
  return "?";
}

String Net::ip() const {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  if (apOn_) return WiFi.softAPIP().toString();
  return "";
}
int Net::rssi() const { return WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0; }
bool Net::apHasClients() const { return apOn_ && WiFi.softAPgetStationNum() > 0; }

ServerStatus Net::server() const {
  portENTER_CRITICAL(&s_mux);
  ServerStatus c = s_srv;
  portEXIT_CRITICAL(&s_mux);
  return c;
}
void Net::publish(const Reading &r) {
  portENTER_CRITICAL(&s_mux);
  s_latest = r;
  portEXIT_CRITICAL(&s_mux);
}
bool Net::takeTareCmd() { bool v = s_cmdTare; s_cmdTare = false; return v; }
bool Net::takeIdentifyCmd() { bool v = s_cmdIdentify; s_cmdIdentify = false; return v; }

// ───────── Wi-Fi 상태 머신 ─────────
void Net::begin(bool forceAp) {
  WiFi.persistent(false);  // 자격 증명은 우리 NVS에만
  WiFi.setHostname(deviceId().c_str());
  forcedAp_ = forceAp;
  if (forceAp || g_settings.wifiSsid.isEmpty()) startAp(false);
  else startSta();
  setupWeb();  // Wi-Fi(lwIP) 초기화 뒤에 소켓 열기
  static TaskHandle_t h;
  xTaskCreatePinnedToCore([](void *) { g_net.uploaderTask(); }, "uploader", 10240, nullptr, 1, &h, 0);
}

void Net::startSta() {
  Serial.printf("[WIFI] connecting to \"%s\"\n", g_settings.wifiSsid.c_str());
  WiFi.mode(apOn_ ? WIFI_AP_STA : WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(g_settings.wifiSsid.c_str(), g_settings.wifiPass.c_str());
  mode_ = apOn_ ? NetMode::ApSta : NetMode::Connecting;
  modeT_ = lastRetryT_ = millis();
}

void Net::startAp(bool keepSta) {
  WiFi.mode(keepSta ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAP(deviceId().c_str());  // 열린 AP (참가자가 비번 없이 접속)
  delay(100);
  s_dns.setErrorReplyCode(DNSReplyCode::NoError);
  s_dns.start(53, "*", WiFi.softAPIP());
  apOn_ = true;
  mode_ = keepSta ? NetMode::ApSta : NetMode::Ap;
  modeT_ = lastRetryT_ = millis();
  Serial.printf("[WIFI] AP \"%s\" up at %s (설정/비상 측정 페이지)\n", deviceId().c_str(),
                WiFi.softAPIP().toString().c_str());
}

void Net::stopAp() {
  s_dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apOn_ = false;
  Serial.println("[WIFI] AP off");
}

void Net::loop(uint32_t now) {
  if (mode_ == NetMode::Off) return;  // 블루투스 모드에선 Wi-Fi 안 켬
  if (apOn_) s_dns.processNextRequest();
  s_web.handleClient();

  bool connected = WiFi.status() == WL_CONNECTED;
  switch (mode_) {
    case NetMode::Connecting:
    case NetMode::ApSta:
      if (connected) {
        Serial.printf("[WIFI] online ip=%s rssi=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
        if (!mdnsOn_ && MDNS.begin(deviceId().c_str())) { MDNS.addService("http", "tcp", 80); mdnsOn_ = true; }
        if (apOn_ && !forcedAp_ && !apHasClients()) stopAp();
        mode_ = NetMode::Online;
        lostT_ = 0;
      } else if (mode_ == NetMode::Connecting && now - modeT_ > WIFI_CONNECT_TIMEOUT_MS) {
        Serial.println("[WIFI] connect timeout → AP mode (STA 재시도는 계속)");
        startAp(true);
      } else if (mode_ == NetMode::ApSta && !apHasClients() && now - lastRetryT_ > AP_RETRY_STA_MS) {
        lastRetryT_ = now;
        Serial.println("[WIFI] retry STA");
        WiFi.disconnect();
        WiFi.begin(g_settings.wifiSsid.c_str(), g_settings.wifiPass.c_str());
      }
      break;
    case NetMode::Online:
      if (!connected) {
        if (!lostT_) { lostT_ = now; Serial.println("[WIFI] lost, reconnecting"); }
        if (now - lostT_ > WIFI_LOST_TO_AP_MS && !apOn_) {
          Serial.println("[WIFI] lost >60s → AP 같이 켬");
          startAp(true);
        }
      } else if (lostT_) {
        Serial.println("[WIFI] reconnected");
        lostT_ = 0;
        if (apOn_ && !forcedAp_ && !apHasClients()) stopAp();
      }
      break;
    case NetMode::Ap:
      if (!g_settings.wifiSsid.isEmpty() && !forcedAp_ && !apHasClients() && now - lastRetryT_ > AP_RETRY_STA_MS) {
        startSta();
      }
      break;
    default: break;
  }
}

// ───────── 기기 내장 웹 ─────────
static void sendJson(int code, const String &s) {
  s_web.sendHeader("Cache-Control", "no-store");
  s_web.send(code, "application/json", s);
}
static void okOrErr(bool ok, const String &err) {
  sendJson(ok ? 200 : 400, ok ? String("{\"ok\":true}") : "{\"ok\":false,\"error\":\"" + err + "\"}");
}
static String jsonEsc(const String &in) {
  String o;
  for (char c : in) { if (c == '"' || c == '\\') o += '\\'; if ((uint8_t)c >= 0x20) o += c; }
  return o;
}

static void handleState() {
  ServerStatus sv = g_net.server();
  CountResult c = Scale::count(g_scale.weightG(), g_settings.unitG, g_settings.containerG, g_scale.bandG());
  char b[900];
  snprintf(b, sizeof b,
           "{\"device_id\":\"%s\",\"fw_version\":\"%s\",\"weight_g\":%.2f,\"stable\":%s,\"raw\":%ld,"
           "\"adc_ok\":%s,\"calibrated\":%s,\"taring\":%s,\"cal_phase\":%d,\"unit_g\":%.3f,\"container_g\":%.2f,"
           "\"count\":%s,\"count_exact\":%.3f,\"needs_check\":%s,"
           "\"wifi\":{\"mode\":\"%s\",\"ip\":\"%s\",\"rssi\":%d},"
           "\"server\":{\"configured\":%s,\"ok\":%s,\"last_code\":%d}}",
           deviceId().c_str(), SAM_FW_VERSION, g_scale.weightG(), g_scale.stable() ? "true" : "false",
           (long)g_scale.raw(), g_scale.adcOk() ? "true" : "false", g_settings.calibrated() ? "true" : "false",
           g_scale.taring() ? "true" : "false", (int)g_scale.calPhase(), g_settings.unitG, g_settings.containerG,
           c.valid ? String(c.count).c_str() : "null", c.exact, c.needsCheck ? "true" : "false", g_net.modeName(),
           g_net.ip().c_str(), g_net.rssi(), sv.configured ? "true" : "false", sv.ok ? "true" : "false", sv.lastCode);
  sendJson(200, b);
}

static void redirectHome() {
  s_web.sendHeader("Location", String("http://") + AP_IP_STR + "/");
  s_web.send(302, "text/plain", "");
}

void Net::setupWeb() {
  s_web.on("/", HTTP_GET, [] { s_web.send_P(200, "text/html; charset=utf-8", PAGE_MAIN); });
  s_web.on("/setup", HTTP_GET, [] { s_web.send_P(200, "text/html; charset=utf-8", PAGE_SETUP); });
  s_web.on("/api/state", HTTP_GET, handleState);
  s_web.on("/api/tare", HTTP_POST, [] { g_scale.requestTare(); okOrErr(true, ""); });
  s_web.on("/api/unit", HTTP_POST, [] {
    String err;
    bool ok = g_scale.registerUnit(s_web.arg("n").toInt(), err);
    okOrErr(ok, err);
  });
  s_web.on("/api/container", HTTP_POST, [] {
    String err;
    bool ok = true;
    if (s_web.hasArg("clear")) { g_settings.containerG = 0; g_settings.save(); }
    else ok = g_scale.setContainerFromCurrent(err);
    okOrErr(ok, err);
  });
  s_web.on("/api/scan", HTTP_GET, [] {
    int n = WiFi.scanNetworks();  // 블로킹 2~3초 (설정 화면에서만)
    String s = "[";
    for (int i = 0; i < n; i++) {
      if (i) s += ',';
      s += "{\"ssid\":\"" + jsonEsc(WiFi.SSID(i)) + "\",\"rssi\":" + WiFi.RSSI(i) + "}";
    }
    s += "]";
    WiFi.scanDelete();
    sendJson(200, s);
  });
  s_web.on("/api/wifi", HTTP_POST, [] {
    String ss = s_web.arg("ssid");
    if (ss.isEmpty()) { okOrErr(false, "SSID 없음"); return; }
    g_settings.wifiSsid = ss;
    g_settings.wifiPass = s_web.arg("pass");
    g_settings.save();
    okOrErr(true, "");
    Serial.printf("[WIFI] saved ssid=\"%s\" → reboot\n", ss.c_str());
    delay(800);
    ESP.restart();
  });
  // 캡티브 포털 감지 URL들 → 메인 페이지로
  for (const char *u : {"/generate_204", "/gen_204", "/hotspot-detect.html", "/ncsi.txt", "/connecttest.txt",
                        "/canonical.html", "/success.txt", "/library/test/success.html"})
    s_web.on(u, redirectHome);
  s_web.onNotFound([] {
    if (g_net.mode() == NetMode::Online && !s_web.hostHeader().startsWith("192.168.4.")) s_web.send(404, "text/plain", "not found");
    else redirectHome();
  });
  s_web.begin();
}

// ───────── 서버 업로드 (코어 0 태스크) ─────────
static String buildPayload(const Reading &r) {
  char b[640];
  snprintf(b, sizeof b,
           "{\"v\":%d,\"device_id\":\"%s\",\"device_no\":%d,\"mac\":\"%s\",\"fw_version\":\"%s\","
           "\"seq\":%lu,\"ts_ms\":%lu,\"weight_g\":%.2f,\"stable\":%s,\"raw\":%ld,\"calibrated\":%s,"
           "\"adc_ok\":%s,\"state\":\"%s\",\"tare_count\":%lu,\"rssi\":%d%s%s%s}",
           SAM_CONTRACT_VERSION, deviceId().c_str(), g_settings.devNo, macHex().c_str(), SAM_FW_VERSION,
           (unsigned long)r.seq, (unsigned long)r.tsMs, r.weightG, r.stable ? "true" : "false", (long)r.raw,
           r.calibrated ? "true" : "false", r.adcOk ? "true" : "false", r.state, (unsigned long)r.tareCount,
           WiFi.RSSI(), s_ackId[0] ? ",\"ack\":\"" : "", s_ackId, s_ackId[0] ? "\"" : "");
  return String(b);
}

// 응답 예: {"ok":true,"cmds":[{"id":"c12","type":"tare"}]}  — 최소 파서 (JSON 라이브러리 없이)
static void parseCommands(const String &body) {
  int p = body.indexOf("\"cmds\"");
  if (p < 0) return;
  while ((p = body.indexOf("\"type\"", p)) >= 0) {
    int q1 = body.indexOf('"', body.indexOf(':', p) + 1), q2 = body.indexOf('"', q1 + 1);
    String type = body.substring(q1 + 1, q2);
    // 같은 객체의 id 찾기 (객체 시작 '{' 이후)
    int ob = body.lastIndexOf('{', p);
    int ip = body.indexOf("\"id\"", ob);
    int oe = body.indexOf('}', p);
    if (ip >= 0 && ip < oe) {
      int i1 = body.indexOf('"', body.indexOf(':', ip) + 1), i2 = body.indexOf('"', i1 + 1);
      strlcpy(s_ackId, body.substring(i1 + 1, i2).c_str(), sizeof s_ackId);
    }
    if (type == "tare") s_cmdTare = true;
    else if (type == "identify") s_cmdIdentify = true;
    Serial.printf("[SRV] cmd %s id=%s\n", type.c_str(), s_ackId);
    p = q2 + 1;
  }
}

void Net::uploaderTask() {
  WiFiClientSecure tls;
  tls.setInsecure();  // 인증서 검증 안 함 (미검증/수용한 위험 — SAM_SPEC.md 참고)
  WiFiClient plain;
  HTTPClient http;
  http.setReuse(true);
  http.setTimeout(HTTP_TIMEOUT_MS);
  Reading last;
  uint32_t lastSend = 0, backoff = 0;
  bool first = true;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(50));
    const String url = g_settings.serverUrl;
    portENTER_CRITICAL(&s_mux);
    s_srv.configured = !url.isEmpty();
    Reading r = s_latest;
    portEXIT_CRITICAL(&s_mux);
    if (url.isEmpty() || WiFi.status() != WL_CONNECTED) continue;
    uint32_t now = millis();
    if (now - lastSend < max<uint32_t>(UPLOAD_MIN_INTERVAL_MS, backoff)) continue;
    bool changed = first || fabsf(r.weightG - last.weightG) >= UPLOAD_DELTA_G || r.stable != last.stable ||
                   r.tareCount != last.tareCount || r.adcOk != last.adcOk || strcmp(r.state, last.state) != 0 ||
                   s_ackId[0];
    if (!changed && now - lastSend < UPLOAD_HEARTBEAT_MS) continue;

    String body = buildPayload(r);
    bool https = url.startsWith("https://");
    bool begun = https ? http.begin(tls, url) : http.begin(plain, url);
    int code = -1;
    String resp;
    uint32_t t0 = millis();
    if (begun) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Sam-Device", deviceId());
      if (!g_settings.serverKey.isEmpty()) http.addHeader("Authorization", "Bearer " + g_settings.serverKey);
      code = http.POST(body);
      if (code > 0) resp = http.getString();
      http.end();
    }
    uint32_t lat = millis() - t0;
    lastSend = millis();
    bool ok = code >= 200 && code < 300;
    if (ok) { s_ackId[0] = 0; parseCommands(resp); }
    portENTER_CRITICAL(&s_mux);
    s_srv.lastCode = code;
    s_srv.lastLatencyMs = lat;
    s_srv.ok = ok;
    if (ok) { s_srv.sent++; s_srv.lastOkMs = lastSend; } else s_srv.failed++;
    portEXIT_CRITICAL(&s_mux);
    if (ok) { backoff = 0; last = r; first = false; }
    else {
      backoff = backoff ? min<uint32_t>(backoff * 2, 10000) : 1000;
      Serial.printf("[SRV] POST fail code=%d (%s) retry in %lums\n", code, http.errorToString(code).c_str(),
                    (unsigned long)backoff);
    }
  }
}
