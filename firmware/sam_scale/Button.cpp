#include "Button.h"
#include "config.h"
Button g_button;

BtnEvent Button::loop(uint32_t now) {
  bool raw = heldRaw();
  if (raw != lastRaw_) { lastRaw_ = raw; changeT_ = now; }
  if (now - changeT_ < BTN_DEBOUNCE_MS) return BtnEvent::None;
  if (raw && !down_) { down_ = true; longFired_ = false; downT_ = now; }
  if (down_ && raw && !longFired_ && now - downT_ >= BTN_LONG_MS) {
    longFired_ = true;
    return BtnEvent::Long;  // 손을 떼기 전에 바로 반응 (LED로 진입 확인)
  }
  if (!raw && down_) {
    down_ = false;
    if (!longFired_) return BtnEvent::Short;
  }
  return BtnEvent::None;
}
