#include "Settings.h"
#include <Preferences.h>
#include "config.h"

Settings g_settings;

const char *runModeName(RunMode m) {
  switch (m) {
    case RunMode::Wifi: return "wifi";
    case RunMode::Gatt: return "gatt";
    case RunMode::Kbd: return "kbd";
  }
  return "?";
}
static const char *NS = "sam";
static const uint8_t SCHEMA = 1;

void Settings::load() {
  Preferences p;
  p.begin(NS, true);
  devNo = p.getShort("dev_id", -1);
  if (devNo < 0) {  // 0.2.0 이전 키(0 = 미설정) 이어받기
    uint8_t old = p.getUChar("dev_no", 0);
    if (old > 0) devNo = old;
  }
  calLock = p.getBool("cal_lock", false);
  hxSck = p.getChar("hx_sck", HX_SCK_DEFAULT);
  hxDt = p.getChar("hx_dt", HX_DT_DEFAULT);
  hxGnd = p.getChar("hx_gnd", HX_GND_DEFAULT);
  wifiSsid = p.getString("wifi_ssid", SAM_DEFAULT_WIFI_SSID);
  wifiPass = p.getString("wifi_pass", SAM_DEFAULT_WIFI_PASS);
  serverUrl = p.getString("srv_url", SAM_DEFAULT_SERVER_URL);
  serverKey = p.getString("srv_key", SAM_DEFAULT_SERVER_KEY);
  countsPerG = p.getFloat("cpg", 0);
  zeroOffset = p.getFloat("zero", 0);
  calRefG = p.getFloat("cal_ref", CAL_REF_G_DEFAULT);
  bandCounts = p.getFloat("st_cnt", STABLE_BAND_COUNTS_DEFAULT);
  unitG = p.getFloat("unit_g", 0);
  containerG = p.getFloat("cont_g", 0);
  azt = p.getBool("azt", true);
  logLevel = p.getUChar("log", 1);
  uint8_t m = p.getUChar("mode", (uint8_t)RunMode::Gatt);
  mode = m <= 2 ? (RunMode)m : RunMode::Gatt;
  p.end();
}

void Settings::save() {
  Preferences p;
  p.begin(NS, false);
  p.putUChar("schema", SCHEMA);
  p.putShort("dev_id", devNo);
  p.putBool("cal_lock", calLock);
  p.putChar("hx_sck", hxSck);
  p.putChar("hx_dt", hxDt);
  p.putChar("hx_gnd", hxGnd);
  p.putString("wifi_ssid", wifiSsid);
  p.putString("wifi_pass", wifiPass);
  p.putString("srv_url", serverUrl);
  p.putString("srv_key", serverKey);
  p.putFloat("cpg", countsPerG);
  p.putFloat("zero", zeroOffset);
  p.putFloat("cal_ref", calRefG);
  p.putFloat("st_cnt", bandCounts);
  p.putFloat("unit_g", unitG);
  p.putFloat("cont_g", containerG);
  p.putBool("azt", azt);
  p.putUChar("log", logLevel);
  p.putUChar("mode", (uint8_t)mode);
  p.end();
}

void Settings::saveZero() {
  Preferences p;
  p.begin(NS, false);
  p.putFloat("zero", zeroOffset);
  p.end();
}

void Settings::factoryReset() {
  Preferences p;
  p.begin(NS, false);
  p.clear();
  p.end();
  *this = Settings();
  load();
}
