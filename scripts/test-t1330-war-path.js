#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1330-war-path.js — 큰 교전의 몸 길찾기: 막힌 병사 300 이 닿을 수 없는 길 점을 매 틱 다시 뒤지지 않는다(T1330) ===========
//
// ★왜 [T1315 회부 3 → T1330] 가상 시계 전쟁 판(`--war inf --vclock` · 1020)이 econ 날 368 에서 45분 넘게 한 날을 못 넘겼다 —
//   스택 셋 다 `stepFight → advance → _warPathNext → localPath`. 풀린 병사(`_warWorld.advance`)는 적 본대까지 곧은 줄이 막히면 행군로 길 점을,
//   그 길 점까지도 막히면 걸음 경로(`_warPathNext` → path-core `localPath`)를 묻는다. 길 점이 닿을 수 없는 자리(닫힌 성벽 안 · 도랑 너머)면
//   탐색은 꺼냄 상한(`LOCAL_MAX_NODES`)까지 뒤지고 null — 그리고 **기억이 없어** 다음 틱에 또 같은 물음을 했다(병사 × 30틱/초).
// ★고침(villages `_t1330Memo`): 막힘 술어 세대(직사각 · 지형 · 나무 메모가 함께 새로 서는 그 객체) 하나에 (출발 칸 · 목표 칸) → 답을 기억한다.
//   술어가 그 세대 안에서 칸마다 처음 답 그대로라 같은 물음의 답은 비트 같다 — 그래서 손잡이 0(전투 결과 바이트 같음 · 아래 ③ 이 잰다).
//
// 장면: 운영 함수 그대로(villages `__p3Bind` · war-live `createWarLive` · battle-core · 존 `_standCellNear` 글자) — 판 자 마을 둘레에 **닫힌 성벽**(두께 2칸 · 반지름 18칸) ·
//   공격 300 은 성벽 서쪽 바깥(행군로 = 서 → 마을 한가운데 곧은 줄 · 길 점은 성벽 안 = 닿을 수 없다) · 지키는 300 은 안(지키는 쪽은 안 쫓는다).
//   한 틱 = 공격 병사 전부 `advance` 한 번 + 그 방향으로 반 칸(막혔으면 제자리) — 전투 스텝의 길찾기 몫만 떼어 잰다.
// 지키는 것:
//   ① 상황 assert — 공격 병사가 실제로 걸음 경로를 묻는다(`_t1330Stat.ask > 0`) · 그 물음이 닿을 수 없음(fail)이다 · 장면이 정말 막혔다
//   ② 틱 예산 — 성벽 앞에 선 끝 10틱의 최대 틱 ms ≤ 예산(33ms) × `N_BUDGET` · 기억이 실제로 맞았다(hit) — 실제 판(1020 날 366 · 367)의 꼴: 선 병사가 같은 물음을 틱마다
//   ③ 결과 결정적 — 같은 장면 두 번 = 병사 자리 한 글자 같음 · ★기억 없는 사본(미끼 · 아래)과도 첫 틱들의 방향이 한 글자 같음(손잡이 0 의 근거)
//   ④ ★미끼 — 기억을 뺀 사본(`server/_t1330bait-villages.js` · 판 끝에 지움)은 선 틱마다 예산의 `N_BUDGET` 배를 넘는다(빨강)
// 실행: node scripts/test-t1330-war-path.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';

const N_BUDGET = 3;          // 틱 예산 배수(하네스 자 — 이 상자에서 고친 판은 예산 밑 · 미끼는 수백 배)
const TICK_MS = 1000 / 30;   // 존 틱(30Hz) 예산
const SZ = 32;

