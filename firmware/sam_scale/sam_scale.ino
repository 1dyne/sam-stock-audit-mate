// sam (smart audit mate, "셈") — 저울 측정기 펌웨어
// 이 폴더의 .cpp/.h 파일이 전부 같이 있어야 한다 (Arduino IDE 위쪽 탭에 Ble.cpp, Scale.cpp ... 가 보여야 함)
// 보드: M5AtomS3, Partition Scheme: 8M with spiffs (3MB APP)

void samSetup();  // sam_main.cpp
void samLoop();
void setup();     // 원형을 직접 적어 두면 IDE가 자동 원형을 만들지 않는다
void loop();

void setup() { samSetup(); }
void loop() { samLoop(); }
