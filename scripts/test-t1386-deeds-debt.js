#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1386-deeds-debt.js — 사유지는 통째로 풀리지 않는다: 바닥난 뒤 빚 100점마다 집에서 먼 칸 하나(★T1386 · 재민 11-19 · 족보 879) ==========
//
// ★지키는 것(카드 ⑤ 순서)
//   ⓐ 100칸 가득 · 안 들어오면 D(100) = 2.4일 뒤 + 빚 100점 = 첫 칸 · 그 뒤 35분 남짓마다 한 칸(칸이 줄면 느려진다 — 식 그대로) · 3일째에도 82칸(통째로 0 아님)
//   ⓑ 한 칸 풀린 직후 다음 칸까지 = 100 ÷ (바닥난 몫/일)(D(N−1) 이 아니다) · 막혀 쌓인 빚은 풀릴 때 자투리를 이어 간다(다음 칸까지 (100 − 자투리) ÷ 속도)
//   ⓒ 집 청크만 돌본 사람 — 집 청크 칸 0 풀림 · 풀린 칸은 집에서 먼 차례(존 정본 경로 · 선포 · 돌봄 · 셈)
//   ⓓ 풀려서 땅이 갈라지는 칸은 건너뛴다(목 칸) · 땅은 한 덩이 그대로
//   ⓔ 자투리 빚 60 에서 30점 벌면 빚 30(저축 0) · 100점 벌면 빚 0 · 저축 40
//   ⓕ 서버가 꺼졌다 켠 판(DB 에서 다시 싣고 이어 셈) = 안 꺼진 판(남은 칸 · 빚 · 청크 저축)
//   ★미끼 둘(이 파일 안 · `server/deeds.js` 사본을 /tmp 에 쓰고 같은 아이 검사로 띄운다 · 판 끝에 지운다):
//     ① 칸 풀 때 빚을 0 으로 만드는 사본(자투리 버림) → ⓑ 빨강 · ② 풀린 뒤 그 청크 저축을 가득 채우는 사본(다시 세기) → ⓐ 빨강
// ★시각은 주입(존 `_t1332SetClock` · 셈 함수에 넘기는 수) — 박힌 날짜 0. 아이 판은 지금 시각에서 1,000일 뒤를 판의 0 으로 둔다
//   (부팅 셈은 벽시계로 돈다 — 판의 0 이 그보다 뒤라 부팅 셈은 아무것도 안 바꾼다 · ⓕ 가 그 길을 탄다).
//
// 실행: node scripts/test-t1386-deeds-debt.js   (아이 판 여섯 · 약 30초)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1386_MODE || '';
const DAYMS = 24 * 60 * 60 * 1000;

