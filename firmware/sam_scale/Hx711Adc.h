// HX711 드라이버 (외부 라이브러리 없이 비트뱅, 채널 A 게인 128)
#pragma once
#include "ScaleAdc.h"

class Hx711Adc : public ScaleAdc {
 public:
  Hx711Adc(uint8_t sck, uint8_t dt) : sck_(sck), dt_(dt) {}
  bool begin() override;
  bool read(int32_t &out) override;
  const char *name() const override { return "HX711"; }

 private:
  uint8_t sck_, dt_;
};
