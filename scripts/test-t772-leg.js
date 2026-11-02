#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t772-leg.js — 손잡이 `T772_LEG_FROM_LINGER`(★T782 켬 기본 · 되돌림 `=0`): 캐러밴 귀환 몸 — 장 뒤 따라잡기 질주 없애기 [T772] ==========
//
// ★왜 [T762 §2-4] 1일 귀환 다리 몸이 장이 끝난 뒤(하루 17.8~20.9 %) 몸 걸음의 최대 2.7배(171 px/s)로 뛴다 —
//   T661 보이는 몸이 일정을 **하루 머리부터** 보간하고(`_t661Vis`) 따라잡기 상한이 명목 ×4 라서다(T707 장이 하루 4/24 를 머물게 한다).
//   켜면 ① 귀환 보간 = 장 끝(`lingerUntil`) → econ 도착(`arriveAt`) · ② 귀환 상한 = 몸 걸음(존 `moveSpeed`) · 집 도착에 몸이 길 위면 센다(메우지 않는다).
//
// 재는 것:
//   ① 술어 — `=== '1'` 만 켬 · 읽는 자리 = `server/villages.js` 하나
//   ② 끔 = 종전 글자 — 켬 줄은 모두 `T772_ON` 뒤(보간 · 상한 · 출발 시각 · 늦음 셈 · 계기판)
//   ③ 정본 함수 글자 그대로 평가(가짜 세계 · 30Hz 하루) — `startReturnLeg` · `_t661Vis` · `tickCaravanBodies` · `_caravanSyncSweep`
//      ⓐ 미끼(끔): 장 끝에 몸이 길 뒤에 서 있고 따라잡기가 몸 걸음을 넘는다(자명 통과 금지)
//      ⓑ 켬: 15초 평균 · 틱 순간 빠르기 모두 ≤ 몸 걸음 · 장 끝 자리 = 길 머리 · econ 도착 전에 집에 닿는다 · 늦음 0
//      ⓒ 켬 · 일정이 몸 걸음보다 빠른 길: 몸 걸음 그대로 걷는다(≤ 64) · 집 도착(쓸기)에 길 위 → 늦음 1 · 남은 길 = 일정 − 몸 걸음 몫
//      ⓓ 끔 판은 늦음을 안 센다(계기판 칸 없음)
//
// 실행: node scripts/test-t772-leg.js   (존 안 띄움 · 1초)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const C = codeOnly(V);

