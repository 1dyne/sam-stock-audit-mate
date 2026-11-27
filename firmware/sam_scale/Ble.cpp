// 블루투스 — ESP32 보드 패키지에 기본으로 들어 있는 BLE 라이브러리만 사용 (따로 설치할 라이브러리 없음)
#include "Ble.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEHIDDevice.h>
#include <BLESecurity.h>
#include <esp_mac.h>
#include "host/ble_gap.h"
#include "host/ble_store.h"
#include "config.h"
#include "Scale.h"
#include "Net.h"

static RunMode s_mode = RunMode::Gatt;
static BLEServer *s_srv = nullptr;
static BLECharacteristic *s_reading = nullptr, *s_event = nullptr, *s_info = nullptr, *s_command = nullptr;
static BLEHIDDevice *s_hid = nullptr;
static BLECharacteristic *s_kbdInput = nullptr;
static volatile bool s_connected = false, s_secured = false, s_readingSub = false, s_eventSub = false;
static QueueHandle_t s_cmdQ = nullptr;
static uint32_t s_lastReading = 0;
struct CmdMsg { char s[BLE_MSG_MAX + 1]; };

const String &bleName() {
  static String n;
  if (n.isEmpty()) {
    char b[32];
    if (g_settings.devNo >= 0) snprintf(b, sizeof b, BLE_NAME_PREFIX "%02d", g_settings.devNo);
    else snprintf(b, sizeof b, BLE_NAME_PREFIX "%s", macHex().substring(8).c_str());
    n = b;
  }
  return n;
}

bool bleConnected() { return s_connected; }
bool bleSecured() { return s_secured; }
bool bleReadingSubscribed() { return s_readingSub; }

static String buildInfo() {
  char b[BLE_MSG_MAX + 1];
  snprintf(b, sizeof b, "{\"fw\":\"%s\",\"cal\":%s,\"factor\":%.3f,\"ref\":%.1f,\"mode\":\"%s\",\"id\":\"%s\",\"unit\":%.3f,\"band\":%.2f}",
           SAM_FW_VERSION, g_settings.calibrated() ? "true" : "false", g_settings.countsPerG, g_settings.calRefG,
           runModeName(s_mode), bleName().c_str(), g_settings.unitG, g_scale.bandG());
  return String(b);
}

class SrvCb : public BLEServerCallbacks {
  void onConnect(BLEServer *, ble_gap_conn_desc *desc) override {
    s_connected = true;
    Serial.printf("[BLE] connected handle=%u\n", desc->conn_handle);
    if (s_mode == RunMode::Kbd) ble_gap_security_initiate(desc->conn_handle);  // 아이폰 페어링 시작
  }
  void onDisconnect(BLEServer *srv, ble_gap_conn_desc *) override {
    s_connected = false;
    s_secured = false;
    s_readingSub = false;
    s_eventSub = false;
    Serial.println("[BLE] disconnected → advertising");
    srv->startAdvertising();
  }
  void onMtuChanged(BLEServer *, ble_gap_conn_desc *, uint16_t mtu) override { Serial.printf("[BLE] MTU=%u\n", mtu); }
};

class SecCb : public BLESecurityCallbacks {
  void onAuthenticationComplete(ble_gap_conn_desc *desc) override {
    s_secured = desc->sec_state.encrypted;
    Serial.printf("[BLE] auth encrypted=%d bonded=%d\n", desc->sec_state.encrypted, desc->sec_state.bonded);
  }
};

class ChrCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    if (c != s_command) return;
    CmdMsg m;
    strlcpy(m.s, c->getValue().c_str(), sizeof m.s);
    if (xQueueSend(s_cmdQ, &m, 0) != pdTRUE) Serial.println("[BLE] command queue full");
  }
  void onRead(BLECharacteristic *c) override {
    if (c == s_info) c->setValue(buildInfo());
  }
  void onSubscribe(BLECharacteristic *c, ble_gap_conn_desc *, uint16_t sub) override {
    if (c == s_reading) s_readingSub = sub & 1;
    if (c == s_event) s_eventSub = sub & 1;
    Serial.printf("[BLE] subscribe %s=%u\n", c == s_reading ? "reading" : c == s_event ? "event" : "?", sub);
  }
};
static SrvCb s_srvCb;
static SecCb s_secCb;
static ChrCb s_chrCb;

// 표준 키보드 리포트 맵 (Report ID 1: 입력 8바이트, 출력 LED 1바이트)
static uint8_t KBD_REPORT_MAP[] = {
    0x05, 0x01, 0x09, 0x06, 0xA1, 0x01, 0x85, 0x01,                   // Keyboard, Report ID 1
    0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01,       // modifiers
    0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
    0x95, 0x01, 0x75, 0x08, 0x81, 0x01,                               // reserved
    0x95, 0x05, 0x75, 0x01, 0x05, 0x08, 0x19, 0x01, 0x29, 0x05, 0x91, 0x02,  // LEDs
    0x95, 0x01, 0x75, 0x03, 0x91, 0x01,
    0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81, 0x00,  // keys
    0xC0};

// 모드마다 다른 정적 랜덤 주소 → 폰이 GATT/HID 서비스 캐시를 섞지 않게
static void setModeAddress(RunMode m) {
  uint8_t mac[6], a[6];
  esp_read_mac(mac, ESP_MAC_BT);
  for (int i = 0; i < 6; i++) a[i] = mac[5 - i];  // 리틀엔디언
  a[0] ^= (m == RunMode::Kbd) ? 0x02 : 0x01;
  a[5] |= 0xC0;  // static random
  BLEDevice::setOwnAddr(a);
  BLEDevice::setOwnAddrType(BLE_OWN_ADDR_RANDOM);
}

