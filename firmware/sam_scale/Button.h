// 내장 버튼 (G41, active LOW). 짧게 / 길게(3초) 이벤트.
#pragma once
#include <Arduino.h>

enum class BtnEvent : uint8_t { None, Short, Long };

class Button {
 public:
  void begin(uint8_t pin) { pin_ = pin; pinMode(pin_, INPUT_PULLUP); }
  bool heldRaw() const { return digitalRead(pin_) == LOW; }
  BtnEvent loop(uint32_t now);
  bool holding() const { return down_; }
  uint32_t heldMs(uint32_t now) const { return down_ ? now - downT_ : 0; }
 private:
  uint8_t pin_ = 0;
  bool down_ = false, longFired_ = false, lastRaw_ = false;
  uint32_t downT_ = 0, changeT_ = 0;
};
extern Button g_button;
