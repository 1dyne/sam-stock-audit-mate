// 셈(sam) v1 하우징 — 실측 기반 가안 (2026-11-24)
// 좌표: x=가로, y=앞(+)/뒤(-), z=위. 책상 = z0. 단위 mm.
// part = "body" | "brow" | "pan" | "cap" | "assembly"
part = "assembly";
$fn = 48;

// ---------- 치수 ----------
W = 88; D = 58; R = 6;          // 외곽 (선 보관 공간 29→15mm로 줄임)
WALL = 1.2; FLOOR = 2;          // 벽 1.2mm = 0.4노즐 3줄 (출력 시간 단축)
WALL_TOP = 21;                  // 몸통 벽 윗면
BROW_D = 28; BROW_T = 3;        // 앞쪽 띠 (y: D/2-BROW_D .. D/2)
GAP_PAN = 2; PAN_T = 2.4;       // 저울판: 벽 위 2mm 띄움
PAN_Y1 = D/2 - BROW_D - 1.5;    // 저울판 앞 가장자리 (띠와 1.5mm 틈)
TOL = 0.3;

// AtomS3 + HX711 덩어리 (실측: 테이프 포함, 책상 기준 → +FLOOR)
ATOM = 24; ATOM_H = 9.5;
ATOM_X = 0; ATOM_Y = D/2 - WALL - 0.5 - ATOM/2;   // 앞벽과 0.5mm
ATOM_Z0 = FLOOR + 6.8;          // AtomS3 밑면
ATOM_TOP = FLOOR + 16.4;        // AtomS3 윗면
USB_BOT = FLOOR + 13.1;         // USB-C 밑면
USB_C = USB_BOT + 1.6;          // USB-C 중심 (리셉터클 높이 3.2 가정)
HX_L = 33.7; HX_W = 21;         // HX711 (폭 미측정, 가정)
HX_X0 = ATOM_X + ATOM/2 - 8.2;  // AtomS3가 헤더에 8.2mm 걸침
BTN_W = 12.5; BTN_D = 11;       // 버튼 판 (AtomS3 윗면 중앙 가정)

// 로드셀 (도면: 80, 구멍 끝에서 5·20mm, M5=선 쪽=오른쪽=바닥 고정, M4=저울판)
LC_L = 80.6; LC_S = 12.7;
LC_Y = -D/2 + WALL + 1.5 + LC_S/2;
LC_Z0 = FLOOR + 4;              // 고정 받침 4mm
SPACER_L = 24;                  // 받침은 끝에서 24mm까지만 (휘는 부분 안 닿게)
PAN_Z0 = WALL_TOP + GAP_PAN;    // 저울판 밑면 23
FREE_SP_H = PAN_Z0 - (LC_Z0 + LC_S);   // 저울판 받침 높이 4.3
HOLE_X = [LC_L/2 - 5, LC_L/2 - 20];

// 띠 고정 핀 (앞 가장자리 기준)
// 실물: USB-C를 앞으로 볼 때 HX711은 AtomS3 오른쪽(-x)으로 뻗음 → 보스는 +x 쪽
PINS_L = [[36, D/2 - 6], [36, D/2 - 24]];
PIN_R = [-(W/2 - WALL - 2), D/2 - 26];
// 선 보관 공간 (AtomS3 뒤 ~ 로드셀 앞)
BAY_Y = ((ATOM_Y - ATOM/2) + (LC_Y + LC_S/2)) / 2;
RIB_Y = ((LC_Y + LC_S/2) + PAN_Y1) / 2;   // 로드셀 위는 피함

// 얼굴 캡
CAP_W = 14; CAP_D = 13; CAP_TOP = WALL_TOP + BROW_T + 1.5;   // 띠 위 1.5mm
FLANGE_T = 0.8; NUB_H = 1.0;
EYE_DX = 3; EYE_D = 3.15;

module rrect(w, d, r) { offset(r) square([w - 2*r, d - 2*r], center = true); }

// ---------- 몸통 ----------
module body() {
  difference() {
    union() {
      // 바닥 + 벽
      linear_extrude(FLOOR) rrect(W, D, R);
      linear_extrude(WALL_TOP) difference() { rrect(W, D, R); rrect(W - 2*WALL, D - 2*WALL, R - WALL); }
      // 로드셀 고정 받침 (M5, 오른쪽)
      translate([LC_L/2 - SPACER_L, LC_Y - 7, 0]) cube([SPACER_L, 14, LC_Z0]);
      // AtomS3 받침대 (HX711 밖으로 튀어나온 15.8mm 밑)
      // AtomS3 뒤쪽 멈춤턱 (USB 꽂을 때 미는 힘) — 왼쪽 옆면 RESET 자리는 비움
      // 선 보관 기둥
      for (x = [-8, 24]) translate([x, BAY_Y, 0]) cylinder(d = 3.5, h = FLOOR + 7);
      // 띠 고정 보스 (왼쪽 2, 오른쪽 벽쪽 1)
      for (p = PINS_L) translate([p[0], p[1], 0]) cylinder(d = 6, h = WALL_TOP);
      translate([-W/2 + WALL, PIN_R[1] - 3, 0]) cube([4, 6, WALL_TOP]);
    }
    // USB-C 홈 (위가 열린 U자, 띠가 덮음)
    // 보조배터리 플러그 몸통(약 12.5x6.5)이 지나가도록 13.6x7.5 이상
    translate([ATOM_X - 6.8, D/2 - WALL - 1, USB_C - 3.75]) cube([13.6, WALL + 2, 20]);
    // M5 접시머리 구멍 (밑에서)
    for (x = HOLE_X) translate([x, LC_Y, -0.01]) {
      cylinder(d = 5.5, h = 20);
      cylinder(d1 = 10.4, d2 = 5.5, h = 2.5);
    }
    // 띠 핀 구멍
    for (p = concat(PINS_L, [PIN_R])) translate([p[0], p[1], WALL_TOP - 5]) cylinder(d = 2.7, h = 6);
  }
}