// ──────────────────────────── 아이 ① 셈만(deeds.js — 정본 또는 미끼 사본) ────────────────────────────
if (MODE === 'deeds') {
  process.env.T1305_DEEDS = '1'; process.env.T1402_SPLIT_OK = '0';   // ★[T1428] 이 판은 ㉠(목은 건너뜀)을 잰다 — 갈라짐(-on 켬 기본 후보)은 글자로 끈다
  const D = require(process.env.__T1386_DEEDS || path.join(ROOT, 'server', 'deeds.js'));
  const comps = require(path.join(ROOT, 'server', 'claims.js')).components;
  const F = D.CFG, PT = F.PT, DAY = F.DAY_MS, R = {};
  const put = (k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 200); };
  const land = (list, home) => {   // list = [[x, y], …] · 가득 · 셈 시각 0
    const P = { chunks: [], cells: [], home, debt: 0, t: 0, others: 0 }, by = new Map();
    for (const [x, y] of list) { const [cx, cy] = D.chunkOf(x, y), key = cx + ',' + cy; if (!by.has(key)) { const c = { key, n: 0, m: 0, t: 0 }; by.set(key, c); P.chunks.push(c); } by.get(key).n++; P.cells.push({ id: x + ',' + y, x, y, key }); }
    for (const c of P.chunks) c.m = D.capOf(c.n);
    return P;
  };
  const block = (w, h) => { const o = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push([x, y]); return o; };
  try {
    // ⓐ 100칸 가득 — 첫 칸 · 그 뒤 칸마다 시각(식: 바닥 D(100) · 빚 100점 ÷ 하루 N³ ÷ 240)
    const A = land(block(10, 10), '0,0'), hits = [];
    D.advance(A, 365 * DAY, comps, (cell, at) => hits.push([cell.id, at / DAY]));
    const want = []; let t = D.daysOf(100); for (let k = 0; k < 6; k++) { const N = 100 - k; t += PT / D.dailyNeed(N); want.push(t); }
    const got = hits.slice(0, 6).map((h) => h[1]);
    const gaps = got.slice(1).map((v, i) => (v - got[i]) * 1440);
    put('a_first', Math.abs(got[0] - want[0]) < 1e-6 && Math.abs(want[0] - (2.4 + 100 / (1e6 / 240))) < 1e-9, `첫 칸 ${got[0].toFixed(5)}일(식 ${want[0].toFixed(5)} = 2.4일 + ${(100 / (1e6 / 240) * 1440).toFixed(1)}분)`);
    put('a_each', got.every((v, i) => Math.abs(v - want[i]) < 1e-6) && gaps[0] > 34 && gaps[0] < 37 && gaps.every((g, i) => i === 0 || g > gaps[i - 1]), `칸 사이 ${gaps.map((g) => g.toFixed(1)).join(' · ')}분(식 그대로)`);
    const A3 = land(block(10, 10), '0,0'); D.advance(A3, 3 * DAY, comps);
    put('a_notAll', A3.cells.length === 82, `3일째 ${A3.cells.length}칸(통째로 0 아님 · PM 표 82)`);
    // ⓑ ① 다음 칸까지 = 100 ÷ (바닥난 몫/일) — D(99) 가 아니다
    const gap1 = got[1] - got[0];
    put('b_gap', Math.abs(gap1 - PT / D.dailyNeed(99)) < 1e-9 && gap1 < D.daysOf(99) / 10, `${(gap1 * 1440).toFixed(2)}분 = 100 ÷ ${D.dailyNeed(99).toFixed(1)}점/일(D(99) = ${D.daysOf(99).toFixed(2)}일 아님)`);
    // ⓑ ② 막혀 쌓인 빚 — 집 청크(고리 있는 6칸) · 복도 청크(목 4칸) · 끝 청크 2칸. 날 140 에 집 · 끝 청크를 가득으로(빚 0 일 때) → 복도만 먼저 바닥(모든 칸이 목 = 막힘) ·
    //   집 · 끝 청크가 바닥나는 순간 끝 칸부터 쌓인 빚만큼 한꺼번에 풀리고 자투리를 이어 간다
    const B = land([[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0]], '0,0');
    D.advance(B, 140 * DAY, comps);
    for (const c of B.chunks) if (c.key !== '1,0') D.addPts(B, c, 1e9);
    const N12 = B.cells.length, tB = D.daysOf(N12), tAC = 140 + D.daysOf(N12);
    const hitB = []; D.advance(B, tAC * DAY - 1, comps, (cell, at) => hitB.push(cell.id));
    const debtS = B.debt, stuckOk = hitB.length === 0 && debtS > 2 * PT;
    const hitU = []; D.advance(B, tAC * DAY + 1, comps, (cell, at) => hitU.push([cell.id, at / DAY]));
    const nBurst = Math.floor(debtS / PT), left = debtS - nBurst * PT;   // 끝 청크 2칸 · 복도 끝이 차례로 잎이 된다 — 후보는 넉넉하다
    const debtU = B.debt, burstOk = hitU.length === nBurst && Math.abs(debtU - left) < 1e-3;
    const N2 = B.cells.length, R2 = D.dailyNeed(N2), hitN = [];
    D.advance(B, (tAC + 2 * PT / R2) * DAY, comps, (cell, at) => hitN.push(at / DAY));
    const nextOk = hitN.length >= 1 && Math.abs(hitN[0] - (tAC + (PT - left) / R2)) < 1e-6;
    put('b_carry', stuckOk && burstOk && nextOk, `복도만 바닥 ${(tAC - tB).toFixed(1)}일 막힘 · 쌓인 빚 ${debtS.toFixed(1)} → 한꺼번에 ${hitU.length}칸(식 ${nBurst}) · 자투리 ${debtU.toFixed(1)}(식 ${left.toFixed(1)}) · 다음 칸 ${hitN.length ? (hitN[0] - tAC).toFixed(3) : '없음'}일(식 ${((PT - left) / R2).toFixed(3)})`);
    // ⓔ 자투리 60 → 30점 = 빚 30 · 저축 0 / 100점 = 빚 0 · 저축 40
    const E1 = { debt: 60 }, c1 = { n: 4, m: 0 }; const r1 = D.addPts(E1, c1, 30);
    const E2 = { debt: 60 }, c2 = { n: 4, m: 0 }; const r2 = D.addPts(E2, c2, 100);
    put('e_tail', E1.debt === 30 && c1.m === 0 && r1.paid === 30 && E2.debt === 0 && c2.m === 40 && r2.saved === 40, `60 + 30점 → 빚 ${E1.debt} · 저축 ${c1.m} / 60 + 100점 → 빚 ${E2.debt} · 저축 ${c2.m}`);
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1386 ' + JSON.stringify(R));
  process.exit(0);
}

