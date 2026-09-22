#!/usr/bin/env node
// === scripts/t345-alloc-bench.js — 네 자리의 **할당량과 걸음값** 을 자리별로 잰다 (T345 ④) ======
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 — 존 틱 p50 은 국면·인구·세계 상태가 같이 흔들려 **한 자리의 값**을 못 본다(T345 §3).
//   그래서 네 자리를 **같은 프로세스 안에 나란히 놓고** 옛 꼴/새 꼴을 직접 돌린다.
//   자는 둘이다:
//     ⓐ **스캐빈지 수**(새 세대 GC) — "할당 0" 의 직접 증거. 시간과 달리 노이즈가 거의 없다.
//     ⓑ **op 당 ns** — 같은 루프·같은 입력·번갈아 돌려(A-B-A-B) 워밍 편차를 없앤다.
//
// ★옛 꼴은 제품에 안 남는다(죽은 코드 0). 여기 복원한 꼴은 `test-move-soa` 가 **답이 같음**을 전수로 건 그 꼴이다.
//
// 실행: node --expose-gc scripts/t345-alloc-bench.js [out.json]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t345-alloc.json';

const gc = global.gc || (() => {});
// ★할당량은 **힙 증가**로 잰다. (`PerformanceObserver({entryTypes:['gc']})` 는 이 Node 빌드에서 항목을 안 낸다 —
//   빈 배열을 "스캐빈지 0" 으로 읽으면 거짓 증거가 된다. 그래서 안 쓴다.)
//   규약: `gc()` 직후 **작은 N** 만 돌려 새 세대 안에서 끝낸다(GC 가 안 돌아야 델타가 곧 할당량이다).
//   같은 N 을 두 꼴에 쓰고, 세 판의 중앙값을 쓴다.
const ALLOC_N = 100000;
function allocBytesPerOp(f) {
  const got = [];
  for (let i = 0; i < 3; i++) {
    gc(); const h0 = process.memoryUsage().heapUsed;
    f(ALLOC_N);
    const h1 = process.memoryUsage().heapUsed;
    got.push((h1 - h0) / ALLOC_N);
  }
  got.sort((a, b) => a - b);
  return Math.max(0, got[1]);
}

// 한 자리를 잰다 — 워밍 뒤 A-B-A-B 3쌍, 중앙값을 쓴다
// ⚠판마다 `setImmediate` 로 한 바퀴 양보한다 — GC·타이머가 다음 판으로 새지 않게.

const yieldTick = () => new Promise((r) => setImmediate(r));
async function bench(name, N, oldFn, newFn) {
  const run = async (f) => {
    gc(); await yieldTick(); const t0 = process.hrtime.bigint();
    f(N);
    const t1 = process.hrtime.bigint(); await yieldTick();
    return { ns: Number(t1 - t0) / N };
  };
  oldFn(N >> 4); newFn(N >> 4);           // 워밍(JIT)
  const O = [], Nn = [];
  for (let i = 0; i < 3; i++) { O.push(await run(oldFn)); Nn.push(await run(newFn)); }
  const med = (a, k) => a.map((x) => x[k]).sort((p, q) => p - q)[1];
  const r = { name, N, oldNs: +med(O, 'ns').toFixed(1), newNs: +med(Nn, 'ns').toFixed(1),
    oldB: +allocBytesPerOp(oldFn).toFixed(1), newB: +allocBytesPerOp(newFn).toFixed(1) };
  r.x = r.newNs > 0 ? +(r.oldNs / r.newNs).toFixed(2) : null;
  console.log(`  ${name.padEnd(28)} 옛 ${String(r.oldNs).padStart(7)}ns / ${String(r.oldB).padStart(6)}B   →   ` +
              `새 ${String(r.newNs).padStart(7)}ns / ${String(r.newB).padStart(6)}B   (×${r.x})`);
  return r;
}

