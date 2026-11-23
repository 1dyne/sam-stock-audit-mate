# 웹 세션 핸드오프 (2026-11-23, 앱 0.3.0)

다음 웹 세션이 이어받을 때 읽는 문서. 펌웨어 쪽 기준은 `SAM_SPEC.md`·`docs/protocol.md`(펌웨어 세션 담당, 웹은 §9 기록과 §12만 씀).

## 지금 상태

- 앱 0.3.0: `web/`(빌드 없는 PWA). 디자인 기준은 "셈 웹 디자인" 페이지(claude.ai 아티팩트)의 화면 27장과 같음. 바탕은 흰색(#fff), 돌 색 + 상태색만.
- 범위(다인 확정, 11-23): 정해진 기능 중에서 골라 쓰기만. 설정 붙여넣기·규칙 편집·Claude Code 안내는 **만들지 않음**(밋업에서 "오픈소스 받아서 고쳐 쓰기"로 말로 안내). 담기는 설정에서 켜는 선택 기능. 아이폰은 키보드 모드.
- 서버 0.3.0(선택): `server/src/index.js`, 펌웨어 계약 v1 수신 + 동기화.
- 테스트: `npm test` 15개, `npm run e2e` 13단계, `npm run e2e:server` 8단계 모두 통과(11-23).

## 배포

- 앱: `.github/workflows/pages.yml`이 기본 브랜치에 push될 때 `web/`을 GitHub Pages로 올림. **저장소 Settings › Pages › Source = GitHub Actions**를 사람이 한 번 켜야 함(세션에서는 Pages API가 막혀 있음). 주소: https://1dyne.github.io/sam-stock-audit-mate/
- 서버: README의 Deploy to Cloudflare 버튼(사용자 각자). 세션에서는 Cloudflare 자격 증명이 없어 실제 배포는 안 해 봄.

## 화면 → 파일

| 화면 | 파일 |
|---|---|
| 처음 시작 5단계 | `web/js/views/onboard.js` |
| 홈 · 품목 고르기 | `views/home.js` |
| 무게로 세기 | `views/weigh.js` |
| 사진 · 박스 · 직접 · 저장했어요 | `views/count.js` |
| 담기 | `views/fill.js` |
| 결과 · 기록 자세히 · 보내기 | `views/results.js` |
| 품목 · 불러오기 | `views/items.js` |
| 설정 · 사만다 연결 · 세는 곳 | `views/settings.js` |

공통: `core.js`(상태·화면 부품), `model.js`(규칙·계산, 순수 함수), `db.js`(IndexedDB·백업·동기화), `scale.js`/`scalectl.js`(사만다), `tabular.js`(CSV·XLSX 읽기/쓰기).

## 확인 못 한 것 (실기 필요)

- [ ] 안드로이드 크롬 ↔ 실제 사만다(fw 0.2.0) 블루투스 연결, 5Hz 무게 표시, 끊김 후 자동 재연결
- [ ] 아이폰 키보드 페어링 후 셈 화면에서 버튼 입력이 들어오는지(포커스 없이 document keydown으로 받음. 사파리에서 안 되면 숨은 입력칸 방식으로 바꿔야 함)
- [ ] 오차 계산의 저울 오차 0.1g 가정이 실제 노이즈에 맞는지(`model.js` `SCALE_D`)
- [ ] 사진 품목별 학습: 같은 품목을 다른 거리에서 찍으면 기억한 크기가 안 맞을 수 있음 → "샘플 다시" 버튼으로 다시 고르게 해 둠
- [ ] 실제 Cloudflare 배포(D1·Durable Object 자동 생성), GitHub Pages의 앱 → workers.dev 서버 CORS·WebSocket
- [ ] 아이폰 홈 화면 앱에서 공유 창으로 xlsx 넘기기(Web Share files)
- [ ] 화면 속 사만다 눈 색과 실제 LED 색의 짝(펌웨어 §3.4·protocol.md 기준으로 맞춰 둠, 다인 확인 필요)

## 다음에 할 일

1. 위 실기 확인. 문제가 있으면 `scale.js`만 고치면 됨(화면은 `scalectl.js`의 이벤트만 봄)
2. 사만다 STL/치수가 오면 `web/chars/sam-*.webp` 다시 렌더(스크래치 `chars/render.html` 셰이더, 사만다 = 윗면 둥근 정사각형 + AtomS3 자리 LED 눈 두 개)
3. 첫 화면·"셈 → 사만다" 순간의 실시간 3D는 넣지 않았음(지금은 CSS로 내려앉는 연출). 넣으려면 첫 화면에만, 움직임 줄이기·저사양이면 이미지 유지
