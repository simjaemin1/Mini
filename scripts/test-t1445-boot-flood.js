#!/usr/bin/env node
'use strict';
// @regress
// @bait 3
// @old-red-also server/villages.js
// === scripts/test-t1445-boot-flood.js — 새벌 부팅 죽음 고리(11-22): 진행 중 전쟁 세계를 다시 띄우면 병사 먼 걸음 탐색이 한꺼번에 선다 — `T1445_BOOT_BOUND` ===
//   ★왜(보고 T1445 11-24): 11-22 라이브 사본(전쟁 하나 · 병사 44)을 띄우면 병사 걸음 기억(`_t804p` · `_t804f` · `_t821s` — 영속 아님)이 비어
//     병사마다 먼 걸음 재개형 탐색(T821 · 꺼냄 상한 25만)을 같은 때 세운다. 그 g · came 저장이 Map(문자열 열쇠)이라 힙이 2 ~ 3 분 만에 1.5 GB 한도를 넘는다
//     (land1076 246초 · a7ab5a9d 346초 — 힙 표본 산 몫 1,259 MB 중 1,148 MB 가 `_searchStep`). 칸 조각 저장(T1381 ㉠ · 타입 배열)이면 꼭대기 828 MB · 죽음 0.
//   ① 손잡이 글자(`server/villages.js` 의 두 줄을 떠서 env 마다 셈): 미설정 = 칸 조각 켬 · `T1445_BOOT_BOUND=0` = 종전(T1381 env 그대로 — 끔) ·
//      `T1381_WALK_HEAP=0` = 끔 · `T1445_BOOT_BOUND=0` + `T1381_WALK_HEAP=1` = 켬
//   ② 부르는 자리: 먼 걸음 재개형 물음(`_t804Local` 의 `localPathBegin`)이 `tile: T1381_WALK_HEAP` 를 넘긴다(한 자리)
//   ③ 부팅 모형(존 없이 — `sim/path-core.js` 그대로 · 아이 판 둘 `--expose-gc`): 닿을 수 없는 목표(둘레 벽) 먼 걸음 탐색 N 개를 같은 틱에 세워 번갈아 민다(병사 N 이 다시 뜬 판에서 한꺼번에 묻는 꼴).
//      칸 조각 판 V8 힙 꼭대기 늘음 ≤ Map 판의 ¼ · 두 판 답(못 찾음) · 꺼냄 · 민 횟수 같음 · ★자명 통과 금지: Map 판 늘음 ≥ N × 8 MB(물음이 실제로 컸다)
//   ★미끼 셋 [T1356 규약]: ⓐ 손잡이 줄을 종전(T1381 env 만)으로 되돌린 villages 사본 → ① 빨강 · ⓑ 부르는 자리가 `tile: false` 인 사본 → ② 빨강 ·
//     ⓒ 칸 조각 저장이 늘 Map 으로 물러나는 path-core 사본(`_tlOk` 거짓) → ③ 빨강
//   날짜 · 벽시계를 안 쓴다.
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
if (require.main === module) require('./lib-port').noCentral();   // [T1288 ⑯d] 존을 안 띄운다(글자 · path-core 만)
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const VIL = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), PC = fs.readFileSync(path.join(ROOT, 'sim', 'path-core.js'), 'utf8');
const bait = (src, a, b) => { const n = src.split(a).length - 1; return { src: n === 1 ? src.replace(a, () => b) : null, n }; };

