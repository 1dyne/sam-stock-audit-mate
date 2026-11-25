# 서드파티 고지

라이선스 파일은 2026-11-22에 각 저장소에서 직접 확인했습니다.

| 구성 요소 | 쓰는 방식 | 라이선스 | 확인한 곳 |
|---|---|---|---|
| OpenTally — `src/core/detect.js`, `src/core/imageops.js`, `src/worker.js` | `web/vendor/opentally/`에 복사. `worker.js`의 import 경로 1줄만 수정. 사진 세기는 이 코드로 **휴대폰 안에서만** 계산(네트워크 호출 없음, AI 모델 없음) | MIT, "Copyright (c) 2026 OpenTally contributors" | github.com/DylanMartinLSC/opentally `LICENSE` (커밋 3da4631, 2026-10-30). 원문을 `web/vendor/opentally/LICENSE`로 함께 배포 |
| warehouse-inventory-count | **코드는 복사하지 않음.** 재실사 → 확인 흐름만 참고 | MIT, "Copyright (c) 2026 Arif Enes Aydin" | github.com/arifaydin12/warehouse-inventory-count `LICENSE` |
| JetBrains Mono (500·700, latin) | `web/fonts/` 숫자 표시용, @fontsource/jetbrains-mono 5.1.1에서 복사 | SIL OFL 1.1 | npm `@fontsource/jetbrains-mono@5.1.1` |
| wrangler 4.166.0 | 서버 배포·로컬 실행 도구(개발 의존성, 배포물에 포함 안 됨) | MIT OR Apache-2.0 | npm |

펌웨어(`firmware/`)는 외부 라이브러리 없이 보드 패키지(arduino-esp32, 내장 BLE 포함)만 씁니다. 자세한 내용은 `firmware/README.md`.

## 캐릭터 그림
`web/chars/*.webp`(셈·사만다)는 이 저장소에서 셰이더로 직접 렌더한 그림이며 코드와 같은 MIT 라이선스로 배포합니다.

## 쓰지 않는 것
- **SAM 3** 가중치(Meta SAM 라이선스), **ScrewCount, GeCo, CountGD** 가중치: 쓰지도 받지도 않습니다.
- `web/js/photo-engine.js`의 `RemoteEngine`은 2단계 서버 엔진 자리만 남겨 둔 것입니다(OpenTally `backend/sam3_server.py`를 `OPENTALLY_MODEL=owlv2`로 띄우는 전제, OWLv2 가중치 Apache-2.0). 앱 화면에서는 쓰지 않으며, 서버가 SAM 계열 모델 이름을 돌려주면 결과를 거부합니다.
- OpenTally `examples/`의 장면 이미지(CC BY 4.0)는 포함하지 않았습니다.

이름 주의: 이 앱 이름 "셈(SAM, Stock Audit Mate)"은 Meta의 Segment Anything Model(SAM)과 관계가 없습니다.