function scene(villagesFile, ticks) {
  const _l = console.log; console.log = () => {};
  let V; try { V = require(villagesFile); } finally { console.log = _l; }
  const WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js');
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const standSrc = /function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZSRC);
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', standSrc[0] + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  // 닫힌 성벽 — 마을 한가운데(500,500) · 반지름 18 ~ 19칸 고리(문 없음)
  const C = 500, RIN = 18, ROUT = 19;
  const wall = (cx, cy) => { const d = Math.max(Math.abs(cx - C), Math.abs(cy - C)); return d >= RIN && d <= ROUT; };
  const deps = { isTerrainBlockedLocal: (px, py) => wall(Math.floor(px / SZ), Math.floor(py / SZ)), isWaterTileLocal: () => false, treeCellBlocked: () => false, standCellNear, anyViewerNear: () => false };
  const world = { day: 400 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [], byDbId: new Map(), byEcon: new Map(), world, db: null,
    warBodies: new Map(), _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 } });
  H.state.warLive = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: () => {}, blockedCell: (cx, cy) => H._warBlockedCell(cx, cy), arrowOut: () => {}, arrowNear: () => false });
  H._warBuildRectIndex(true);
  const fight = { holder: 'B', objective: { x: C + 0.5, y: C + 0.5 }, route: [{ x: C - 120.5, y: C + 0.5 }, { x: C + 0.5, y: C + 0.5 }], t: 0, home: {} };
  const W = H._warWorld(fight);
  const ctx = { _cen: { A: { n: 300, x: C - 40, y: C }, B: { n: 300, x: C + 0.5, y: C + 0.5 } } };
  // 공격 300 — 성벽 서쪽 바깥 띠(x 455 ~ 474 · y 485 ~ 514) · 결정적 배치
  const A = []; for (let i = 0; i < 300; i++) A.push({ side: 'A', x: 455.5 + (i % 20), y: 485.5 + Math.floor(i / 20) * 2, hp: 10 });
  const st0 = H._t1330Stat ? Object.assign({}, H._t1330Stat) : null;
  const ms = [], dirs = [];
  for (let t = 0; t < ticks; t++) {
    fight.t += 1 / 30;
    const t0 = process.hrtime.bigint();
    const row = [];
    for (const u of A) {
      const d = W.advance(ctx, u);
      if (d) { const nx = u.x + d.dx * 0.5, ny = u.y + d.dy * 0.5; if (!W.blocked(nx, ny)) { u.x = nx; u.y = ny; } row.push(d.dx.toFixed(6) + ',' + d.dy.toFixed(6)); } else row.push('-');
    }
    ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    dirs.push(row.join(' '));
  }
  const st = H._t1330Stat ? { ask: H._t1330Stat.ask - st0.ask, hit: H._t1330Stat.hit - st0.hit, fail: H._t1330Stat.fail - st0.fail, apart: H._t1330Stat.apart - st0.apart, comp: H._t1330Stat.comp - st0.comp } : null;
  const pos = A.map((u) => u.x.toFixed(4) + ',' + u.y.toFixed(4)).join(' ');
  const inside = A.filter((u) => Math.max(Math.abs(Math.floor(u.x) - C), Math.abs(Math.floor(u.y) - C)) < RIN).length;
  const wallHit = A.filter((u) => wall(Math.floor(u.x), Math.floor(u.y))).length;
  return { ms, dirs, pos, st, inside, wallHit };
}