// ──────────────────────────── 아이 ② 존(정본 경로 · 켬) ────────────────────────────
if (MODE.startsWith('zone')) {
  process.env.ZONE_ID = 'hanbando';
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.CLAIM_ABSENCE = '0'; process.env.T1305_DEEDS = '1'; process.env.T1305_CARE_S = '1'; process.env.T1402_SPLIT_OK = '0'; process.env.T1392_FIRST_LOT = '0';   // ★[T1428] -on 켬 기본 후보 둘은 글자로 끈다
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const H = Zone.__testBind();
  const { claims, players, BUILDING_SIZE: SZ, db } = H, D = H.Deeds, F = D.CFG, PT = F.PT, DM = F.DAY_MS;
  const T0 = +process.env.__T1386_T0;
  let T = T0; H._t1332SetClock(() => T);
  const at = (days) => { T = T0 + days * DM; return T; };
  const R = {};
  const put = (k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 200); };
  const mk = (name) => { const ws = { readyState: 1, send: () => {} }; const p = { pid: 'p_' + name, playerId: 't1386_' + name, name, persistent: false, ws, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 999, stone: 999 }, equipment: [], equipSlots: {}, craftSkill: {} }; players.set(p.pid, p); return p; };
  const claimAt = (p, cx, cy) => { p.x = cx * SZ + SZ / 2; p.y = cy * SZ + SZ / 2; H.tryClaim(p, 'personal'); };
  const live = (pid) => [...claims.values()].filter((c) => c.ownerPid === pid && c.kind === 'personal' && (c.state || 'active') !== 'free').map((c) => Math.floor(c.x / SZ) + ',' + Math.floor(c.y / SZ)).sort();
  const care = (p, cx, cy, pts) => H._t1332Use(p, cx * SZ + SZ / 2, cy * SZ + SZ / 2, 'test', pts);
  const comps = (cells) => H.Claims.components(new Set(cells));
  try {
    if (MODE === 'zone') {
      put('on', D.ON === true && typeof H._t1386Build === 'function' && H.deedDebt instanceof Map);
      // ⓒ 집 청크만 돌본 사람 — 8×5(집 = 처음 선포한 칸 · 그 청크 16칸) · 날마다 집 칸에서 50점(1분 남짓)
      const X0 = 40000, Y0 = 40000, c = mk('home');
      for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) claimAt(c, X0 + x, Y0 + y);
      const n0 = live(c.playerId).length; players.delete(c.pid);
      const homeChunk = D.chunkOf(X0, Y0).join(',');
      const order = []; for (const [id, cl] of claims) if (cl.ownerPid === c.playerId) order.push(cl);
      for (let d = 1; d <= 40; d++) { at(d); H._t1343Advance(c.playerId, T); care(c, X0, Y0, 50); }
      const left = live(c.playerId), gone = order.map((cl) => Math.floor(cl.x / SZ) + ',' + Math.floor(cl.y / SZ)).filter((k) => !left.includes(k));
      const inHome = gone.filter((k) => { const [x, y] = k.split(',').map(Number); return D.chunkOf(x, y).join(',') === homeChunk; });
      // 기대 차례 — 이 판이 따로 센 집에서의 걸음(블록이라 곧 맨해튼) · 같으면 직선 거리 · 그다음 좌표
      const rest = order.map((cl) => [Math.floor(cl.x / SZ) - X0, Math.floor(cl.y / SZ) - Y0]).filter(([x, y]) => D.chunkOf(X0 + x, Y0 + y).join(',') !== homeChunk);
      rest.sort((a, b) => ((b[0] + b[1]) - (a[0] + a[1])) || (Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1])) || (a[0] - b[0]) || (a[1] - b[1]));
      const wantGone = rest.slice(0, gone.length).map(([x, y]) => (X0 + x) + ',' + (Y0 + y)).sort();
      put('c_homeChunk', n0 === 40 && gone.length >= 5 && inHome.length === 0 && left.includes(X0 + ',' + Y0), `40일 · 풀린 칸 ${gone.length} · 집 청크에서 ${inHome.length} · 집 ${left.includes(X0 + ',' + Y0) ? '그대로' : '풀림'}`);
      put('c_farFirst', JSON.stringify(gone.slice().sort()) === JSON.stringify(wantGone), `풀린 칸 = 집에서 먼 ${gone.length}칸(${wantGone.slice(0, 4).join(' ')} …)`);
      // ⓓ 목 칸 건너뛰기 — 집 청크(고리 있는 6칸) · 복도 청크(목 4칸 + 곁가지 한 칸) · 끝 청크 4칸 · 날 60 에 끝 청크를 가득으로
      const X1 = 41000, Y1 = 41000, s = mk('split'), s0 = (T - T0) / DM;   // 이 땅의 0 = 지금(ⓒ 가 민 시계 뒤)
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0]]) claimAt(s, X1 + x, Y1 + y);
      const nS = live(s.playerId).length; players.delete(s.pid);
      at(s0 + 60); H._t1343Advance(s.playerId, T); care(s, X1 + 9, Y1, 1e9);
      const D15 = D.daysOf(15), first = D15 + D15 / 11, second = first + D.daysOf(14) / 10;
      at(s0 + first - 0.01); H._t1343Advance(s.playerId, T); const l0 = live(s.playerId);
      at(s0 + first + 0.01); H._t1343Advance(s.playerId, T); const l1 = live(s.playerId);
      at(s0 + second + 0.01); H._t1343Advance(s.playerId, T); const l2 = live(s.playerId);
      const K = (x, y) => (X1 + x) + ',' + (Y1 + y);
      put('d_skipNeck', nS === 15 && l0.length === 15 && !l1.includes(K(5, 1)) && l1.includes(K(6, 0)) && l1.includes(K(7, 0)) && l1.length === 14 && !l2.includes(K(1, 1)) && l2.includes(K(0, 0)) && l2.length === 13,
        `첫 칸 ${first.toFixed(1)}일: 곁가지 (5,1) ${l1.includes(K(5, 1)) ? '남음' : '풀림'} · 더 먼 목 (7,0) · (6,0) ${l1.includes(K(7, 0)) && l1.includes(K(6, 0)) ? '남음' : '풀림'} / 둘째 ${second.toFixed(1)}일: 고리 칸 (1,1) ${l2.includes(K(1, 1)) ? '남음' : '풀림'}`);
      put('d_oneLand', comps(l1) === 1 && comps(l2) === 1, `덩이 ${comps(l1)} · ${comps(l2)}`);
    } else {
      // ⓕ 서버가 꺼졌다 켠 판 — 10×10 · 안 들어옴. 'zone-once' = 3.1일까지 한 번에 · 'zone-a' = 2.7일까지 셈하고 끝(DB 만 남김) · 'zone-b' = 그 DB 로 부팅 · 3.1일까지
      const X2 = 42000, Y2 = 42000;
      if (MODE !== 'zone-b') { const f = mk('restart'); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) claimAt(f, X2 + x, Y2 + y); players.delete(f.pid); }
      const pid = 't1386_restart';
      at(MODE === 'zone-a' ? 2.7 : 3.1); H._t1343Advance(pid, T);
      const rec = H.deedDebt.get(pid) || {}, rows = [...H.deedChunks.values()].filter((r) => r.pid === pid).map((r) => [r.cx, r.cy, +r.m.toFixed(6), r.t]).sort();
      R.state = { live: live(pid), debt: +(+rec.debt || 0).toFixed(6), rows };
    }
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1386 ' + JSON.stringify(R));
  if (MODE !== 'zone-a') for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ──────────────────────────── 부모 ────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const T0 = Math.floor(Date.now() / DAYMS) * DAYMS + 1000 * DAYMS;   // 판의 0 = 지금에서 1,000일 뒤(부팅 벽시계 셈이 판을 안 건드린다)
