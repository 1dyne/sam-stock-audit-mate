// 내장 RGB LED (WS2812, G35). 색 + 깜빡임 패턴.
#pragma once
#include <Arduino.h>

enum class Blink : uint8_t { Solid, Slow, Fast, Flash3 };

struct Rgb { uint8_t r, g, b; };
namespace Color {
static const Rgb Off{0, 0, 0}, Blue{0, 0, 40}, Yellow{40, 28, 0}, Green{0, 40, 0},
    Purple{30, 0, 40}, Red{50, 0, 0}, White{30, 30, 30}, Cyan{0, 30, 30};
}

class Led {
 public:
  void begin(uint8_t pin) { pin_ = pin; write(Color::Off); }
  void set(Rgb c, Blink b = Blink::Solid);
  void loop(uint32_t now);
 private:
  void write(Rgb c);
  uint8_t pin_ = 0;
  Rgb cur_{0, 0, 0}, shown_{1, 1, 1};
  Blink blink_ = Blink::Solid;
};
extern Led g_led;
