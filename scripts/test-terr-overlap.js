#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-terr-overlap.js — 마을 땅은 한 마을 것 (T569) ======================================
//
// ★왜 [재민 10-02 · T569] "어촌2랑 임업6이 겹쳐 있다 · 인접하면 상대 영토로는 확장 못 하고 반대쪽으로 자라겠지?"
//   서울 사본(day 3341): 두 마을 이상이 가진 영토 셀 38,032 · 다른 마을 집 부지와 겹친 집 82쌍.
//
// ★이 하네스가 지키는 것(존을 부팅하지 않는다 — 정본 `_terrGrow`·집터 술어·부팅 정리를 `__labProbe._t569Probe` 로 그대로 부른다):
//   ① 붙여 놓은 두 마을(중심 46셀 · 시작 영토 반경 15)을 200일 키운다 — **겹친 영토 셀 0**
//   ② 막힌 쪽 반대로 자란다 — 서로를 향한 반쪽의 셀 수가 등 쪽 반쪽보다 적다(끈 판과 비교 · 같은 날 수)
//   ③ 집터 술어 — 부지 원판이 남의 영토 셀에 닿거나 다른 마을 집 부지(같은 124셀 원판)에 닿으면 `남의 마을` · 제 땅 한복판은 통과
//   ④ 부팅 정리 — 겹친 셀을 먼저 가진 마을에 남기고 다른 마을에서 뺀다(빼는 수 = 겹친 셀 수)
//   ⑤ 자명 통과 금지 — `T569_OVERLAP=0`(자식)이면 같은 200일에 겹친 셀이 **생긴다** · 술어가 그 자리를 통과시킨다 · 집 부지가 겹친다
//   ⑦ 긴 땅(중심에서 200셀 띠)의 끝에 붙은 마을도 이웃으로 본다(이웃 거르기 반지름 = 실제 최대 반지름)
//   ⑥ 자란 두 땅에 정본 술어가 통과시키는 자리마다 집을 번갈아 세운다 — **다른 마을 집 부지 겹침 0 · 남의 영토 위 집 0**
//
// 실행: node scripts/test-terr-overlap.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/tto-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = parseInt(process.env.TTO_DAYS || '200', 10);