const run = (mode, env) => {
  let out = '';
  try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1386_MODE: mode, __T1386_T0: String(T0), PORT: String(require('./lib-port').port(37600)) }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { out = String((e && e.stdout) || ''); }
  const m = /@@T1386 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
};
const show = (R, k, msg) => ok(!!R && R[k] === true, msg, R ? (R[k + '#'] || R.err || '') : '아이 판 없음');
console.log('\n=== T1386 사유지 빚 — 통째로 풀리지 않는다(바닥난 뒤 빚 100점마다 집에서 먼 칸 하나 · 다시 세지 않는다) ===');
const RD = run('deeds');
show(RD, 'a_first', 'ⓐ 100칸 가득 · 안 들어오면 첫 칸 = 바닥(2.4일) + 빚 100점(35분 남짓)');
show(RD, 'a_each', 'ⓐ 그 뒤 한 칸 35분 남짓 · 칸이 줄면 칸 사이가 길어진다(하루 N³ ÷ 240 · 식 그대로)');
show(RD, 'a_notAll', 'ⓐ 3일째에도 82칸 — 통째로 0 아님');
show(RD, 'b_gap', 'ⓑ 한 칸 풀린 직후 다음 칸까지 = 100 ÷ (바닥난 몫/일) — D(N−1) 이 아니다');
show(RD, 'b_carry', 'ⓑ 막혀 쌓인 빚은 풀릴 때 쌓인 만큼 한꺼번에 · 자투리를 이어 간다(다음 칸까지 (100 − 자투리) ÷ 속도)');
show(RD, 'e_tail', 'ⓔ 자투리 빚 60 + 30점 = 빚 30 · 저축 0 / + 100점 = 빚 0 · 저축 40');
const RZ = run('zone', { DB_PATH: `/tmp/test-t1386-${process.pid}-z.db` });
ok(!!RZ && RZ.on, '상황 assert — 켬 아이 판이 존 정본(빚 셈 · 집 · 빚 표)을 쥐고 돌았다', RZ ? (RZ.err || '') : '아이 판 없음');
show(RZ, 'c_homeChunk', 'ⓒ 집 청크만 돌본 사람(하루 50점) — 40일 동안 집 청크 칸 0 풀림 · 집 그대로');
show(RZ, 'c_farFirst', 'ⓒ 풀린 칸은 집에서 먼 차례 그대로(걸음 · 직선 · 좌표)');
show(RZ, 'd_skipNeck', 'ⓓ 더 먼 칸이 목이면 건너뛰고 곁가지부터 · 다음은 고리 칸 — 집은 그대로');
show(RZ, 'd_oneLand', 'ⓓ 풀린 뒤에도 땅은 한 덩이');
const dbR = `/tmp/test-t1386-${process.pid}-r.db`;
const once = run('zone-once', { DB_PATH: `/tmp/test-t1386-${process.pid}-o.db` });
const ra = run('zone-a', { DB_PATH: dbR }), rb = run('zone-b', { DB_PATH: dbR });
const so = once && once.state, sb = rb && rb.state, sa = ra && ra.state;
ok(!!so && !!sb && !!sa && sa.live.length > so.live.length && so.live.length < 100 && so.live.length > 0 && JSON.stringify(so.live) === JSON.stringify(sb.live) && Math.abs(so.debt - sb.debt) < 1e-3 && JSON.stringify(so.rows.map((r) => [r[0], r[1], r[2].toFixed(3)])) === JSON.stringify(sb.rows.map((r) => [r[0], r[1], r[2].toFixed(3)])),
  'ⓕ 서버가 꺼졌다 켠 판(2.7일에 끄고 DB 로 다시 부팅 · 3.1일까지) = 안 꺼진 판 — 남은 칸 · 빚 · 청크 저축',
  so && sb && sa ? `끈 때 ${sa.live.length}칸 · 한 번에 ${so.live.length}칸 빚 ${so.debt.toFixed(2)} / 껐다 켬 ${sb.live.length}칸 빚 ${sb.debt.toFixed(2)}` : `${once && once.err || ''} ${ra && ra.err || ''} ${rb && rb.err || ''}`);
