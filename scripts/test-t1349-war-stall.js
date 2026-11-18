#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1349-war-stall.js — 긴 판이 멈추던 자리: 강 건너 슬롯을 겨눈 대형 병사가 저마다 25만 꺼냄 물음을 세운다(T1349) ===============
//
// ★왜 [T1331 회부 13 · T1349] 씨 42 짐승 몸 판이 날 372 → 373 창 머리(`_t681Flush` — 그날 전쟁 걸음 몫을 한 콜백에)에서 멎었다(힙 3 GB · 23분).
//   멈춘 프로세스를 검사기로 세워 잰 것: 교전 대형 병사 450 · 저마다 재개형 걸음 물음(T821 · 상한 `ROUTE_MAX_POPS` 25만 꺼냄)이 53개 동시 · 꺼냄 합 280만 ·
//   목표 슬롯은 강 건너 28 ~ 60칸인데 시작 칸과 30만 칸 안에서 안 이어진다 · 못 찾은 목표 기억(T381)은 "그 병사 · 그 칸" 하나라 슬롯이 한 칸 밀리면 다시 판다.
// ★고침(villages `T1349_WAR_PATH_SHARE` · 끔 기본 — 병사가 서는 걸음 수가 바뀐다): 물음을 (시작 16칸 덩이 · 목표 16칸 덩이) 표 하나로 나눠 쓴다 —
//   그 쌍이 그날 못 찾음으로 끝났으면 묻지 않고 못 찾음 · 다른 병사가 묻는 중이면 제 물음을 안 세우고 선다.
//   ★값 같은 손 둘(손잡이 0): 막힌 슬롯의 나선 답(`_warStandNear`)을 막힘 술어 세대 안에서 기억 · 행군로 가장 가까운 점(`_t804Nearest`)을 점열마다 기억.
//
// 장면: 운영 함수 그대로(villages `__p3Bind` · war-live `createWarLive` · battle-core · 존 `_standCellNear` 글자) — 남북으로 끝없는 강(폭 4칸) · 병사 N 이 강 서쪽 한 덩이 ·
//   슬롯은 강 동쪽 한 덩이(걸음마다 세 칸 사이를 번갈아 민다 — 대형 슬롯이 한 칸씩 밀리는 꼴) · 걸음 = 병사마다 `_t804Way` 한 번(운영 걷는 몸의 길 문).
// 지키는 것:
//   ① 상황 assert — 강이 정말 막혔다(곧은 줄 막힘 · 서쪽 칸에서 동쪽 칸으로 4방 칠하기가 안 닿는다) · 병사가 실제로 묻는다
//   ② 나눠 쓰기 — 걸음 S 안에 병사 전부가 못 찾음(행군로로)에 닿는다 · 세운 물음 ≤ 2 · 동시 물음 ≤ 1 · 꺼냄 합 ≤ 상한 × 2 · 힙 늘음 ≤ 120 MB
//   ③ 값 같음 — 나선 답 기억 = 기억 없이 다시 센 답(강가 무작위 4,000점) · 가장 가까운 점 기억 = 바로 센 답
//   ④ ★미끼(이 파일 안) — 손잡이 줄 한 곳을 `false` 로 바꾼 사본(`server/_t1349bait-villages-<pid>.js` · 판 끝에 지움): 세운 물음 ≥ N · 동시 물음 ≥ N 이라 ② 의 둘째 줄이 빨강
// 실행: node scripts/test-t1349-war-stall.js   (아이 판 둘 · 약 1 ~ 2분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const SZ = 32, N = 12, STEPS = 7800, RX = 600, C = 512;   // 강 서쪽 끝 칸 RX · 병사 덩이 y C ~ C+3(16칸 덩이 하나 · 512 = 16 × 32)