console.log('\n=== 캐러밴 귀환 몸 — 장 뒤 따라잡기 질주 없애기 (T772) ===');
console.log('\n① 술어 · 읽는 자리');
{ const decl = V.match(/const T772_ON = process\.env\.T772_LEG_FROM_LINGER !== '0';/g) || [];
  ok(decl.length === 1, '① 선언 하나 · `!== \'0\'` — 켬 기본(T782 · 되돌림 `=0`)', `선언 ${decl.length}`);
  //   ★[T782] 끔 탐침 — 손잡이를 실제로 읽는가(기본 = 켬 · `=0` = 끔) · 마을 모듈을 그대로 불러 계기판 칸을 본다
  const { execFileSync } = require('child_process');
  const probe = (env, js) => { const e = Object.assign({}, process.env); delete e.T772_LEG_FROM_LINGER; delete e.T775_CARAVAN_RESUME; Object.assign(e, env);
    return execFileSync(process.execPath, ['-e', `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});console.log(JSON.stringify(${js}))`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  const t772 = 'V.__labProbe.t772Stat !== null', t775 = "'t775' in V.tickPerf().probe";
  ok(probe({}, t772) === 'true' && probe({ T772_LEG_FROM_LINGER: '0' }, t772) === 'false', '① ★끔 탐침(T772) — env 없음 = 켬(계기판 칸) · `=0` = 끔(칸 없음)');
  ok(probe({}, t775) === 'true' && probe({ T775_CARAVAN_RESUME: '0' }, t775) === 'false', '① ★끔 탐침(T775) — env 없음 = 켬(`t775` 칸) · `=0` = 끔(칸 없음)');
  ok((V.match(/const T775_RESUME = process\.env\.T775_CARAVAN_RESUME !== '0';/g) || []).length === 1, '① T775 선언 하나 · `!== \'0\'` — 켬 기본(T782)');
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T772_LEG_FROM_LINGER')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'villages.js'), '① 읽는 자리 = server/villages.js 하나', readers.join(',')); }

console.log('\n② 끔 = 종전 글자');
{ const L = C.split('\n').filter((l) => /_t772Stat\.|T\.t0|_t661\.t0|_cap \* dtMs/.test(l) && !/^const _t772Stat/.test(l));
  const gated = (l) => /T772_ON/.test(l) || /_cap \* dtMs/.test(l) || /_t772Stat\.(home|late|lateSumPx|lateMaxPx)/.test(l);
  ok(L.length >= 5 && L.every(gated), '② 켬 줄(출발 시각 · 보간 · 상한 · 늦음 셈 · 계기판) 모두 손잡이 뒤', `${L.length}줄`);
  ok(/const _cap = \(T772_ON && T\.leg === 'inbound' && state\.deps\.moveSpeed > 0\) \? state\.deps\.moveSpeed \/ 1000 : body\.nomPxMs \* 4;/.test(C),
    '② 상한 — 끔 = 종전 명목 ×4 · 켬 = 존 `moveSpeed` 정본(새 수 0)');
  ok(/if \(T772_ON && T661_ON && body\._t661 && !killed && body\._t661\.leg === 'inbound'\) \{/.test(C), '② 늦음 셈 — 켬 · 귀환 장부 · 피살 아님에서만');
  ok(/return Math\.max\(T\.L, _t661Target\(T, state\.world\.day \+ f, _t661End\(body\)\)\);/.test(C), '② 끔 보간 = 종전 글자(하루 머리부터 · 장부 `T.L` 아래로 안 간다)'); }

// ── ③ 정본 글자 평가 ─────────────────────────────────────────────────────────────
function grab(name) {
  const at = V.indexOf(`\nfunction ${name}(`); if (at < 0) throw new Error('없음 ' + name);
  { const eol = V.indexOf('\n', at + 1), one = V.slice(at, eol); if (/\}\s*$/.test(one) && (one.match(/\{/g) || []).length === (one.match(/\}/g) || []).length) return one + '\n'; }   // ★[PM 10-23] 한 줄 함수(T871 `_econDayFrac`)
  const end = V.indexOf('\n}\n', at); return V.slice(at, end + 3);
}
const SRC = ['econDayToMs', '_econDayFrac', 'setBodyPts', 'caravanPointAt', '_t661Path', '_t661End', '_t661Target', '_t661Vis', 'startReturnLeg', 'tickCaravanBodies', '_caravanSyncSweep'].map(grab).join('\n');
const MS = 64;   // 존 `MOVE_SPEED` 정본(zone.js) — 아래는 그 값을 deps 로 넘긴다
const zoneMove = +((fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8').match(/const MOVE_SPEED = (\d+);/) || [])[1]);
function world(on, lenPx) {
  const DAY = 1440000, D = 10;
  const state = { caravanBodies: new Map(), deps: { players: new Map(), isPositionActive: null, isBlockedByWall: null, moveSpeed: zoneMove }, world: { day: D, caravans: [] },
    dayMs: DAY, epoch: 0, lastGameDay: D, zoneId: 't', roads: null, _carTickAt: 0, byEcon: new Map() };
  const stat = { legs: 0, home: 0, late: 0, lateMaxPx: 0, lateSumPx: 0 };
  const names = ['state', 'T772_ON', '_t772Stat', 'T661_ON', 'T707_ON', 'T731_ON', 'CARAVAN_BLOCKTEST', 'SZ', '_escortMarch', 'despawnCaravanNpc', '_t707Tally', '_t661Stamp', 'console', 'T775_RESUME', '_t1034Mark'];   // ★[T775 · PM 착지 10-17] 다시 뜬 판   // ★[T1034] 귀환 출발 표(메타 행 한 줄 — 가짜 세계엔 저장이 없다 · 값 무변) 갈래 — ★[T782] 제품 기본 = 켬(가짜 세계엔 `state.ready` 가 없어 다시 뜸 문은 안 연다)
  const F = new Function(...names, SRC + '\nreturn { econDayToMs, setBodyPts, _t661Path, _t661Vis, startReturnLeg, tickCaravanBodies, _caravanSyncSweep };');
  const quiet = { log: () => {} };
  const K = F(state, on, stat, true, false, false, 0, 32, () => {}, () => {}, () => {}, () => {}, quiet, true, () => {});   // ★[T782] T775 = 제품 기본(켬)
  const head = K.econDayToMs(D), lingerEnd = head + DAY * 4 / 24;   // T707 장 머묾 하루 4/24(보고 T762)
  const pts = [{ x: 0, y: 0 }, { x: lenPx * 0.5, y: 0 }, { x: lenPx * 0.5, y: lenPx * 0.5 }];
  const c = { id: 1, from: { name: 'A' }, to: { name: 'B' }, arriveDay: D, returnArriveDay: D + 1 };
  const body = { c, pid: 'p1', phase: 'linger', lingerUntil: lingerEnd, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
  K.setBodyPts(body, body.pts); body.prog = body.len;
  const path_ = K._t661Path(pts);
  body._t661 = { path: path_, L: 0, D0: D, leg: 'inbound', ppd: path_.len, stall: false, day: D };
  const p = { x: 0, y: 0, hp: 100 }; state.deps.players.set('p1', p); state.caravanBodies.set(1, body);
  // 하루 30Hz — 장 끝 ~ econ 도착
  let now = lingerEnd - 1000; state._carTickAt = now;
  let maxTick = 0, maxWin = 0, startProg = null; const win = [];
  const arrive = head + DAY;
  while (now < arrive - 1) {
    now += 33; K.tickCaravanBodies(now);
    if (body.phase === 'inbound' && startProg === null) startProg = body.prog;
    if (body.phase === 'inbound') { const v = Math.hypot(p.vx || 0, p.vy || 0); if (v > maxTick) maxTick = v; win.push([now, p.x, p.y, body.prog]);
      while (win.length && now - win[0][0] > 15000) win.shift();
      if (win.length > 1 && now - win[0][0] >= 14900) { const a = win[0]; const sp = (body.prog - a[3]) / ((now - a[0]) / 1000); if (sp > maxWin) maxWin = sp; } }
  }
  const remAtArrive = body.len - body.prog;
  const S = K._caravanSyncSweep({ seen: new Set(), spawned: 0, arrived: 0, removed: 0 });
  return { maxTick, maxWin, startProg, remAtArrive, len: path_.len, stat, removed: S.removed, sched: path_.len / ((arrive - lingerEnd) / 1000) };
}

console.log('\n③ 정본 글자 평가 — 가짜 세계 · 30Hz 하루(장 끝 하루 4/24 · 1일 귀환 다리)');
ok(zoneMove === MS, '전제 — 존 `MOVE_SPEED` = 64 px/s(몸 걸음 정본을 deps 로 넘긴다)', zoneMove);
{ const len = 0.6 * MS * 1440;   // 일정 = 몸 걸음의 0.6 배(하루 통째) — T762 실제 날 판 최대 0.80 아래
  const off = world(false, len), on = world(true, len);
  ok(off.maxWin > MS * 1.5 && off.maxTick > MS * 2, 'ⓐ 미끼(끔) — 장 뒤 따라잡기가 몸 걸음을 넘는다(15초 평균 · 틱 순간)', `${off.maxWin.toFixed(1)} · ${off.maxTick.toFixed(1)} px/s`);
  ok(on.maxWin <= MS + 1e-6 && on.maxTick <= MS + 1e-6, '★ⓑ 켬 — 15초 평균 · 틱 순간 모두 ≤ 몸 걸음', `${on.maxWin.toFixed(1)} · ${on.maxTick.toFixed(1)} px/s · 일정 ${on.sched.toFixed(1)}`);
  ok(on.startProg !== null && on.startProg < 1, 'ⓑ 켬 — 장 끝 첫 틱의 자리 = 길 머리(뒤처져 서지 않는다)', on.startProg && on.startProg.toFixed(2));
  ok(on.remAtArrive <= 0.5 && on.stat.late === 0 && on.stat.home === 1 && on.stat.legs === 1, 'ⓑ 켬 — econ 도착 전에 집에 닿는다 · 늦음 0', `남은 ${on.remAtArrive.toFixed(1)}px · 늦음 ${on.stat.late}/${on.stat.home}`);
  ok(off.stat.home === 0 && off.stat.legs === 0, 'ⓓ 끔 — 늦음 셈 · 다리 셈이 안 선다', JSON.stringify(off.stat)); }
{ const len = 1.0 * MS * 1440;   // 일정이 장 끝 → 도착 몫(하루 20/24)에 몸 걸음보다 빠르다(×1.2)
  const on = world(true, len);
  const want = len - MS * 1440 * 20 / 24;
  ok(on.maxWin <= MS + 1e-6 && on.maxTick <= MS + 1e-6, '★ⓒ 켬 · 빠른 일정 — 몸 걸음 그대로 걷는다(질주 0)', `${on.maxTick.toFixed(1)} px/s · 일정 ${on.sched.toFixed(1)}`);
  ok(on.stat.late === 1 && Math.abs(on.stat.lateMaxPx - want) < MS * 2 && on.removed === 1, 'ⓒ 켬 — 집 도착(쓸기)에 길 위 → 늦음 1 · 남은 길 = 일정 − 몸 걸음 몫(메우지 않는다 · 회수는 종전 자리)',
    `남은 ${on.stat.lateMaxPx.toFixed(0)}px ≈ ${want.toFixed(0)}px`); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