// ── 한 판(자식에서도 같은 함수) ────────────────────────────────────────────────
function run() {
  const V = require(path.join(ROOT, 'server/villages.js'));
  const P = V.__labProbe, T = P._t569Probe;
  const VL = require(path.join(ROOT, 'server/village-layout.js'));
  //   땅 — 전부 열린 평지(비옥 고르게 · 물·바위 0): 막는 것은 **이웃 마을뿐**이게
  const ta = { isBlocked: () => false, isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
  const disc = (cx, cy, R) => { const s = new Set(); for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx * dx + dy * dy <= R * R) s.add((cx + dx) + ',' + (cy + dy)); return s; };
  const mk = (id, name, cx, cy) => ({ dbId: id, name, ccx: cx, ccy: cy, _terrSet: disc(cx, cy, 15), _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
    _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [],
    //   목표는 크게(집 항) · 인구 상한(T538)이 묶지 않게 인구도 크게 — 이 판이 재는 것은 **방향**이다
    econ: { land: { size: 5000 }, housing: 3000, npcs: new Array(5000).fill(0) } });
  const A = mk(1, 'A', 1000, 1000), B = mk(2, 'B', 1046, 1000);
  const keep = T.setup({ ta, villages: [A, B], db: null });
  const keepDeps = P._t400Probe.setup({ deps: {} });
  for (let d = 0; d < DAYS; d++) { T.grow(A); T.grow(B); }
  const inter = [...A._terrSet].filter((k) => B._terrSet.has(k)).length;
  //   방향 — B 쪽 반평면(x > 중심)과 등 쪽(x < 중심)의 A 셀 수(B 는 거울)
  const half = (v, sign) => [...v._terrSet].filter((k) => sign * (+k.split(',')[0] - v.ccx) > 0).length;
  const out = { on: T.on, inter, aSize: A._terrSet.size, bSize: B._terrSet.size, aToward: half(A, +1), aAway: half(A, -1), bToward: half(B, -1), bAway: half(B, +1) };
  //   ⑥ 집 채우기 — 자란 두 땅에 정본 술어가 통과시키는 자리마다 집을 번갈아 세운다(서로 마주 보는 자리부터 · 3셀 격자)
  //     → 두 마을 집 부지(124셀 원판)가 한 셀이라도 같이 밟는 쌍 · 남의 영토 셀을 밟은 집 수
  const LOT = VL.LOT_CELLS;
  const candsOf = (v, o) => [...v._terrSet].map((k) => k.split(',').map(Number)).filter(([x, y]) => x % 3 === 0 && y % 3 === 0)
    .sort((p, q) => Math.hypot(p[0] - o.ccx, p[1] - o.ccy) - Math.hypot(q[0] - o.ccx, q[1] - o.ccy) || p[0] - q[0] || p[1] - q[1]);
  const qa = candsOf(A, B), qb = candsOf(B, A); let ia = 0, ib = 0;
  const place = (v, q, i) => { for (; i < q.length; i++) { const [x, y] = q[i]; if (T.reject(v, x, y, false) === null) { v._houseCells.push({ cx: x, cy: y }); return i + 1; } } return i; };
  while (ia < qa.length || ib < qb.length) { ia = place(A, qa, ia); ib = place(B, qb, ib); }
  let lotPairs = 0; for (const a of A._houseCells) for (const b of B._houseCells) if (T.lotsTouch(b.cx - a.cx, b.cy - a.cy)) lotPairs++;
  const onOther = (v, o) => v._houseCells.filter((h) => LOT.some(([dx, dy]) => o._terrSet.has((h.cx + dx) + ',' + (h.cy + dy)))).length;
  Object.assign(out, { housesA: A._houseCells.length, housesB: B._houseCells.length, lotPairs, onOther: onOther(A, B) + onOther(B, A) });
  A._houseCells = []; B._houseCells = [];
  //   ③ 집터 술어 — B 에 집 하나를 경계 가까이 두고 A 쪽에서 묻는다
  //     부지 원판(`LOT_CELLS` · R 6.5)의 가로 폭은 중심 −6 ~ +5 — 두 원판이 한 셀이라도 같이 밟으려면 중심 차가 −11 ~ +11.
  //     A 의 동쪽 끝 줄 xb 를 찾고, A 후보는 xb−5(원판 오른쪽 끝 = xb · A 땅 안), B 의 집은 xb+6(중심 차 11 — 원판이 한 줄 겹친다 · 옛 DB 판)
  let xb = A.ccx; while (A._terrSet.has((xb + 1) + ',' + A.ccy)) xb++;   // A 의 동쪽 끝(맞닿은 줄)
  B._houseCells = [{ cx: xb + 6, cy: A.ccy }];
  out.rejLot = T.reject(A, xb - 5, A.ccy, false);          // 원판이 B 집 부지에 닿는다(중심 차 11)
  out.lotEdge = T.lotsTouch(11, 0) && !T.lotsTouch(12, 0);  // 원판 술어의 경계 — 11 은 닿고 12 는 안 닿는다
  out.rejTerr = T.reject(A, xb - 2, A.ccy + 3, false);     // 원판이 B 영토 셀에 닿는다
  out.okMid = T.reject(A, A.ccx - 30, A.ccy, false);       // A 땅 한복판
  //   ④ 부팅 정리 — 두 마을이 같은 셀 50개를 가진 판을 만들어 정리한다(먼저 가진 쪽 = A)
  const A2 = mk(11, 'A2', 2000, 2000), B2 = mk(12, 'B2', 2020, 2000);
  T.setup({ ta, villages: [A2, B2], db: null });
  const shared = [...A2._terrSet].filter((k) => B2._terrSet.has(k));
  const removed = T.resolve(shared.map((k) => ({ cx: +k.split(',')[0], cy: +k.split(',')[1], village_id: 11 })));
  out.shared = shared.length; out.removed = removed; out.after = [...A2._terrSet].filter((k) => B2._terrSet.has(k)).length;
  out.aKept = shared.every((k) => A2._terrSet.has(k));
  //   ⑦ 긴 땅 — 해안 띠처럼 중심에서 200셀 뻗은 마을 C 의 끝에 붙은 마을 D: 이웃 거르기가 C 를 놓치면 술어·자람이 C 를 못 본다
  const C = mk(21, 'C', 3000, 3000), D = mk(22, 'D', 3216, 3000);   // D 시작 원판 왼끝 3201 — C 끝(3200)과 맞닿고 안 겹친다
  C._terrSet = new Set(); for (let x = 3000; x <= 3200; x++) for (let y = 2998; y <= 3002; y++) C._terrSet.add(x + ',' + y);
  T.setup({ ta, villages: [C, D], db: null });
  out.nearLong = T.near(D).includes('C');
  out.interLong0 = [...D._terrSet].filter((k) => C._terrSet.has(k)).length;
  out.oldR = (2 * Math.sqrt(C._terrSet.size / Math.PI) + 15) + (2 * Math.sqrt(D._terrSet.size / Math.PI) + 15);   // 종전(넓이 원 × 2) 거르기 반지름 합 — 참고
  for (let d = 0; d < 30; d++) T.grow(D);
  out.interLong = [...D._terrSet].filter((k) => C._terrSet.has(k)).length;
  T.setup(keep); P._t400Probe.setup(keepDeps);
  return out;
}
if (process.env.TTO_CHILD) { const _l = console.log; console.log = () => {}; const r = run(); console.log = _l; process.stdout.write('\n@@' + JSON.stringify(r) + '\n'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const child = (env) => { const s = execFileSync(process.execPath, [__filename], { env: { ...process.env, TTO_CHILD: '1', ...env }, maxBuffer: 64 << 20 }).toString(); return JSON.parse(s.slice(s.lastIndexOf('\n@@') + 3)); };

console.log(`\n=== T569 — 마을 땅은 한 마을 것(붙은 두 마을 ${DAYS}일 · 정본 _terrGrow · 집터 술어 · 부팅 정리) ===`);
const on = child({}), off = child({ T569_OVERLAP: '0' });
console.log(`  · 켬 — A ${on.aSize} · B ${on.bSize}셀 · 겹침 ${on.inter} · A 마주 ${on.aToward}/등 ${on.aAway} · B 마주 ${on.bToward}/등 ${on.bAway}`);
console.log(`  · 끔 — A ${off.aSize} · B ${off.bSize}셀 · 겹침 ${off.inter} · A 마주 ${off.aToward}/등 ${off.aAway} · B 마주 ${off.bToward}/등 ${off.bAway}`);
ok(on.on === true && off.on === false, '[상황] 손잡이가 산다(켬 기본 · `T569_OVERLAP=0` 끔)');
ok(on.aSize > 3000 && on.bSize > 3000, '[상황] 두 마을이 실제로 자랐다(자명 통과 금지 — 안 자라면 겹칠 일도 없다)', `${on.aSize} · ${on.bSize}`);
ok(on.inter === 0, '① ★★겹친 영토 셀 0 — 남의 영토로 안 자란다', `${on.inter}셀`);
ok(on.aToward < on.aAway && on.bToward < on.bAway, '② ★막힌 쪽 반대로 자란다 — 마주 보는 반쪽 < 등 쪽 반쪽(두 마을 다)', `A ${on.aToward} < ${on.aAway} · B ${on.bToward} < ${on.bAway}`);
ok(on.aSize + on.bSize >= 0.9 * (off.aSize + off.bSize), '② 막혀도 덜 자라지 않는다 — 다른 쪽으로 간다(합 ≥ 끔의 90%)', `${on.aSize + on.bSize} vs ${off.aSize + off.bSize}`);
ok(on.housesA >= 10 && on.housesB >= 10, '[상황] 두 땅에 집이 실제로 섰다(정본 술어가 통과시킨 자리 · 마주 보는 자리부터)', `A ${on.housesA} · B ${on.housesB}채`);
ok(on.lotPairs === 0 && on.onOther === 0, '⑥ ★★다른 마을 집 부지 겹침 0 · 남의 영토 위 집 0', `겹친 쌍 ${on.lotPairs} · 남의 땅 위 ${on.onOther}`);
ok(on.rejLot === '남의 마을','③ ★다른 마을 집 부지(124셀 원판)에 닿는 집터 → `남의 마을`', String(on.rejLot));
ok(on.lotEdge === true, '③ 원판 술어의 경계 — 중심 차 11 은 닿고 12 는 안 닿는다(124셀 원판 폭 그대로)');
ok(on.rejTerr === '남의 마을', '③ ★남의 영토 셀에 닿는 집터 → `남의 마을`', String(on.rejTerr));
ok(on.okMid === null, '③ 제 땅 한복판 집터는 통과(술어가 다 막지 않는다)', String(on.okMid));
ok(on.nearLong === true && on.interLong0 === 0 && on.interLong === 0, '⑦ ★긴 땅(중심에서 200셀 띠)의 끝에 붙은 마을도 이웃으로 본다 — 30일 겹침 0', `이웃 ${on.nearLong} · 겹침 ${on.interLong0} → ${on.interLong} · 중심 거리 216 vs 넓이 원 거르기 ${on.oldR.toFixed(0)}(놓쳤을 판)`);
ok(off.interLong0 === 0 && off.interLong > 0, '⑦ 끈 판은 그 띠 위로 자란다(⑦ 이 무는 판)', `${off.interLong}셀`);
ok(on.shared > 0 && on.removed === on.shared && on.after === 0 && on.aKept, '④ ★부팅 정리 — 겹친 셀은 먼저 가진 마을에 남고 다른 마을에서 빠진다', `겹침 ${on.shared} → 뺌 ${on.removed} · 남은 겹침 ${on.after} · 먼저 가진 쪽 그대로 ${on.aKept}`);
console.log('\n── 자명 통과 금지 ──');
ok(off.inter > 0, '⑤ 끈 판(`T569_OVERLAP=0`)은 같은 날 수에 **겹친다** — ① 이 무는 판이 실제로 있다', `${off.inter}셀`);
ok(off.lotPairs > 0 && off.onOther > 0, '⑤ 끈 판은 같은 채우기에 집 부지가 **겹친다**(옛 DB 82쌍의 판) — ⑥ 이 무는 판이 실제로 있다', `겹친 쌍 ${off.lotPairs} · 남의 땅 위 ${off.onOther} · A ${off.housesA} · B ${off.housesB}채`);
ok(off.rejLot !== '남의 마을' &&off.rejTerr !== '남의 마을', '⑤ 끈 판의 술어는 `남의 마을` 을 모른다', `${off.rejLot} · ${off.rejTerr}`);
ok(on.inter === 0 && off.inter > 0 && on.aToward !== off.aToward, '⑤ 켬·끔이 같은 판이 아니다(방향이 갈린다)', `A 마주 ${on.aToward} vs ${off.aToward}`);
try { for (const s of ['', '-wal', '-shm']) fs.unlinkSync(process.env.DB_PATH + s); } catch (e) {}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