const rows = [];
(async () => {
console.log('\n=== T345 자리별 할당·걸음값 (옛 꼴 ↔ 새 꼴 · 같은 프로세스) ===\n');

// ── ⓐ isBlockedByWall 의 셀 판정 ──────────────────────────────────────────
// 30Hz 한 걸음은 64px/s ÷ 30 = 2.13px, 셀은 32px ⇒ 셀을 넘는 걸음은 2.13/32 = 6.7%.
// 그 분포를 그대로 만든다(새 수 0 — MOVE_SPEED 64 · TICK_HZ 30 · BUILDING_SIZE 32 에서 나온다).
{
  const SZ = 32, STEP = 64 / 30;
  const X = new Float64Array(1 << 16), Y = new Float64Array(1 << 16), DX = new Float64Array(1 << 16), DY = new Float64Array(1 << 16);
  let s = 0x9e3779b9; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < X.length; i++) { X[i] = rnd() * 70016; Y[i] = rnd() * 130016; const a = rnd() * Math.PI * 2; DX[i] = Math.cos(a) * STEP; DY[i] = Math.sin(a) * STEP; }
  const M = X.length - 1;
  const cellOfOld = (x, y) => ({ cx: Math.floor(x / SZ), cy: Math.floor(y / SZ) });
  let sink = 0;
  const oldF = (n) => { for (let i = 0; i < n; i++) { const j = i & M;
    const oc = cellOfOld(X[j], Y[j]), nc = cellOfOld(X[j] + DX[j], Y[j] + DY[j]);
    if (oc.cx === nc.cx && oc.cy === nc.cy) sink++; } };
  const newF = (n) => { for (let i = 0; i < n; i++) { const j = i & M;
    const _ocx = Math.floor(X[j] / SZ), _ocy = Math.floor(Y[j] / SZ);
    const _ncx = Math.floor((X[j] + DX[j]) / SZ), _ncy = Math.floor((Y[j] + DY[j]) / SZ);
    if (_ocx === _ncx && _ocy === _ncy) sink++; } };
  rows.push(await bench('ⓐ 셀 판정(조기 반환)', 20e6, oldF, newF));
  if (!sink) throw new Error('sink');
}

// ── ⓑ 타일 메모 호출 — 클로저 ↔ 인수 ─────────────────────────────────────
{
  const { makeTileCache } = require(path.join(ROOT, 'server', 'terrain-tilecache.js'));
  const W = 2200, H = 4100;
  const computeW = (tx, ty) => (((tx * 73856093) ^ (ty * 19349663)) & 31) === 0;   // 답은 무엇이든 좋다 — 재는 것은 **부르는 꼴**
  const cache = makeTileCache(W, H);
  const water = (tx, ty, f) => cache.water(tx, ty, f);
  let s = 0x85ebca6b; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const TX = new Int32Array(1 << 16), TY = new Int32Array(1 << 16);
  for (let i = 0; i < TX.length; i++) { TX[i] = (rnd() * W) | 0; TY[i] = (rnd() * H) | 0; }
  const M = TX.length - 1;
  let sink = 0;
  // 옛 꼴 — 부르는 쪽이 좌표를 가둔 클로저를 매번 새로 만든다
  const oldF = (n) => { for (let i = 0; i < n; i++) { const j = i & M, tx = TX[j], ty = TY[j];
    if (water(tx, ty, () => computeW(tx, ty))) sink++; } };
  // 새 꼴 — 모듈 수준 함수를 그대로 넘긴다(메모가 좌표를 준다)
  const newF = (n) => { for (let i = 0; i < n; i++) { const j = i & M;
    if (water(TX[j], TY[j], computeW)) sink++; } };
  rows.push(await bench('ⓑ 타일 메모 호출', 20e6, oldF, newF));
  if (!sink) throw new Error('sink');
}

// ── ⓒ treeBlockerAt 의 원 질의 — 배열 둘 ↔ 재사용 버퍼 ────────────────────
{
  const { Quadtree } = require(path.join(ROOT, 'server', 'quadtree.js'));
  const qt = new Quadtree(0, 0, 70016, 130016);
  let s = 0xc2b2ae35; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  // 실서버 나무 밀도에 맞춘다 — `/perf` 의 qtResources 크기(약 4.6만)
  for (let i = 0; i < 46000; i++) { const x = rnd() * 70016, y = rnd() * 130016; qt.insert({ x, y, ref: { x, y, type: 'tree', id: i } }); }
  const PX = new Float64Array(1 << 14), PY = new Float64Array(1 << 14);
  for (let i = 0; i < PX.length; i++) { PX[i] = rnd() * 70016; PY[i] = rnd() * 130016; }
  const M = PX.length - 1, R = 28, R2 = R * R;
  const scratch = [];
  let sink = 0;
  const oldF = (n) => { for (let i = 0; i < n; i++) { const j = i & M, x = PX[j], y = PY[j];
    const got = qt.queryCircle(x, y, R);
    for (let k = 0; k < got.length; k++) { const r = got[k].ref || got[k]; if (r.type === 'tree') { sink++; break; } } } };
  const newF = (n) => { for (let i = 0; i < n; i++) { const j = i & M, x = PX[j], y = PY[j];
    scratch.length = 0; qt.queryRect(x - R, y - R, R * 2, R * 2, scratch);
    for (let k = 0; k < scratch.length; k++) { const r = scratch[k].ref || scratch[k];
      const dx = r.x - x, dy = r.y - y; if (dx * dx + dy * dy > R2) continue;
      if (r.type === 'tree') { sink++; break; } } } };
  rows.push(await bench('ⓒ 나무 콜라이더 질의', 3e6, oldF, newF));
  console.log(`     (나무 46,000그루 · 반경 28px — 적중 ${sink} 회)`);
}

// ── ⓓ isPositionActive 의 청크 좌표 ──────────────────────────────────────
{
  const CS = 512;
  const keyOf = (cx, cy) => `${cx},${cy}`;
  const chunkXY = (x, y) => ({ cx: Math.floor(x / CS), cy: Math.floor(y / CS) });
  const keys = new Set();
  let s = 0x27d4eb2f; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 400; i++) keys.add(keyOf((rnd() * 137) | 0, (rnd() * 254) | 0));
  const X = new Float64Array(1 << 16), Y = new Float64Array(1 << 16);
  for (let i = 0; i < X.length; i++) { X[i] = rnd() * 70016; Y[i] = rnd() * 130016; }
  const M = X.length - 1;
  let sink = 0;
  const oldF = (n) => { for (let i = 0; i < n; i++) { const j = i & M;
    const { cx, cy } = chunkXY(X[j], Y[j]); if (keys.has(keyOf(cx, cy))) sink++; } };
  const newF = (n) => { for (let i = 0; i < n; i++) { const j = i & M;
    if (keys.has(keyOf(Math.floor(X[j] / CS), Math.floor(Y[j] / CS)))) sink++; } };
  rows.push(await bench('ⓓ 청크 활성 판정', 20e6, oldF, newF));
}