// ★미끼 — deeds.js 사본(정본 무접촉 · /tmp · 판 끝에 지운다)
const DS = fs.readFileSync(path.join(ROOT, 'server', 'deeds.js'), 'utf8');
const bait = (tag, from, to) => {   // 사본 하나를 쓰고 같은 아이 검사(셈만)로 띄운다 — 반환 [바꾼 자리 수, 결과]
  const n = DS.split(from).length - 1, f = `/tmp/t1386bait-${tag}-${process.pid}.js`;
  let RB = null;
  try { fs.writeFileSync(f, DS.split(from).join(to)); RB = run('deeds', { __T1386_DEEDS: f }); } finally { try { fs.unlinkSync(f); } catch (e) {} }
  return [n, RB];
};
const kv = (RB, ks) => ks.map((k) => `${k}=${RB ? RB[k] : '?'}`).join(' ');
{
  const [n, RB] = bait('tail', '    P.debt = Math.max(0, P.debt - PT); freed++;', '    P.debt = 0; freed++;');
  ok(n === 1 && !!RB && RB.b_carry === false && RB.a_first === true && RB.a_each === true && RB.e_tail === true,
    '★미끼 ① — 칸 풀 때 빚을 0 으로 만드는 사본(자투리 버림) → ⓑ b_carry 빨강(a_first · a_each · e_tail 초록 그대로)', `바꾼 자리 ${n} · ${kv(RB, ['b_carry', 'a_first', 'a_each', 'e_tail'])}`);
}
{
  const [n, RB] = bait('recount', '    ch.n--; ch.m = Math.min(ch.m, capOf(ch.n));', '    ch.n--; ch.m = capOf(ch.n);');
  ok(n === 1 && !!RB && RB.a_each === false && RB.a_first === true && RB.e_tail === true,
    '★미끼 ② — 풀린 뒤 그 청크 저축을 가득 채우는 사본(다시 세기) → ⓐ a_each 빨강(a_first · e_tail 초록 그대로)', `바꾼 자리 ${n} · ${kv(RB, ['a_each', 'a_first', 'e_tail'])}`);
}
for (const f of [dbR, dbR + '-wal', dbR + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
console.log(`\n=== T1386 사유지 빚: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
