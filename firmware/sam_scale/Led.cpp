#include "Led.h"
Led g_led;

void Led::set(Rgb c, Blink b) { cur_ = c; blink_ = b; }

void Led::write(Rgb c) {
  if (c.r == shown_.r && c.g == shown_.g && c.b == shown_.b) return;
  rgbLedWrite(pin_, c.r, c.g, c.b);
  shown_ = c;
}

void Led::loop(uint32_t now) {
  bool on = true;
  switch (blink_) {
    case Blink::Solid: on = true; break;
    case Blink::Slow: on = (now % 1000) < 700; break;    // 1Hz, 길게 켜짐
    case Blink::Fast: on = (now % 250) < 125; break;     // 4Hz
    case Blink::Flash3: on = (now % 300) < 150; break;
  }
  write(on ? cur_ : Color::Off);
}