void bleBegin(RunMode m) {
  s_mode = m;
  BLEDevice::init(bleName());
  setModeAddress(m);
  BLEDevice::setMTU(BLE_MTU);
  s_srv = BLEDevice::createServer();
  s_srv->setCallbacks(&s_srvCb);
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  BLEAdvertisementData ad, sr;
  ad.setFlags(0x06);  // LE General Discoverable, BR/EDR 미지원

  if (m == RunMode::Gatt) {
    s_cmdQ = xQueueCreate(4, sizeof(CmdMsg));
    BLEService *svc = s_srv->createService(BLE_SVC_UUID);
    s_reading = svc->createCharacteristic(BLE_READING_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    s_event = svc->createCharacteristic(BLE_EVENT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    s_command = svc->createCharacteristic(BLE_COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    s_info = svc->createCharacteristic(BLE_INFO_UUID, BLECharacteristic::PROPERTY_READ);
    for (auto *c : {s_reading, s_event, s_command, s_info}) c->setCallbacks(&s_chrCb);
    s_info->setValue(buildInfo());
    svc->start();
    ad.setCompleteServices(BLEUUID(BLE_SVC_UUID));  // 3+18 = 21바이트
    sr.setName(bleName());                         // 이름은 스캔 응답에 (31바이트 제한)
    adv->setScanResponse(true);
    adv->setScanResponseData(sr);
  } else {
    BLESecurity::setAuthenticationMode(true, false, true);  // 본딩, MITM 없음(Just Works), SC
    BLESecurity::setCapability(BLE_HS_IO_NO_INPUT_OUTPUT);
    BLEDevice::setSecurityCallbacks(&s_secCb);
    s_hid = new BLEHIDDevice(s_srv);
    s_kbdInput = s_hid->inputReport(1);
    s_hid->outputReport(1);
    s_hid->manufacturer(String("1dyne"));
    s_hid->pnp(0x02, 0x303A, 0x5341, 0x0200);
    s_hid->hidInfo(0x00, 0x01);
    s_hid->reportMap(KBD_REPORT_MAP, sizeof KBD_REPORT_MAP);
    s_hid->startServices();
    s_hid->setBatteryLevel(100);
    ad.setAppearance(0x03C1);  // HID Keyboard
    ad.setCompleteServices(s_hid->hidService()->getUUID());
    ad.setName(bleName());  // 3+4+4+18 = 29바이트
  }
  adv->setAdvertisementData(ad);
  adv->start();
  Serial.printf("[BLE] %s mode advertising as \"%s\" addr=%s\n", runModeName(m), bleName().c_str(),
                BLEDevice::getAddress().toString().c_str());
}

bool bleDeleteBonds() { return ble_store_clear() == 0; }

void bleEvent(const char *json) {
  if (s_mode != RunMode::Gatt || !s_event) return;
  size_t n = strlen(json);
  if (n > BLE_MSG_MAX) Serial.printf("[BLE] event too long (%u)\n", (unsigned)n);
  Serial.printf("[BLE] event %s\n", json);
  if (!s_connected || !s_eventSub) return;
  s_event->setValue((uint8_t *)json, min<size_t>(n, BLE_MSG_MAX));
  s_event->notify();
}

bool bleTakeCommand(char *buf, size_t n) {
  if (!s_cmdQ) return false;
  CmdMsg m;
  if (xQueueReceive(s_cmdQ, &m, 0) != pdTRUE) return false;
  strlcpy(buf, m.s, n);
  return true;
}

void bleLoop(uint32_t now) {
  if (s_mode != RunMode::Gatt || !s_connected || !s_readingSub) return;
  if (now - s_lastReading < GATT_READING_MS) return;
  s_lastReading = now;
  bool ok = g_scale.stable() && !g_scale.taring() && !g_scale.calibrating() && g_scale.adcOk() &&
            g_settings.calibrated() && g_scale.ready();
  char b[48];
  snprintf(b, sizeof b, "{\"t\":\"r\",\"g\":%.1f,\"s\":%d}", g_scale.weightG(), ok ? 1 : 0);
  s_reading->setValue((uint8_t *)b, strlen(b));
  s_reading->notify();
}

static uint8_t keycodeFor(char c) {
  if (c >= '1' && c <= '9') return 0x1E + (c - '1');
  if (c == '0') return 0x27;
  if (c == '.') return 0x37;
  if (c == '-') return 0x2D;
  if (c == '\n') return 0x28;  // Enter
  return 0;
}

bool bleTypeText(const char *s) {
  if (s_mode != RunMode::Kbd || !s_connected || !s_kbdInput) return false;
  uint8_t rep[8];
  for (const char *p = s; *p; p++) {
    uint8_t k = keycodeFor(*p);
    if (!k) continue;
    memset(rep, 0, sizeof rep);
    rep[2] = k;
    s_kbdInput->setValue(rep, sizeof rep);
    s_kbdInput->notify();
    delay(KBD_KEY_DELAY_MS);
    memset(rep, 0, sizeof rep);
    s_kbdInput->setValue(rep, sizeof rep);
    s_kbdInput->notify();
    delay(KBD_KEY_DELAY_MS);
  }
  return true;
}
