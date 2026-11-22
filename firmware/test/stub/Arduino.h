// 호스트 테스트용 최소 Arduino 스텁
#pragma once
#include <cstdint>
#include <cstdio>
#include <cmath>
#include <cstring>
#include <string>
#include <algorithm>
#include <map>
#include <cstdarg>
using std::min; using std::max;
extern uint32_t g_fakeMillis;
inline uint32_t millis() { return g_fakeMillis; }
inline void delay(uint32_t) {}
#define LOW 0
#define HIGH 1
#define INPUT_PULLUP 2
extern int g_fakePin;
inline void pinMode(uint8_t, uint8_t) {}
inline int digitalRead(uint8_t) { return g_fakePin; }
class String : public std::string {
 public:
  String() {}
  String(const char *s) : std::string(s ? s : "") {}
  String(const std::string &s) : std::string(s) {}
  bool isEmpty() const { return empty(); }
};
inline String operator+(const String &a, const char *b) { return String(std::string(a) + b); }
struct FakeSerial {
  bool quiet = false;
  void printf(const char *f, ...) { if (quiet) return; va_list a; va_start(a, f); vprintf(f, a); va_end(a); }
  void println(const char *s) { if (!quiet) puts(s); }
};
extern FakeSerial Serial;
#define F(x) x