// ── 걸음 하나로 환산 ─────────────────────────────────────────────────────
// 걸음당 호출 수는 T345 §1 표(실측 계수)에서 온다 — 새 수 0.
const PER_STEP = { 'ⓐ 셀 판정(조기 반환)': 5, 'ⓑ 타일 메모 호출': 5.3, 'ⓒ 나무 콜라이더 질의': 5, 'ⓓ 청크 활성 판정': 2 };
let oSum = 0, nSum = 0;
console.log('\n  ── 걸음 하나로 환산(걸음당 호출 수 = T345 §1 실측 계수) ──');
for (const r of rows) {
  const c = PER_STEP[r.name] || 0;
  const o = r.oldNs * c, n = r.newNs * c; oSum += o; nSum += n;
  console.log(`  ${r.name.padEnd(28)} ×${String(c).padStart(4)}회  옛 ${o.toFixed(0).padStart(6)}ns → 새 ${n.toFixed(0).padStart(6)}ns   (Δ ${(o - n).toFixed(0)}ns)`);
}
console.log(`  ${'합(네 자리만)'.padEnd(28)}        옛 ${oSum.toFixed(0).padStart(6)}ns → 새 ${nSum.toFixed(0).padStart(6)}ns   (Δ ${(oSum - nSum).toFixed(0)}ns = ${((oSum - nSum) / 1000).toFixed(2)}µs/걸음)`);
console.log(`  걸음당 할당 바이트(같은 환산): 옛 ${rows.reduce((a, r) => a + r.oldB * (PER_STEP[r.name] || 0), 0).toFixed(0)}B → 새 ${rows.reduce((a, r) => a + r.newB * (PER_STEP[r.name] || 0), 0).toFixed(0)}B`);

require('fs').writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), node: process.version, rows, perStep: PER_STEP,
  oldNsPerStep: +oSum.toFixed(1), newNsPerStep: +nSum.toFixed(1), allocN: ALLOC_N }, null, 1));
console.log(`\n  → ${OUT}\n`);
})();
