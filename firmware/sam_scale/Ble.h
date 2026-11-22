// 블루투스: GATT 모드(웹 블루투스) 또는 키보드 모드(BLE HID) — 한 번에 하나만 켠다.
// 메시지 형식: docs/protocol.md
#pragma once
#include <Arduino.h>
#include "Settings.h"

void bleBegin(RunMode m);           // RunMode::Gatt 또는 RunMode::Kbd
void bleLoop(uint32_t now);         // GATT: 구독 중이면 5Hz reading notify
bool bleConnected();
bool bleSecured();                  // 키보드: 암호화(페어링) 완료
bool bleReadingSubscribed();
const String &bleName();
void bleEvent(const char *json);    // GATT event notify (구독 중일 때만)
bool bleTakeCommand(char *buf, size_t n);  // GATT command write 큐에서 하나 꺼내기
bool bleTypeText(const char *s);
bool bleDeleteBonds();             // 저장된 페어링 전부 삭제    // 키보드: 숫자·'.'·'-'·'\n'만 지원
