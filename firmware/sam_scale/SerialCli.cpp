#include "SerialCli.h"
#include <Arduino.h>
#include "Settings.h"
#include "Scale.h"
#include "Net.h"
#include "config.h"

static String s_line;

static void help() {
  Serial.println(F(
      "명령:\n"
      "  info                  설정·상태 JSON 출력\n"
      "  id <1-99>             스티커 번호 저장 (sam-07) → 재부팅\n"
      "  ssid <이름>           Wi-Fi 이름 (공백 포함 가능)\n"
      "  pass <비번>           Wi-Fi 비밀번호\n"
      "  server <url>          측정값 POST 주소 (빈칸이면 전송 안 함: 'server -')\n"
      "  key <키>              서버 인증 키 ('key -' 지우기)\n"
      "  tare                  영점\n"
      "  cal [g]               보정 시작 (기본 기준무게 사용). 'cal cancel' 취소\n"
      "  calref <g>            기준 무게 저장\n"
      "  factor <counts/g>     보정 계수 직접 입력\n"
      "  band <g>              안정 판정 밴드\n"
      "  unit <N>              현재 무게/N → 개당 무게 (비상 페이지용)\n"
      "  container | container 0  현재 무게를 용기로 / 용기 0\n"
      "  azt <0|1>             영점 추적\n"
      "  log <0|1|2>           로그: 끔 / 2Hz / 샘플마다\n"
      "  ap                    AP(설정) 모드로 재부팅\n"
      "  reboot | factory      재부팅 / NVS 전부 지우기"));
}

void cliPrintInfo() {
  ServerStatus sv = g_net.server();
  Serial.printf(
      "{\"device_id\":\"%s\",\"device_no\":%u,\"mac\":\"%s\",\"fw_version\":\"%s\",\"calibrated\":%s,"
      "\"counts_per_g\":%.4f,\"zero\":%.1f,\"cal_ref_g\":%.1f,\"stable_band_g\":%.2f,\"azt\":%s,"
      "\"unit_g\":%.3f,\"container_g\":%.2f,\"wifi_ssid\":\"%s\",\"wifi_pass_set\":%s,\"server_url\":\"%s\","
      "\"server_key_set\":%s,\"net\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,\"srv_ok\":%s,\"srv_code\":%d,"
      "\"srv_sent\":%lu,\"srv_failed\":%lu,\"weight_g\":%.2f,\"raw\":%ld,\"stable\":%s,\"adc_ok\":%s}\n",
      deviceId().c_str(), g_settings.devNo, macHex().c_str(), SAM_FW_VERSION,
      g_settings.calibrated() ? "true" : "false", g_settings.countsPerG, g_settings.zeroOffset, g_settings.calRefG,
      g_settings.stableBandG, g_settings.azt ? "true" : "false", g_settings.unitG, g_settings.containerG,
      g_settings.wifiSsid.c_str(), g_settings.wifiPass.isEmpty() ? "false" : "true", g_settings.serverUrl.c_str(),
      g_settings.serverKey.isEmpty() ? "false" : "true", g_net.modeName(), g_net.ip().c_str(), g_net.rssi(),
      sv.ok ? "true" : "false", sv.lastCode, (unsigned long)sv.sent, (unsigned long)sv.failed, g_scale.weightG(),
      (long)g_scale.raw(), g_scale.stable() ? "true" : "false", g_scale.adcOk() ? "true" : "false");
}

extern void requestApReboot();

static void exec(String line) {
  line.trim();
  if (line.isEmpty()) return;
  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String arg = sp < 0 ? "" : line.substring(sp + 1);
  arg.trim();
  cmd.toLowerCase();
  String err;

  if (cmd == "help" || cmd == "?") help();
  else if (cmd == "info") cliPrintInfo();
  else if (cmd == "id") {
    int n = arg.toInt();
    if (n < 1 || n > 99) { Serial.println("ERR id 1~99"); return; }
    g_settings.devNo = n;
    g_settings.save();
    Serial.printf("OK id=sam-%02d → reboot\n", n);
    delay(300);
    ESP.restart();
  } else if (cmd == "ssid") { g_settings.wifiSsid = arg; g_settings.save(); Serial.println("OK (reboot 후 적용)"); }
  else if (cmd == "pass") { g_settings.wifiPass = arg; g_settings.save(); Serial.println("OK (reboot 후 적용)"); }
  else if (cmd == "server") { g_settings.serverUrl = arg == "-" ? "" : arg; g_settings.save(); Serial.println("OK"); }
  else if (cmd == "key") { g_settings.serverKey = arg == "-" ? "" : arg; g_settings.save(); Serial.println("OK"); }
  else if (cmd == "tare") g_scale.requestTare();
  else if (cmd == "cal") {
    if (arg == "cancel") g_scale.cancelCal();
    else g_scale.startCal(arg.toFloat());
  } else if (cmd == "calref") { g_settings.calRefG = arg.toFloat(); g_settings.save(); Serial.println("OK"); }
  else if (cmd == "factor") { g_settings.countsPerG = arg.toFloat(); g_settings.save(); Serial.println("OK"); }
  else if (cmd == "band") { g_settings.stableBandG = arg.toFloat(); g_settings.save(); Serial.println("OK"); }
  else if (cmd == "unit") Serial.println(g_scale.registerUnit(arg.toInt(), err) ? "OK" : "ERR " + err);
  else if (cmd == "container") {
    if (arg == "0") { g_settings.containerG = 0; g_settings.save(); Serial.println("OK"); }
    else Serial.println(g_scale.setContainerFromCurrent(err) ? "OK" : "ERR " + err);
  } else if (cmd == "azt") { g_settings.azt = arg.toInt() != 0; g_settings.save(); Serial.println("OK"); }
  else if (cmd == "log") { g_settings.logLevel = arg.toInt(); g_settings.save(); Serial.println("OK"); }
  else if (cmd == "ap") requestApReboot();
  else if (cmd == "reboot") ESP.restart();
  else if (cmd == "factory") { g_settings.factoryReset(); Serial.println("OK NVS cleared → reboot"); delay(300); ESP.restart(); }
  else Serial.printf("ERR unknown '%s' (help)\n", cmd.c_str());
}

void cliLoop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { exec(s_line); s_line = ""; }
    else if (s_line.length() < 200) s_line += c;
  }
}