// ① 손잡이 — 두 줄을 떠서 env 마다
function knob(src, env) {
  const L = src.split('\n').filter((l) => /^const (T1445_BOOT_BOUND|T1381_WALK_HEAP) =/.test(l));
  try { return new Function('process', L.join('\n') + '\nreturn T1381_WALK_HEAP;')({ env }); } catch (e) { return 'err:' + e.message; }
}
function check1(src) {
  const a = knob(src, {}), b = knob(src, { T1445_BOOT_BOUND: '0' }), c = knob(src, { T1381_WALK_HEAP: '0' }), d = knob(src, { T1445_BOOT_BOUND: '0', T1381_WALK_HEAP: '1' });
  return { ok: a === true && b === false && c === false && d === true, d: `미설정 ${a} · BOOT_BOUND=0 ${b} · WALK_HEAP=0 ${c} · 둘 다 ${d}` };
}
// ② 부르는 자리
const callSite = (src) => (src.match(/PathCore\.localPathBegin\([^;]*tile: T1381_WALK_HEAP[^;]*maxNodes: PathCore\.ROUTE_MAX_POPS/g) || []).length;
// ③ 부팅 모형 — 아이 판(path-core 사본 · 저장 방식) — 힙 꼭대기 늘음 · 답
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1445-flood-'));
function flood(pcSrc, tile, N) {
  const pf = path.join(TMP, 'pc-' + Math.random().toString(36).slice(2) + '.js'); fs.writeFileSync(pf, pcSrc);
  const kid = `
    const PC = require(${JSON.stringify(pf)}); global.gc(); const h0 = process.memoryUsage().heapUsed; let peak = 0;
    const G = 700, wall = (x, y) => (Math.abs(x - 600) <= 3 && Math.abs(y - 600) <= 3 && !(x === 600 && y === 600)) ? (Math.abs(x - 600) === 3 || Math.abs(y - 600) === 3) : false;
    const blk = (x, y) => x < 0 || y < 0 || x >= G || y >= G || wall(x, y);
    const S = []; for (let i = 0; i < ${N}; i++) S.push(PC.localPathBegin(10 + i * 7, 20 + i * 5, 600, 600, { blocked: blk, blockedStep: (fx, fy, x2, y2) => blk(x2, y2), maxNodes: PC.ROUTE_MAX_POPS, tile: ${tile} }));
    const res = S.map(() => null), pushes = S.map(() => 0); let live = S.length, k = 0;
    while (live) { for (let i = 0; i < S.length; i++) { if (res[i]) continue; const r = PC.pathStep(S[i], 4096); pushes[i]++; if (r.done) { res[i] = { path: r.path ? r.path.length : 0, pops: S[i].pops }; live--; } }
      if ((++k & 7) === 0) { const h = process.memoryUsage().heapUsed - h0; if (h > peak) peak = h; } }
    const h = process.memoryUsage().heapUsed - h0; if (h > peak) peak = h;
    console.log(JSON.stringify({ peakMB: +(peak / 1048576).toFixed(1), res, pushes }));`;
  const out = execFileSync(process.execPath, ['--expose-gc', '--max-old-space-size=4096', '-e', kid], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop());
}
function check3(pcSrc, N) {
  const A = flood(pcSrc, false, N), B = flood(pcSrc, true, N);
  const same = JSON.stringify(A.res) === JSON.stringify(B.res) && JSON.stringify(A.pushes) === JSON.stringify(B.pushes);
  return { A, B, same, ok: same && A.peakMB >= N * 8 && B.peakMB <= A.peakMB / 4 && A.res.every((r) => r && r.path === 0) };
}

console.log('== ① 손잡이 `T1445_BOOT_BOUND`(켬 기본 · 끔 = 종전)');
{ const r = check1(VIL); ok(r.ok, '미설정 = 칸 조각 켬 · BOOT_BOUND=0 = 종전 끔 · WALK_HEAP=0 = 끔 · BOOT_BOUND=0 + WALK_HEAP=1 = 켬', r.d); }
console.log('== ② 먼 걸음 재개형 물음이 그 손잡이를 저장 방식으로 넘긴다');
ok(callSite(VIL) === 1, '`_t804Local` 의 `localPathBegin(… tile: T1381_WALK_HEAP · maxNodes: ROUTE_MAX_POPS)` 한 자리', `자리 ${callSite(VIL)}`);
console.log('== ③ 부팅 모형 — 같은 틱에 먼 걸음 탐색 N 개(닿을 수 없는 목표)');
const N = 12, R3 = check3(PC, N);
ok(R3.ok, `칸 조각 판 힙 꼭대기 늘음 ≤ Map 판의 ¼ · 답 · 꺼냄 · 민 횟수 같음 · Map 판 늘음 ≥ ${N} × 8 MB(자명 통과 금지)`, `Map ${R3.A.peakMB} MB ↔ 칸 조각 ${R3.B.peakMB} MB · 같음 ${R3.same} · 꺼냄 ${R3.A.res[0] && R3.A.res[0].pops} · 민 횟수 ${R3.A.pushes[0]}`);

console.log('== 미끼 셋');
{ const b = bait(VIL, "const T1381_WALK_HEAP = process.env.T1381_WALK_HEAP === '1' || (T1445_BOOT_BOUND && process.env.T1381_WALK_HEAP !== '0');", "const T1381_WALK_HEAP = process.env.T1381_WALK_HEAP === '1';"), r = b.src && check1(b.src);
  ok(b.n === 1 && r && !r.ok, '미끼 ⓐ 손잡이 줄을 종전(T1381 env 만)으로 되돌린 villages 사본 → ① 빨강', `바꾼 자리 ${b.n} · ${r && r.d}`); }
{ const b = bait(VIL, 'tile: T1381_WALK_HEAP, maxNodes: PathCore.ROUTE_MAX_POPS', 'tile: false, maxNodes: PathCore.ROUTE_MAX_POPS');
  ok(b.n === 1 && callSite(b.src) === 0, '미끼 ⓑ 먼 걸음 물음이 `tile: false` 인 villages 사본 → ② 빨강', `바꾼 자리 ${b.n} · 자리 ${b.src ? callSite(b.src) : '-'}`); }
{ const b = bait(PC, 'function _tlOk(sx, sy, gx, gy) { return Number.isInteger(sx)', 'function _tlOk(sx, sy, gx, gy) { return false && Number.isInteger(sx)'), r = b.src && check3(b.src, N);
  ok(b.n === 1 && r && !r.ok, '미끼 ⓒ 칸 조각 저장이 늘 Map 으로 물러나는 path-core 사본 → ③ 빨강', `바꾼 자리 ${b.n} · Map ${r && r.A.peakMB} ↔ 칸 조각 ${r && r.B.peakMB} MB`); }

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== T1445 부팅 죽음 고리 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
