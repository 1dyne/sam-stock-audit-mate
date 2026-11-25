include <lib.scad>
// ---- 참고 부품 (실측) ----
module atom()  translate([ATOM_X-ATOM/2, ATOM_Y-ATOM/2, ATOM_Z0]) cube([ATOM, ATOM, ATOM_H]);
module hx()    mirror([1,0,0]) translate([HX_X0, ATOM_Y-HX_W/2, FLOOR]) cube([HX_L, HX_W, 1 + 1.6]);   // 테이프 1 + 보드
module header() mirror([1,0,0]) translate([HX_X0, ATOM_Y-HX_W/2+2, FLOOR+2.6]) cube([ATOM_X+ATOM/2-HX_X0, HX_W-4, ATOM_Z0-FLOOR-2.6]);
module lc()    translate([-LC_L/2, LC_Y-LC_S/2, LC_Z0]) cube([LC_L, LC_S, LC_S]);
module m5()    for (x = HOLE_X) translate([x, LC_Y, 0]) { cylinder(d1=10, d2=5, h=2.5); cylinder(d=5, h=16); }
module m4()    for (x = HOLE_X) translate([-x, LC_Y, PAN_Z0+PAN_T]) mirror([0,0,1]) { cylinder(d1=8, d2=4, h=2.2); cylinder(d=4, h=20); }
module plug()  translate([ATOM_X-6.25, ATOM_Y+ATOM/2, USB_C-3.25]) cube([12.5, 25, 6.5]);   // 보조배터리 플러그 몸통 12.5x6.5
module fibers(dz=0) for (s=[-1,1]) translate([ATOM_X+s*EYE_DX, ATOM_Y, ATOM_TOP+0.6+dz]) cylinder(d=3, h=CAP_TOP-ATOM_TOP-0.6);
module shrink(){ minkowski(){ children(); cube(0.001,center=true);} }
module ins(d=0.05) offset3(d) children();
module x(a,b) intersection(){ a(); b(); }
check = "";
// 각 검사: 두 물체의 겹침 (0.05mm 이상 겹치면 오류)
module grow(){ children(); }
if (check=="body_atom")   intersection(){ body(); translate([0,0,0.05]) atom(); }
if (check=="body_hx")     intersection(){ body(); translate([0,0,0.05]) hx(); }
if (check=="body_header") intersection(){ body(); header(); }
if (check=="body_lc")     intersection(){ body(); translate([0,0,0.05]) lc(); }
if (check=="body_plug")   intersection(){ body(); plug(); }
if (check=="body_m4")     intersection(){ body(); m4(); }
if (check=="pan_m5")      intersection(){ pan(); m5(); }
if (check=="pan_body")    intersection(){ translate([0,0,-0.5]) pan(); body(); }      // 저울판 0.5mm 처져도
if (check=="pan_brow")    intersection(){ translate([0,0,-0.5]) pan(); brow(); }
if (check=="pan_lc")      intersection(){ pan(); translate([LC_L/2*0+0,0,0]) difference(){ translate([0,0,-0.05]) lc(); translate([-LC_L/2-1,-50,0]) cube([SPACER_L+1,100,100]); } }
if (check=="pan_atom")    intersection(){ translate([0,0,-0.5]) pan(); atom(); }
if (check=="pan_hx")      intersection(){ translate([0,0,-0.5]) pan(); hx(); }
if (check=="brow_body")   intersection(){ translate([0,0,0.05]) brow(); body(); }
if (check=="brow_atom")   intersection(){ brow(); atom(); }
if (check=="brow_cap")    intersection(){ brow(); cap(); }
if (check=="browcap_pressed") intersection(){ brow(); translate([0,0,-1]) cap(); }
if (check=="brow_plug")   intersection(){ brow(); plug(); }
if (check=="cap_atom")    intersection(){ translate([0,0,0.05]) cap(); atom(); }
if (check=="cap_body")    intersection(){ translate([0,0,-1]) cap(); body(); }
if (check=="fiber_atom")  intersection(){ fibers(); atom(); }
if (check=="lc_m4tip_floor") intersection(){ m4(); translate([-50,-50,0]) cube([100,100,FLOOR+0.5]); }
if (check=="m5_lc_top")   intersection(){ m5(); translate([-50,-50,LC_Z0+LC_S-0.5]) cube([100,100,10]); }