// ---------- 앞쪽 띠 ----------
module brow() {
  yc = D/2 - BROW_D/2;
  translate([0, 0, WALL_TOP]) {
    difference() {
      intersection() {
        linear_extrude(BROW_T) rrect(W, D, R);
        translate([-W/2, D/2 - BROW_D, 0]) cube([W, BROW_D, BROW_T]);
      }
      // 얼굴 캡 구멍
      translate([ATOM_X, ATOM_Y, -1]) linear_extrude(BROW_T + 2) rrect(CAP_W + 2*TOL, CAP_D + 2*TOL, 2 + TOL);   // 14.6x13.6 창 (시험 출력에서 확정, USB 단자 가림)
    }
    // 뒤쪽 가장자리 보강 립
    // (왼쪽 보스·오른쪽 블록 피함)
    translate([-36, D/2 - BROW_D, -2]) cube([68, 1.6, 2]);
    // 고정 핀
    for (p = concat(PINS_L, [PIN_R])) translate([p[0], p[1], -4]) cylinder(d = 2.4, h = 4);
  }
}

// ---------- 저울판 ----------
module pan() {
  difference() {
    union() {
      translate([0, 0, PAN_Z0]) intersection() {
        linear_extrude(PAN_T) rrect(W, D, R);
        translate([-W/2, -D/2, 0]) cube([W, PAN_Y1 + D/2, PAN_T]);
      }
      // 저울판 받침 (M4, 왼쪽 끝)
      translate([-LC_L/2, LC_Y - 7, LC_Z0 + LC_S]) cube([SPACER_L, 14, FREE_SP_H + 0.01]);
      // 휨 방지 리브 (로드셀 위는 피함)
      for (y = [RIB_Y]) translate([-W/2 + WALL + 1.5, y - 1, PAN_Z0 - 2.5]) cube([W - 2*WALL - 3, 2, 2.51]);
    }
    // M4 접시머리 구멍 (위에서)
    for (x = HOLE_X) translate([-x, LC_Y, 0]) {
      cylinder(d = 4.5, h = 40);
      translate([0, 0, PAN_Z0 + PAN_T - 2.2 + 0.01]) cylinder(d1 = 4.5, d2 = 8.6, h = 2.2);
    }
  }
}

// ---------- 얼굴 캡 ----------
module cap() {
  difference() {
    union() {
      // 걸림턱
      translate([ATOM_X, ATOM_Y, ATOM_TOP + NUB_H]) linear_extrude(FLANGE_T) rrect(CAP_W + 4, CAP_D + 4, 3);
      // 캡 몸체
      translate([ATOM_X, ATOM_Y, ATOM_TOP + NUB_H + FLANGE_T]) linear_extrude(CAP_TOP - (ATOM_TOP + NUB_H + FLANGE_T)) rrect(CAP_W, CAP_D, 2);
      // 돌기: 버튼 판 안쪽, 경첩 반대쪽(뒤)
      translate([ATOM_X - 4, ATOM_Y - BTN_D/2 + 0.5, ATOM_TOP]) cube([8, 2.5, NUB_H + 0.01]);
    }
    // 광섬유 구멍
    for (s = [-1, 1]) translate([ATOM_X + s*EYE_DX, ATOM_Y, 0]) cylinder(d = EYE_D, h = 40);
  }
}

// ---------- 참고용 부품 ----------
module refs() {
  color("silver") translate([-LC_L/2, LC_Y - LC_S/2, LC_Z0]) cube([LC_L, LC_S, LC_S]);
  color("white") translate([ATOM_X - ATOM/2, ATOM_Y - ATOM/2, ATOM_Z0]) cube([ATOM, ATOM, ATOM_H]);
  color("green") mirror([1,0,0]) translate([HX_X0, ATOM_Y - HX_W/2, FLOOR + 1]) cube([HX_L, HX_W, 1.6]);
  color("cyan") for (s = [-1, 1]) translate([ATOM_X + s*EYE_DX, ATOM_Y, ATOM_TOP + 0.6]) cylinder(d = 3, h = CAP_TOP - ATOM_TOP - 0.6);
}

// 따로 출력해 본드로 붙이는 AtomS3 받침 (ㄴ자: 뒤 턱이 USB 꽂는 힘을 받음)
module pedestal() { cube([15.5, 24, ATOM_Z0 - FLOOR]); translate([0, -2, 0]) cube([15.5, 2, ATOM_Z0 - FLOOR + 6]); }

// USB-C 홈 가림 마개: 보조배터리를 쓸 때만 빼고, 평소엔 끼워 둠
module usbcap() {
  zb = USB_C - 3.75 + 0.15;  zt = WALL_TOP - 0.15;
  translate([-6.65, D/2 - WALL, zb]) cube([13.3, WALL, zt - zb]);            // 홈에 끼는 부분
  difference() {
    translate([-8.5, D/2, zb - 1.2]) cube([17, 0.8, zt - zb + 1.2]);          // 바깥 테두리
  }
  translate([-2.5, D/2 + 0.8, zb - 1.2]) cube([5, 1.2, 1.6]);                 // 손톱 걸이
}

if (part == "usbcap") usbcap();
else if (part == "pedestal") pedestal();
else if (part == "body") body();
else if (part == "brow") brow();
else if (part == "pan") pan();
else if (part == "cap") cap();
else { color("#E4E1D9") body(); color("#DDD8CE") brow(); color("#D2CCBF") pan(); color("#F5F2EC") cap(); refs(); }
