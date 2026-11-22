// 저울 ADC 인터페이스 — 측정 코어는 이것만 안다. ADC를 바꾸면 구현만 새로 만든다.
#pragma once
#include <stdint.h>

class ScaleAdc {
 public:
  virtual ~ScaleAdc() {}
  virtual bool begin() = 0;
  // 새 샘플이 있으면 out에 넣고 true. 블로킹하지 않는다.
  virtual bool read(int32_t &out) = 0;
  virtual const char *name() const = 0;
};
