// 셈·사만다 그림 다시 만들기: node tools/chars/render.cjs → tools/chars/out/*.png (투명 배경, 640px)
// 셰이더는 render.html 안에 있다(SDF 레이마칭). 사만다 = 윗면 둥근 정사각형 + AtomS3 자리 LED 눈 두 개.
// webp 변환·자르기는 Pillow로: 알파 > 250 영역 기준 정사각형으로 잘라 256px.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const d = __dirname + '/';
  fs.mkdirSync(d + 'out', { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.goto('file://' + d + 'render.html');
  const base = { WARP: .6, THICK: 1, SPECK: .55, POSY: 0, SQX: 1, SQY: 1, SHAKE: 0, BLINK: 1, SWAY: 0 };
  const sem = { ...base, MORPH: 0, ZOOM: .92 }, sam = { ...base, MORPH: 1, ZOOM: .95 };
  const L = { off: [.16, .16, .16], green: [.35, .85, .55], yellow: [.98, .86, .25], purple: [.7, .45, .98], cyan: [.25, .85, .9], red: [.95, .28, .25] };
  const jobs = [['sem', sem, L.off], ['sem-blink', { ...sem, BLINK: .08 }, L.off], ['sam-blink', { ...sam, BLINK: .08 }, L.off]];
  for (const k in L) jobs.push(['sam-' + k, sam, L[k]]);
  for (const [n, st, led] of jobs) {
    const u = await p.evaluate(([st, led]) => window.render(st, led), [st, led]);
    fs.writeFileSync(d + 'out/' + n + '.png', Buffer.from(u.split(',')[1], 'base64'));
  }
  await b.close();
})();
