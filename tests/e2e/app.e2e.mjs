// 셈 끝-끝 테스트: 연습용 저울로 처음 시작 → 무게·박스·직접·사진 세기 → 결과 → 엑셀 보내기 → 담기 → 백업
// 그리고 아이폰 키보드 모드 입력. 실행: node tests/e2e/app.e2e.mjs  (Playwright 필요)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = resolve('web');
const OUT = resolve(process.env.E2E_OUT || 'dist/e2e');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const body = await readFile(join(ROOT, p.endsWith('/') ? p + 'index.html' : p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || (p.endsWith('/') ? 'text/html' : 'application/octet-stream') });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const steps = [];
const ok = (s) => { steps.push(s); console.log('✓', s); };

async function page(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...ctxOpts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
}
const click = (p, text) => p.getByRole('button', { name: text, exact: true }).first().click();
const shot = (p, name) => p.screenshot({ path: join(OUT, name + '.png') });

try {
  const p = await page();
  await p.goto(BASE);
  await p.getByText('안녕하세요, 셈이에요').waitFor();
  await shot(p, '01-start');
  await click(p, '시작하기');
  await p.getByText('무엇을 세나요?').waitFor();
  await click(p, '다음');
  await p.getByText('이렇게 세면 정확해요').waitFor();
  await p.getByText('작은 부품은 사만다가 필요해요').waitFor();
  await shot(p, '02-advice');
  await click(p, '다음');
  await p.getByText('자주 쓸 기능만 켜 주세요').waitFor();
  await click(p, '다음');
  await p.locator('#pname').fill('작업실 부품장');
  await click(p, '다음');
  await p.getByText(/사만다예요|키보드로 연결해요/).waitFor();
  await shot(p, '03-connect');
  await click(p, '연습용 저울로 해 보기');
  await p.getByText('사만다와 연결됐어요').waitFor();
  await click(p, '다 됐어요');
  await p.getByText('품목을 넣어 주세요').waitFor();
  ok('처음 시작 5단계 → 연습용 저울 연결 → 홈');

  // 무게로 세기
  await p.goto(BASE + '#/item/new');
  await p.locator('input[name=name]').fill('M3 볼트 8mm');
  await click(p, '무게');
  await p.locator('input[name=min_qty]').fill('500');
  await click(p, '넣고 세기');
  await p.getByText('통에 담아 재나요?').waitFor();
  await click(p, '빈 통');
  await p.waitForTimeout(1300);
  await p.getByText('멈췄어요').waitFor();
  await shot(p, '04-tare');
  await click(p, '이 통 빼기');
  await p.locator('.sheet input[name=name]').fill('부품 트레이');
  await click(p, '저장');
  await p.getByText('10개만 올려 주세요').waitFor();
  await click(p, '10개');
  await p.waitForTimeout(1300);
  await shot(p, '05-sample');
  await click(p, '멈추면 재기');
  await p.getByText('전부 올려 주세요').waitFor();
  await click(p, '전부');
  await p.waitForTimeout(1300);
  const cnt1 = Number((await p.locator('#cnt').textContent()).replace(/,/g, ''));
  const err = await p.locator('#err').textContent();
  const pm = Number(err.replace(/[^0-9]/g, ''));
  assert.ok(Math.abs(cnt1 - 1284) <= pm, `${cnt1} ± ${pm} should cover 1284`);
  await shot(p, '06-all');
  await p.locator('footer .b.p').click();
  await p.getByText(`M3 볼트 8mm ${cnt1.toLocaleString('ko-KR')}개`).waitFor();
  await shot(p, '07-saved');
  ok(`무게로 세기: 통 48.2g + 샘플 10개(저울 0.1g 단위) → ${cnt1}개 ${err.trim()} (정답 1,284 포함) 저장`);

  // 저장한 통을 다시 알아보는지 + 저장된 개당 무게 쓰기
  await p.goto(BASE + '#/count');
  await p.getByText('M3 볼트 8mm').click();
  await click(p, '빈 통');
  await p.waitForTimeout(1300);
  assert.equal(await p.locator('.list .chip.ok').count(), 1);
  await click(p, '이 통 빼기');
  await p.getByText('저장된 개당 무게가 있어요').waitFor();
  await click(p, '저번 값 쓰기');
  await click(p, '전부');
  await p.waitForTimeout(1300);
  assert.ok(Math.abs(Number((await p.locator('#cnt').textContent()).replace(/,/g, '')) - cnt1) <= pm);
  await p.goto(BASE + '#/');
  ok('저장한 통 알아보기 + 저장된 개당 무게 다시 쓰기');

  // 직접 세기
  await p.goto(BASE + '#/item/new');
  await p.locator('input[name=name]').fill('납땜 인두');
  await click(p, '직접');
  await click(p, '넣고 세기');
  await p.getByText('몇 개인가요?').waitFor();
  await p.locator('.pad button', { hasText: '6' }).click();
  await click(p, '6개 저장');
  await p.getByText('납땜 인두 6개').waitFor();
  ok('직접 세기 6개');

  // 박스로 세기
  await p.goto(BASE + '#/item/new');
  await p.locator('input[name=name]').fill('A4 복사지');
  await click(p, '박스');
  await p.locator('input[name=pack_qty]').fill('5');
  await p.locator('input[name=unit]').fill('권');
  await click(p, '넣고 세기');
  await p.getByText('박스가 몇 개인가요?').waitFor();
  for (let i = 0; i < 4; i++) await p.getByRole('button', { name: '앞줄 늘리기' }).click();
  await p.getByRole('button', { name: '안쪽 줄 늘리기' }).click();
  for (let i = 0; i < 2; i++) await p.getByRole('button', { name: '층 늘리기' }).click();
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: '뜯은 박스 낱개 늘리기' }).click();
  await shot(p, '08-box');
  await click(p, '123권 저장');
  await p.getByText('A4 복사지 123권').waitFor();
  ok('박스로 세기 4×2×3×5+3 = 123권');

  // 사진으로 세기 (기기 안 OpenTally)
  await p.goto(BASE + '#/item/new');
  await p.locator('input[name=name]').fill('PVC 파이프');
  await click(p, '사진');
  await click(p, '넣고 세기');
  await p.getByText('위에서 찍어 주세요').waitFor();
  await p.locator('#cam').setInputFiles('tests/fixtures/pipes37.jpg');
  await p.getByText('물건 하나를 둘러 주세요').waitFor();
  const cv = await p.locator('#cv').boundingBox();
  const geo = await p.evaluate(() => { const f = window.__sem.S.flow.p; return { w: f.w, h: f.h }; });
  // 사진 속 파이프 하나 크기(가로의 약 9%)로 가운데 근처에 네모
  const k = cv.width / geo.w;
  const sz = geo.w * 0.09 * k;
  await p.mouse.move(cv.x + cv.width * 0.45, cv.y + cv.height * 0.45);
  await p.mouse.down();
  await p.mouse.move(cv.x + cv.width * 0.45 + sz, cv.y + cv.height * 0.45 + sz, { steps: 5 });
  await p.mouse.up();
  await p.getByText(/개 찾았어요|쌓인 곳이 있어요/).waitFor({ timeout: 20000 });
  await shot(p, '09-photo');
  const found = await p.evaluate(() => window.__sem.S.flow.p.ai);
  assert.ok(found >= 1, 'photo count');
  await p.locator('footer .b.p').click();
  await p.getByText(/PVC 파이프 \d+개/).waitFor();
  ok(`사진으로 세기: 셈이 ${found}개 찾음(정답 37) → 저장, 품목별 설정 기억`);

  // 결과 · 보내기
  await p.goto(BASE + '#/results');
  await p.getByText('M3 볼트 8mm').waitFor();
  await shot(p, '10-results');
  await p.goto(BASE + '#/export');
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, '보내기')]);
  const xlsxPath = join(OUT, 'export.xlsx');
  await dl.saveAs(xlsxPath);
  const { parseXLSX } = await import('../../web/js/tabular.js');
  const rows = await parseXLSX((await readFile(xlsxPath)).buffer);
  assert.equal(rows[0][3], '품목');
  const bolt = rows.find((r) => r[3] === 'M3 볼트 8mm');
  assert.equal(Number(bolt[4]), cnt1);
  ok(`엑셀 보내기: ${rows.length - 1}줄, 머리글 ${rows[0].length}열, M3 볼트 ${cnt1}`);

  // 고치기 이력
  await p.goto(BASE + '#/results');
  await p.locator('.row', { hasText: 'M3 볼트 8mm' }).click();
  await click(p, '고치기');
  await p.locator('.sheet input[name=qty]').fill('1280');
  await p.locator('.sheet input[name=reason]').fill('4개 불량 빼냄');
  await p.locator('.sheet .b.p').click();
  await p.getByText('"4개 불량 빼냄"').waitFor();
  await shot(p, '11-record');
  ok('수량 고치기 + 이유 이력');

  // 담기
  await p.goto(BASE + '#/settings');
  await p.locator('[data-act=feat][data-arg=fill]').click();
  await p.goto(BASE + '#/fill');
  await p.getByText('M3 볼트 8mm').click();
  await p.getByText('몇 개씩 몇 봉투 담나요?').waitFor();
  await click(p, '빈 봉투');
  await p.waitForTimeout(1300);
  await click(p, '빈 봉투 올리고 시작');
  await click(p, '37개');
  await p.waitForTimeout(1300);
  assert.equal(await p.locator('#bt').textContent(), '13개 더');
  await shot(p, '12-fill-more');
  await click(p, '52개');
  await p.waitForTimeout(1300);
  assert.equal(await p.locator('#bt').textContent(), '2개 빼세요');
  await click(p, '50개');
  await p.waitForTimeout(1300);
  assert.equal(await p.locator('#bt').textContent(), '50개');
  await shot(p, '13-fill-ok');
  await click(p, '내리기');
  await p.waitForTimeout(400);
  await p.getByText('2 / 20').waitFor();
  await click(p, '여기서 끝내기');
  await p.getByText(/50개 × 1봉투/).waitFor();
  ok('담기: 13개 더 → 2개 빼세요 → 50개 맞음 → 봉투 내리면 다음(2/20) → 끝내기 기록');

  // 백업 · 다시 열기
  await p.goto(BASE + '#/settings');
  const [bk] = await Promise.all([p.waitForEvent('download'), click(p, '지금 백업하기')]);
  const bkPath = join(OUT, 'backup.json');
  await bk.saveAs(bkPath);
  const backup = JSON.parse(await readFile(bkPath, 'utf8'));
  assert.equal(backup.tables.records.filter((r) => !r.deleted).length, 4);
  await p.reload();
  await p.goto(BASE + '#/');
  await p.getByText('최근 센 것').waitFor();
  await shot(p, '14-home');
  ok(`백업 파일(기록 ${backup.tables.records.length}건) + 다시 열어도 기록 유지`);

  // 아이폰: 키보드 모드
  const ip = await page({ ...devices['iPhone 13'] });
  await ip.goto(BASE);
  await ip.evaluate(async () => {
    // 처음 시작을 건너뛰고 품목 하나를 만든다
    const { saveSettings, saveRow, setPlace } = await import('./js/core.js');
    const cat = await saveRow('catalogs', { name: '테스트', shared: true });
    const pl = await saveRow('places', { name: '테스트', catalog_id: cat.id });
    await setPlace(pl.id);
    await saveRow('items', { name: '100원 동전', method: 'weight', catalog_id: cat.id });
    await saveSettings({ kinds: ['small'], features: { compare_last: true, min_qty: false, ledger: false, daily_batch: true, fill: false }, onboarded: true });
  });
  await ip.goto(BASE + '#/connect');
  await ip.getByText('아이폰은 키보드로 연결해요').waitFor();
  await shot(ip, '15-ios-connect');
  await click(ip, '키보드로 연결했어요');
  await ip.getByText('키보드로 연결돼 있어요').waitFor();
  await ip.goto(BASE + '#/count');
  await ip.getByText('100원 동전').click();
  await click(ip, '통 없이');
  await ip.keyboard.type('54.2');
  await ip.keyboard.press('Enter');
  await ip.getByText('받음').waitFor();
  await click(ip, '멈추면 재기');
  await ip.keyboard.type('271.0');
  await ip.keyboard.press('Enter');
  await ip.waitForTimeout(200);
  assert.equal(await ip.locator('#cnt').textContent(), '50');
  await shot(ip, '16-ios-count');
  ok('아이폰 키보드 모드: "54.2⏎"(동전 10개) → "271.0⏎" → 50개');

  assert.deepEqual(errors, []);
  ok('브라우저 오류 없음');
} catch (e) {
  console.error('✗', e.message);
  console.error('오류 기록:', errors);
  process.exitCode = 1;
} finally {
  await writeFile(join(OUT, 'result.json'), JSON.stringify({ steps, errors, at: new Date().toISOString() }, null, 2));
  await browser.close();
  server.close();
}
