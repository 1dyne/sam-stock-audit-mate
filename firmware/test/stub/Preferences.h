#pragma once
#include "Arduino.h"
extern std::map<std::string, std::string> g_nvs;
class Preferences {
 public:
  bool begin(const char *, bool) { return true; }
  void end() {}
  void clear() { g_nvs.clear(); }
  uint8_t getUChar(const char *k, uint8_t d) { return g_nvs.count(k) ? (uint8_t)std::stoi(g_nvs[k]) : d; }
  void putUChar(const char *k, uint8_t v) { g_nvs[k] = std::to_string(v); }
  int8_t getChar(const char *k, int8_t d) { return g_nvs.count(k) ? (int8_t)std::stoi(g_nvs[k]) : d; }
  void putChar(const char *k, int8_t v) { g_nvs[k] = std::to_string(v); }
  int16_t getShort(const char *k, int16_t d) { return g_nvs.count(k) ? (int16_t)std::stoi(g_nvs[k]) : d; }
  void putShort(const char *k, int16_t v) { g_nvs[k] = std::to_string(v); }
  float getFloat(const char *k, float d) { return g_nvs.count(k) ? std::stof(g_nvs[k]) : d; }
  void putFloat(const char *k, float v) { char b[32]; snprintf(b, 32, "%.6f", v); g_nvs[k] = b; }
  bool getBool(const char *k, bool d) { return g_nvs.count(k) ? g_nvs[k] == "1" : d; }
  void putBool(const char *k, bool v) { g_nvs[k] = v ? "1" : "0"; }
  String getString(const char *k, const char *d) { return g_nvs.count(k) ? String(g_nvs[k]) : String(d); }
  void putString(const char *k, const String &v) { g_nvs[k] = v; }
};
