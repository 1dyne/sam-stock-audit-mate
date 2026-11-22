#include "Button.h"
#include "config.h"
Button g_button;

BtnEvent Button::loop(uint32_t now) {
  bool raw = heldRaw();
  if (raw != lastRaw_) { lastRaw_ = raw; changeT_ = now; }
  if (now - changeT_ >= BTN_DEBOUNCE_MS) {
    if (raw && !down_) { down_ = true; longFired_ = false; downT_ = now; }
    if (down_ && raw && !longFired_ && now - downT_ >= BTN_LONG_MS) {
      longFired_ = true;
      clicks_ = 0;
      return BtnEvent::Long;  // 손 떼기 전에 반응
    }
    if (!raw && down_) {
      down_ = false;
      upT_ = now;
      if (!longFired_ && clicks_ < 3) clicks_++;
    }
  }
  // 마지막으로 뗀 뒤 BTN_MULTI_MS 동안 다음 누름이 없으면 클릭 수 확정
  if (!down_ && clicks_ && now - upT_ >= BTN_MULTI_MS) {
    uint8_t c = clicks_;
    clicks_ = 0;
    return c == 1 ? BtnEvent::Single : c == 2 ? BtnEvent::Double : BtnEvent::Triple;
  }
  return BtnEvent::None;
}
