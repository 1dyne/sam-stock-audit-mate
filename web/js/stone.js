// 셈·사만다는 돌이다. 돌은 늘어나거나 찌그러지지 않는다.
// 그래서 모양은 그대로 두고 자리(위아래)와 기울기만 움직인다:
//   - 뛸 때: 올라갈수록 느려지고(감속) 떨어질수록 빨라진다(가속). 땅에 닿으면 아주 조금 한 번 더 튀고, 모서리로 흔들리다 멈춘다.
//   - 가만히 있을 때: 가끔 한 번 들썩이거나, 한쪽 모서리를 들었다 '툭' 내려놓는다.
// 크기는 캐릭터 크기에 비례해서(작은 아이콘은 조금, 큰 그림은 많이) 움직인다.
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const UP = 'cubic-bezier(.22,.61,.36,1)'; // 올라감: 점점 느려짐
const DOWN = 'cubic-bezier(.55,.06,.85,.4)'; // 떨어짐: 점점 빨라짐

function run(el, frames, ms, origin = '50% 92%') {
  if (!el || !el.animate || reduce()) return null;
  el._stone?.cancel();
  el.style.transformOrigin = origin;
  const a = el.animate(frames, { duration: ms, fill: 'none' });
  el._stone = a;
  a.onfinish = () => { if (el._stone === a) el._stone = null; };
  return a;
}

/** 제자리에서 한 번 뛰기. h = 캐릭터 크기 대비 높이 */
export function hop(el, h = 0.14) {
  if (!el) return null;
  const s = el.offsetWidth || 52;
  const H = Math.max(3, s * h);
  const r = (Math.random() < 0.5 ? -1 : 1) * Math.min(5, 2 + h * 12); // 공중에서 살짝 기욺
  const ms = Math.round(420 * Math.sqrt(h / 0.14)) + 220;
  return run(el, [
    { transform: 'translateY(0) rotate(0deg)', easing: UP },
    { offset: 0.36, transform: `translateY(${-H}px) rotate(${r}deg)`, easing: DOWN },
    { offset: 0.66, transform: 'translateY(0) rotate(0deg)', easing: UP }, // 툭
    { offset: 0.76, transform: `translateY(${-H * 0.1}px) rotate(${-r * 0.5}deg)`, easing: DOWN }, // 작게 한 번 더
    { offset: 0.85, transform: 'translateY(0) rotate(0deg)', easing: 'ease-out' },
    { offset: 0.93, transform: `rotate(${r * 0.18}deg)`, easing: 'ease-in-out' }, // 모서리로 흔들림
    { transform: 'none' },
  ], ms);
}

/** 위에서 떨어져 내려앉기(셈 → 사만다로 바뀌는 순간) */
export function land(el, from = 0.9) {
  if (!el) return null;
  const s = el.offsetWidth || 52;
  const H = s * from;
  const a = run(el, [
    { transform: `translateY(${-H}px) rotate(-6deg)`, opacity: 0, easing: DOWN },
    { offset: 0.12, opacity: 1 },
    { offset: 0.5, transform: 'translateY(0) rotate(0deg)', easing: UP }, // 쿵
    { offset: 0.62, transform: `translateY(${-s * 0.06}px) rotate(3deg)`, easing: DOWN },
    { offset: 0.74, transform: 'translateY(0) rotate(0deg)', easing: 'ease-out' },
    { offset: 0.86, transform: 'rotate(-1.4deg)', easing: 'ease-in-out' },
    { transform: 'none' },
  ], 760);
  if (a) setTimeout(() => thud(el), 380);
  return a;
}

/** 한쪽 모서리를 들었다 내려놓기 */
export function rock(el) {
  if (!el) return null;
  const left = Math.random() < 0.5;
  const d = left ? 1 : -1; // 왼쪽 모서리를 축으로 들면 시계 방향
  return run(el, [
    { transform: 'rotate(0deg)', easing: UP },
    { offset: 0.34, transform: `rotate(${d * 7}deg)`, easing: DOWN },
    { offset: 0.56, transform: 'rotate(0deg)', easing: UP }, // 툭
    { offset: 0.7, transform: `rotate(${d * 1.6}deg)`, easing: DOWN },
    { offset: 0.82, transform: 'rotate(0deg)' },
    { transform: 'none' },
  ], 620, left ? '12% 90%' : '88% 90%');
}

/** 무거운 게 내려앉을 때 둘레가 아주 살짝 울림(질문 글자 1px) + 휴대폰 짧은 진동 */
function thud(el) {
  const q = el.closest('.say')?.querySelector('.q');
  q?.animate?.([{ transform: 'translateY(0)' }, { transform: 'translateY(1.5px)' }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
  try { navigator.vibrate?.(12); } catch { /* */ }
}

/** 기뻐서 두 번 뛰기(저장했을 때) */
export function cheer(el) {
  if (!el) return;
  const a = hop(el, 0.22);
  if (a) a.onfinish = () => { el._stone = null; setTimeout(() => hop(el, 0.12), 60); };
}

/** 화면이 바뀌었을 때: 질문 옆 캐릭터가 자리에 내려앉음 */
export function enter(root, { drop = false, celebrate = false } = {}) {
  const el = root.querySelector('.say .av');
  if (!el) return;
  if (drop) land(el);
  else if (celebrate) setTimeout(() => cheer(el), 120);
  else hop(el, 0.08);
}

// ---------- 가만히 있을 때 ----------
let timer = 0;
function idleTick() {
  timer = setTimeout(idleTick, 4500 + Math.random() * 6500);
  if (document.hidden) return;
  const all = [...document.querySelectorAll('#app .av')].filter((e) => !e._stone && e.getBoundingClientRect().bottom > 0);
  if (!all.length) return;
  const el = all[Math.floor(Math.random() * all.length)];
  if (Math.random() < 0.6) hop(el, 0.06 + Math.random() * 0.05); else rock(el);
}
export function startIdle() { if (!timer) timer = setTimeout(idleTick, 3000); }

// 캐릭터를 톡 누르면 뛴다(링크 안의 캐릭터는 링크가 먼저)
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('#app .say .av');
  if (el) hop(el, 0.18);
});
