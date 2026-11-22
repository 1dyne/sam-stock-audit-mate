#include "Hx711Adc.h"
#include <Arduino.h>

static portMUX_TYPE s_hxMux = portMUX_INITIALIZER_UNLOCKED;

bool Hx711Adc::begin() {
  pinMode(sck_, OUTPUT);
  pinMode(dt_, INPUT);
  digitalWrite(sck_, LOW);  // LOW 유지 = 동작 (60us 이상 HIGH면 파워다운)
  return true;
}

bool Hx711Adc::read(int32_t &out) {
  if (digitalRead(dt_) != LOW) return false;  // 아직 변환 안 끝남
  uint32_t v = 0;
  // 25펄스(24비트 + 게인128/채널A 선택 1펄스). Wi-Fi 인터럽트로 SCK HIGH가 길어지지 않게 크리티컬 섹션.
  portENTER_CRITICAL(&s_hxMux);
  for (int i = 0; i < 24; i++) {
    digitalWrite(sck_, HIGH);
    delayMicroseconds(1);
    v = (v << 1) | (uint32_t)digitalRead(dt_);
    digitalWrite(sck_, LOW);
    delayMicroseconds(1);
  }
  digitalWrite(sck_, HIGH);
  delayMicroseconds(1);
  digitalWrite(sck_, LOW);
  portEXIT_CRITICAL(&s_hxMux);
  if (v & 0x800000) v |= 0xFF000000;  // 24비트 부호 확장
  out = (int32_t)v;
  return true;
}