// ── 아이 판(미끼 · 대조) — 존 villages 사본으로 같은 장면 ──
if (process.env.__T1330_SUB) {
  const r = scene(process.env.__T1330_SUB, +process.env.__T1330_TICKS || 2);
  fs.writeSync(1, '@@T1330 ' + JSON.stringify({ ms: r.ms, dirs: r.dirs }) + '\n');   // 동기 쓰기(파이프 · 곧 끝난다 — console.log 는 끝에서 잘린다)
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
console.log('\n=== T1330 큰 교전 몸 길찾기 — 닫힌 성벽 앞 공격 300 · 틱 예산 · 결정성 · 미끼 ===');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const sub = (file, ticks) => {
  let out = '';
  try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1330_SUB: file, __T1330_TICKS: String(ticks) }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { out = String((e && e.stdout) || ''); }
  const m = /@@T1330 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
};
// ① · ② — 이 판(정본)
const T = 40, TB = 24;   // 40틱 — 병사들이 15틱쯤 성벽에 닿아 선다 · 재는 몫 = 끝 10틱(선 채 같은 물음을 되풀이하는 구간) · 미끼는 24틱(끝 6틱)
const r1 = sub(VFILE, T);   // 첫 판(아이 · 모듈 상태 새로)
const _l = console.log; console.log = () => {}; const r2 = scene(VFILE, T); console.log = _l;   // 같은 장면 두 번째(이 프로세스)
ok(!!r1 && !!r2 && r2.st && r2.st.ask > 0 && r2.st.fail > 0, '① 상황 assert — 공격 병사가 걸음 경로를 실제로 묻고 그 물음이 닿을 수 없음(성벽 안 길 점)이다', r2 && r2.st ? `물음 ${r2.st.ask} · 길 없음 ${r2.st.fail} · 기억 맞음 ${r2.st.hit}` : '');
ok(r2 && r2.st && r2.st.comp > 0 && r2.st.apart > 0, '① 닫힌 덩이 — 첫 "길 없음" 뒤 성벽 안을 칠해 기억하고, 다른 병사의 같은 안쪽 물음은 탐색 없이 null(③ 사본 대조가 같은 답임을 잰다)', r2 && r2.st ? `닫힌 덩이 ${r2.st.comp} · 탐색 없이 null ${r2.st.apart}` : '');
ok(r2 && r2.inside === 0 && r2.wallHit === 0, '① 상황 assert — 장면이 정말 막혔다(성벽 안에 든 병사 0 · 벽 칸에 선 병사 0)', r2 ? `안 ${r2.inside} · 벽 ${r2.wallHit}` : '');
const tail = r2 ? r2.ms.slice(-10) : [], mx = tail.length ? Math.max(...tail) : Infinity, peak = r2 ? Math.max(...r2.ms) : 0;
ok(mx <= TICK_MS * N_BUDGET && r2.st.hit > 0, `② 틱 예산 — 성벽 앞에 선 끝 10틱 최대 ${mx.toFixed(1)}ms ≤ ${(TICK_MS * N_BUDGET).toFixed(0)}ms(예산 ${TICK_MS.toFixed(1)} × ${N_BUDGET}) · 기억 맞음`, `40틱 중 가장 긴 틱 ${peak.toFixed(0)}ms(병사들이 벽에 처음 닿는 틱 — 처음 묻는 물음) · 기억 맞음 ${r2 ? r2.st.hit : 0}`);
// ③ 결정성
{ const d = r1 && r2 ? r1.dirs.findIndex((x, i) => x !== r2.dirs[i]) : -2;
  ok(!!r1 && d < 0, '③ 결과 결정적 — 같은 장면 두 번 = 40틱 방향 한 글자 같음', r1 ? (d < 0 ? '' : `첫 갈림 틱 ${d}`) : '첫 판 없음'); }
// ④ 미끼 — 기억을 뺀 사본(같은 장면 · 두 틱만 — 한 틱이 수 초)
const VS = fs.readFileSync(VFILE, 'utf8');
const FROM = '  if (state._warNoCollide || !state._warRectCells) return null;\n  const C = state._t1330Path;';
const n = VS.split(FROM).length - 1;
const BF = path.join(ROOT, 'server', `_t1330bait-villages-${process.pid}.js`);
let rb = null;
try { fs.writeFileSync(BF, VS.split(FROM).join('  return null;\n  const C = state._t1330Path;')); rb = sub(BF, TB); } finally { try { fs.unlinkSync(BF); } catch (e) {} }
ok(n === 1 && !!rb && Math.min(...rb.ms.slice(-6)) > TICK_MS * N_BUDGET, '④ ★미끼 — 기억을 뺀 사본은 성벽 앞에 선 틱마다 예산 × 배수를 넘는다(빨강 · 같은 물음을 매 틱 끝까지 다시 뒤진다)', rb ? `사본 끝 6틱 ${rb.ms.slice(-6).map((v) => v.toFixed(0)).join(' · ')}ms · 바꾼 자리 ${n}` : '사본 판 없음');
ok(!!rb && rb.dirs.join('|') === r2.dirs.slice(0, TB).join('|'), `③ ★기억 없는 사본과 ${TB}틱 방향이 한 글자 같다 — 기억은 답을 안 바꾼다(손잡이 0 의 근거)`);
console.log(`\n=== T1330 큰 교전 몸 길찾기: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