function scene(villagesFile) {
  const _l = console.log; console.log = () => {};
  let V; try { V = require(villagesFile); } finally { console.log = _l; }
  const WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js'), PathCore = R('sim/path-core.js');
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const standSrc = /function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZSRC);
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', standSrc[0] + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  const river = (cx) => cx >= RX && cx < RX + 4;
  const deps = { isTerrainBlockedLocal: (px) => river(Math.floor(px / SZ)), isWaterTileLocal: () => false, treeCellBlocked: () => false, standCellNear, anyViewerNear: () => false };
  const world = { day: 372 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [], byDbId: new Map(), byEcon: new Map(), world, db: null,
    warBodies: new Map(), _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 } });
  H.state.warLive = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: () => {}, blockedCell: (cx, cy) => H._warBlockedCell(cx, cy), arrowOut: () => {}, arrowNear: () => false });
  H._warBuildRectIndex(true);
  const out = { knob: typeof H.T1349_WAR_PATH_SHARE === 'function' ? H.T1349_WAR_PATH_SHARE() : null };
  // ① 상황
  { let b = 0; for (let x = RX - 30; x <= RX + 20; x++) if (H._warBlockedCell(x, C + 1)) b++; out.lineBlocked = b >= 4; out.lineCells = b; }
  { const B = (x, y) => H._warBlockedCell(x, y), vis = new Set([(RX - 30) * 65536 + C]), q = [RX - 30, C]; let i = 0, hit = false;
    while (i < q.length && vis.size < 60000) { const x = q[i++], y = q[i++]; if (x === RX + 20 && y === C + 1) { hit = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx * 65536 + ny; if (vis.has(k) || B(nx, ny) || Math.abs(ny - C) > 200 || Math.abs(nx - RX) > 200) continue; vis.add(k); q.push(nx, ny); } }
    out.reach = hit; }
  // ② 걸음
  const U = []; for (let i = 0; i < N; i++) U.push({ x: RX - 30 + (i % 4) + 0.5, y: C + Math.floor(i / 4) + 0.5 });
  const a0 = H._t804Stat.ask, s0 = H._t821Stat.steps;
  if (global.gc) global.gc(); const h0 = process.memoryUsage().heapUsed; let hMax = h0, maxLive = 0, doneAt = -1;
  for (let t = 0; t < STEPS; t++) {
    const ty = C + 1 + (t % 3);   // 슬롯이 세 칸 사이를 번갈아 민다(같은 16칸 덩이)
    let live = 0;
    for (const u of U) { H._t804Way(u, u.x, u.y, RX + 20 + 0.5, ty + 0.5, 0.067, null); if (u._t821s) live++; }
    if (live > maxLive) maxLive = live;
    if (doneAt < 0 && U.every((u) => u._t804f != null && !u._t821s)) doneAt = t;
    if (t % 500 === 0) { const h = process.memoryUsage().heapUsed; if (h > hMax) hMax = h; }
  }
  { const h = process.memoryUsage().heapUsed; if (h > hMax) hMax = h; }
  let pops = 0; for (const u of U) if (u._t821s && u._t821s.S) pops += u._t821s.S.pops | 0;
  out.asks = H._t804Stat.ask - a0; out.pushSteps = H._t821Stat.steps - s0; out.maxLive = maxLive; out.doneAt = doneAt; out.heapMB = +((hMax - h0) / 1048576).toFixed(1);
  out.popsBound = out.asks * PathCore.ROUTE_MAX_POPS; out.livePops = pops; out.share = H._t1349Stat ? Object.assign({}, H._t1349Stat) : null;
  // ③ 값 같음
  if (H._t1349Stand) {
    let rnd = 1234567; const rr = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    const pts = []; for (let i = 0; i < 4000; i++) pts.push([RX - 2 + rr() * 8, C - 50 + rr() * 100]);
    const a = pts.map(([x, y]) => JSON.stringify(H._warStandNear(x, y)));   // 기억을 채운다
    const b = pts.map(([x, y]) => JSON.stringify(H._warStandNear(x, y)));   // 기억에서
    H._t1349Stand.m.clear(); H._t1349Stand.gen = null;
    const c = pts.map(([x, y]) => JSON.stringify(H._warStandNear(x, y)));   // 기억 없이 다시
    out.standSame = a.every((x, i) => x === b[i] && x === c[i]); out.standHit = H._t1349Stand.hit;
  }
  if (H._t804Nearest) {   // 가장 가까운 점 기억 = 바로 센 답(같은 점열 · 같은 물음 되풀이 포함)
    let rnd = 7654321; const rr = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    const pts = []; for (let i = 0; i < 300; i++) pts.push({ x: i * 3 + rr() * 2, y: 40 + Math.sin(i / 9) * 30 });
    for (let i = 0; i < 60; i++) { const cx = Math.floor(rr() * 60) * 15, cy = Math.floor(rr() * 8) * 10, r = 1 + Math.floor(rr() * 6);   // 같은 거리 짝(거울 · 겹침) — 먼저 본 점이 이긴다
      pts.push({ x: cx + r, y: cy }, { x: cx - r, y: cy }, { x: cx, y: cy + r }, { x: cx + r, y: cy }, { x: cx + r * (1 + 1e-12), y: cy }); }
    let same = 0, all = 0;
    for (let i = 0; i < 6000; i++) { const x = Math.floor(rr() * 60) * 15, y = Math.floor(rr() * 8) * 10;
      let b = 0, bd = Infinity; for (let j = 0; j < pts.length; j++) { const d = Math.hypot(pts[j].x - x, pts[j].y - y); if (d < bd) { bd = d; b = j; } }
      all++; if (H._t804Nearest(pts, x, y) === b) same++; }
    out.nearSame = same === all; out.nearN = all;
  }
  {   // 대형 몸 밀어내기(war-live `_muSeparate`) = 종전 n² 글자(아래 OLD — 고치기 전 글자 그대로) · 몸 수 2 ~ 400 · 뭉침 · 겹침 · NaN · 아주 먼 자리
    const WL = H.state.warLive, MU = WL.MU;
    const OLD = (g, dDays, budget) => { const us = g.units, n = us.length; if (n < 2) return;
      const R = MU.SEP_R, R2 = R * R, str = MU.SEP_STR * dDays; const px = new Float64Array(n), py = new Float64Array(n);
      for (let i = 0; i < n; i++) { const a = us[i]; let sx = 0, sy = 0, cnt = 0;
        for (let j = 0; j < n; j++) { if (j === i) continue; const b = us[j]; const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 1e-6) { const dv = Math.sqrt(d2); sx += dx / dv; sy += dy / dv; cnt++; } }
        if (cnt) { px[i] = sx / cnt; py[i] = sy / cnt; } }
      for (let i = 0; i < n; i++) { const a = us[i]; if (a.cmd) continue; if (px[i] || py[i]) { const d = Math.hypot(px[i] * str, py[i] * str), cap = budget ? budget[i] : d, mul = d > 0 ? Math.min(1, cap / d) : 0; const nx2 = a.x + px[i] * str * mul, ny2 = a.y + py[i] * str * mul; if (!(H._warBlockedCell(nx2, ny2))) { a.x = nx2; a.y = ny2; } } } };
    let rnd = 99991; const rr = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    let same = 0, all = 0, grid = 0;
    for (let k = 0; k < 160; k++) {
      const n = k < 10 ? 2 + k : 40 + Math.floor(rr() * 360), sp = [0.3, 1, 3, 10, 40][k % 5], ox = RX - 60 + rr() * 30, oy = C + rr() * 50;
      const mk = () => { const us = []; let r2 = rnd; for (let i = 0; i < n; i++) { let x = ox + rr() * sp, y = oy + rr() * sp; if (i % 7 === 3) { x = ox + Math.round(rr() * 4) * 0.45; y = oy; }
        if (k % 31 === 7 && i === 5) x = NaN; if (k % 37 === 11 && i === 9) { x = 1e12; y = 1e12; } us.push({ x, y, cmd: i === 0 }); } return us; };
      const r0 = rnd; const A = mk(); rnd = r0; const Bu = mk();
      const bud = k % 3 === 0 ? A.map(() => rr() * 0.2) : null;
      OLD({ units: A }, 0.067, bud); WL._muSeparate({ units: Bu }, 0.067, bud);
      all++; if (n >= 48) grid++;
      if (A.every((u, i) => Object.is(u.x, Bu[i].x) && Object.is(u.y, Bu[i].y))) same++;
    }
    out.sepSame = same === all; out.sepN = all; out.sepGrid = grid;
  }
  return out;
}
if (process.env.__T1349_SUB) {
  const r = scene(process.env.__T1349_SUB);
  fs.writeSync(1, '@@T1349 ' + JSON.stringify(r) + '\n');
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (file) => {
  let out = '';
  try { out = execFileSync(process.execPath, ['--expose-gc', __filename], { env: Object.assign({}, process.env, { __T1349_SUB: file, T1349_WAR_PATH_SHARE: '1' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { out = String((e && e.stdout) || ''); }
  const m = /@@T1349 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
};
console.log(`\n=== T1349 긴 판 멈춤 — 강 건너 슬롯 · 병사 ${N} · 걸음 ${STEPS} · 미끼 ===`);
const VFILE = path.join(ROOT, 'server', 'villages.js');
const r = sub(VFILE);
ok(!!r && r.lineBlocked === true && r.reach === false && r.asks >= 1, '① 상황 assert — 곧은 줄 막힘 · 강 건너 4방 칠하기 안 닿음 · 병사가 실제로 묻는다', r ? `곧은 줄 막힘 ${r.lineBlocked} · 닿음 ${r.reach} · 물음 ${r.asks}` : '아이 판 없음');
ok(!!r && r.doneAt >= 0, `② 걸음 ${STEPS} 안에 병사 ${N} 전부가 못 찾음(행군로로)에 닿는다`, r ? `닿은 걸음 ${r.doneAt}` : '');
ok(!!r && r.asks <= 2 && r.maxLive <= 1, '② 세운 물음 ≤ 2 · 동시 물음 ≤ 1(덩이 쌍 표)', r ? `물음 ${r.asks} · 동시 ${r.maxLive} · 표 ${JSON.stringify(r.share)}` : '');
ok(!!r && r.pushSteps <= 2 * 250000 / 32 + STEPS && r.heapMB <= 120, '② 재개 걸음 합 ≤ (상한 × 2 / 걸음 몫) + 걸음 수 · 힙 늘음 ≤ 120 MB', r ? `재개 걸음 ${r.pushSteps} · 힙 늘음 ${r.heapMB} MB` : '');
ok(!!r && r.standSame === true && r.standHit > 0, '③ 값 같음 — 나선 답 기억 = 기억 없이 다시 센 답(4,000점)', r ? `같음 ${r.standSame} · 기억 맞음 ${r.standHit}` : '');
ok(!!r && r.sepSame === true && r.sepGrid >= 100, '③ 값 같음 — 대형 몸 밀어내기(격자 이웃) = 종전 n² 글자(무리 160 · 격자 길 100 넘음 · NaN · 아주 먼 자리)', r ? `같음 ${r.sepSame} · ${r.sepN} 무리(격자 ${r.sepGrid})` : '');
ok(!!r && r.nearSame === true, '③ 값 같음 — 행군로 가장 가까운 점 기억 = 바로 센 답(6,000 물음 · 되풀이 포함)', r ? `같음 ${r.nearSame} · ${r.nearN}` : '');
// ④ 미끼 — 손잡이 줄 한 곳
const VS = fs.readFileSync(VFILE, 'utf8');
const FROM = "const T1349_WAR_PATH_SHARE = process.env.T1349_WAR_PATH_SHARE === '1';";
const n = VS.split(FROM).length - 1;
const BF = path.join(ROOT, 'server', `_t1349bait-villages-${process.pid}.js`);
let rb = null;
try { fs.writeFileSync(BF, VS.split(FROM).join('const T1349_WAR_PATH_SHARE = false;')); rb = sub(BF); } finally { try { fs.unlinkSync(BF); } catch (e) {} }
ok(n === 1 && !!rb && rb.lineBlocked === true && rb.asks >= N && rb.maxLive >= N && !(rb.asks <= 2 && rb.maxLive <= 1), `④ ★미끼 — 손잡이 줄 한 곳(${n}곳)을 끈 사본은 병사마다 물음을 세워 ② 의 "세운 물음 ≤ 2 · 동시 ≤ 1" 줄이 빨강`, rb ? `사본 물음 ${rb.asks} · 재개 걸음 ${rb.pushSteps} · 동시 ${rb.maxLive} · 힙 늘음 ${rb.heapMB} MB · 닿은 걸음 ${rb.doneAt}` : '사본 판 없음');
console.log(`\n=== T1349 긴 판 멈춤: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
