'use strict';
// (@regress 없음 — 러너 밖 · 하네스 공용 자 · 제품 무변)
// === scripts/lib-bait.js — 미끼 사본을 지으며 바꾼 자리를 센다 (T1383 · 규약 ① "미끼는 바꾼 자리가 정확히 1곳인지 세고") ======================
//
// ★왜: 옛 하네스 여럿이 `src.replace(A, B)` 로 미끼 사본을 짓고 "사본이 원본과 다르다"만 봤다 — 앵커 A 가 두 번 있으면 첫 자리만 바뀌어
//   엉뚱한 줄을 재고, 0 번이면 사본이 원본 그대로라 미끼가 아예 안 선다(그걸 `bait !== src` 로만 거른다). 자리를 센 수를 미끼 판정 줄에 싣는다.
// 쓰는 법:
//   const LB = require('./lib-bait');
//   const B = LB.swap(SRC, 'if (x) y();', '');            // { src: 사본, n: 앵커가 원본에 있던 수 }
//   ok(B.n === 1 && <미끼가 빨강이 되는 조건>, '… 미끼 …', `바꾼 자리 ${B.n} · …`);
//   앵커가 정규식이면 `g` 없이 줘도 센다(바꾸는 것은 `String.replace` 그대로 — `g` 가 없으면 첫 자리만).
//   여러 자리를 차례로 바꾸는 사본은 `chain(src, [[a, b], [c, d]])` — 바꾼 자리마다 센 수(`ns`)와 합(`n`) · 모두 1 이면 `one: true`.
function count(src, from) {
  if (typeof from === 'string') return from ? src.split(from).length - 1 : 0;
  const re = new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g');
  return (src.match(re) || []).length;
}
function swap(src, from, to) { return { src: src.replace(from, to), n: count(src, from) }; }
function chain(src, pairs) {
  const ns = []; let s = src;
  for (const [a, b] of pairs) { ns.push(count(s, a)); s = s.replace(a, b); }
  return { src: s, ns, n: ns.reduce((x, y) => x + y, 0), one: ns.every((k) => k === 1) };
}
module.exports = { count, swap, chain };
//   하네스 제 글자(주석 뺌) — 판 갈래 미끼(사본 대신 하네스 판 안 한 갈래를 끄는 미끼 · `{ noTouch: true }` 꼴)의 "바꾼 자리" = 그 갈래를 보는 글자 수
const _co = require('./code-only.js');
function self(file) { return _co(require('fs').readFileSync(file, 'utf8')); }
module.exports.self = self;
//   바꾼 자리(덩이) 수 — 원본과 사본의 줄 차이 덩이를 센다(Myers 줄 diff · 다른 줄이 많으면 `cap` 에서 끊고 cap+ 로). 앵커 없이 함수로 짓는 사본도 센다.
//   한 자리 = 붙은 줄들의 바뀜 하나(한 줄 지움 · 한 줄 고침 · 두 줄 넣음 모두 1). 사본이 원본과 같으면 0.
function spots(a, b, cap) {
  cap = cap || 400;
  if (a === b) return 0;
  const A = a.split('\n'), B = b.split('\n');
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const X = A.slice(s, ea), Y = B.slice(s, eb), N = X.length, M = Y.length, MAX = N + M, off = MAX + 1;
  const V = new Int32Array(2 * MAX + 3), trace = [];
  let found = -1;
  for (let d = 0; d <= Math.min(MAX, cap); d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && X[x] === Y[y]) { x++; y++; }
      V[off + k] = x;
      if (x >= N && y >= M) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) return cap + 1;
  //   되짚어 바뀐 줄 표시 → 덩이 셈
  const changedA = new Uint8Array(N + 1), changedB = new Uint8Array(M + 1);
  let x = N, y = M;
  for (let d = found; d > 0; d--) {
    const Vd = trace[d], k = x - y;
    const down = (k === -d || (k !== d && Vd[off + k - 1] < Vd[off + k + 1]));
    const pk = down ? k + 1 : k - 1, px = Vd[off + pk], py = px - pk;
    while (x > px + (down ? 0 : 1) && y > py + (down ? 1 : 0)) { x--; y--; }
    if (down) changedB[py] = 1; else changedA[px] = 1;
    x = px; y = py;
  }
  //   덩이 = 두 쪽을 함께 걸으며 바뀐 줄이 이어진 묶음
  let i = 0, j = 0, n = 0, inHunk = false;
  while (i < N || j < M) {
    if (i < N && changedA[i]) { if (!inHunk) { n++; inHunk = true; } i++; continue; }
    if (j < M && changedB[j]) { if (!inHunk) { n++; inHunk = true; } j++; continue; }
    inHunk = false; i++; j++;
  }
  return n;
}
module.exports.spots = spots;
//   끔 대조 미끼(㉰ — T1383 규약 제안): 끈 판이 대조인 미끼의 "바꾼 자리" = 그 손잡이를 읽는 **정본 제품 자리** 수(`process.env.<이름>` 글자 · server · sim ·
//   번들 사본 `*.browser.js` 뺌 · 주석 뺌). 1 이면 "끔 판 = 그 한 줄을 뒤집은 판" — 사본 미끼의 바꾼 자리 1 과 같은 뜻.
function knob(name) {
  const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
  let n = 0;
  for (const d of ['server', 'sim']) for (const f of fs.readdirSync(path.join(R, d))) {
    if (!/\.js$/.test(f) || /browser/.test(f)) continue;
    n += count(_co(fs.readFileSync(path.join(R, d, f), 'utf8')), 'process.env.' + name);
  }
  return n;
}
module.exports.knob = knob;
