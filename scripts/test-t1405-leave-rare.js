#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1405-leave-rare.js — T1405 떠나는 주민을 드물게(손잡이 둘 · 끔 기본 · 새 수 0) ===
//   재민 11-20: "애초에 이탈하는 주민이 거의 없어야 해.. 왜 이탈하는 거야..?" · 11-07: "0.25 밑은 정말 드물게".
//   ㉡ `T1405_BIRTH` — 출생이 행복을 읽는 곡선: h 가 0.5(행복 항의 중립)에서 0.25(이탈 문턱)로 내려가는 동안 자연사 채움을 뺀 성장 몫이 1 → 0 — 0.25 에 닿기 전에 출생 = 자연사.
//   ㉠ `T1405_RECV` — 받는 쪽 문: 한 사람 받으면 제 행복이 0.25 밑으로 가는 마을은 안 받는다(있는 부담 식 · `t1205NeedOut` 그 셈 · 들은 줄 길은 들은 행복 − 부담 차).
//   ① 손잡이 — 빈 값 = 끔 · `'1'` = 켬(둘 다)
//   ② 출생 곡선(정본 `t1405BirthCap`) — 성장 8 · 자연사 채움 2: h 0.5 → 10(다) · 0.375 → 6(반) · 0.25 → 2(채움만) · 0.1 → 2 · 성장 몫 ≤ 0 이면 그대로 · 채움이 더 크면 그 몫까지 /
//      곡선이 읽는 붐빔 행복(정본 `t1405BirthH` = S − B + max(0, E)) — S 0.3 · B 0.05 · E 0.8 → 1.05(굶주림 기억은 뺀다) · S 0.9 · B 0.6 · E −0.1 → 0.3(좋은 일은 안 뺀다)
//   ③ 받는 쪽 문(정본 `t1405RecvOk`) — S 0.8 · 영토 2,500칸(부담 식 그대로 · 0.25 에 닿는 가장 큰 인구 95.7명):
//      인구 94 → 받는다(95 명이어도 0.25 위) · 95 → 안 받는다(96 명이면 0.25 밑) · S 0.24(이미 0.25 밑) → 안 받는다 /
//      들은 줄 길 — 들은 행복 0.30 · 들은 인구 90 → 받는다 · 0.26 → 안 받는다 · 0.28 + 무리 셋 → 안 받는다
//   ④ econ 하루(정본 `tickVillage` · 날은 게임 달력 `dayOf`) — 땅 400(영토 10,000칸) · 사람 120 · 느린 S 0.75 → h ≈ 0.32 · 주거 · K 넉넉:
//      끔 = 출생이 자연사 채움보다 많다(사람이 는다 — 켬 줄의 전제) · 켬 = 출생 = 채움 + 성장 × (h − 0.25) ÷ 0.25(그 하루의 h 로) · 끔보다 적다 /
//      사람 150(h < 0.25): 켬 = 출생 = 자연사 채움만 /
//      굶은 작은 마을(사람 30 · 느린 S 0.3 · 겪은 일 E 0.9 — 붐빔 0 에 가깝다 · h < 0.5): 켬 = 끔 그대로(곡선이 굶주림 기억을 안 읽는다 — h 를 읽으면 출생이 채움으로 묶인다)
//   ⑤ 서버 받는 곳 고르기(정본 `villages._t1147Pick` · 존을 한 번 띄워 부른다 — 손잡이 켬 env 로 띄우고 끔 길은 그 아이 안에서 econ 손잡이 칸을 내려 부른다 ·
//      villages 는 같은 econ 객체의 칸을 그 자리에서 읽는다 — `t1405Stat().recv` 가 내린 값을 그대로 비추는지 먼저 본다) — 떠나는 마을 h 0.2 · 둘레 0.7(받으면 0.25 밑) · 0.6(넉넉):
//      끔 = 0.7 을 고른다(종전) · 막은 수 칸 0 · 켬 = 0.7 을 건너뛰고 0.6 · 막은 수 칸 ≥ 1
//   ★미끼 셋(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ ㉡ 출생 줄을 뺀 econ 사본 → ④ "켬 — 출생 = 채움 + 성장 × 몫" 이 빨강
//     ⓑ 받는 쪽 문이 늘 받는 econ 사본(`t1405RecvOk` 끔 세계 길 한 줄) → ③ "인구 95 → 안 받는다" 가 빨강
//     ⓒ 곡선이 h 를 그대로 읽는 econ 사본(첫 판 꼴 — 붐빔 행복 자리 한 곳) → ④ "굶은 작은 마을 — 켬 = 끔 그대로" 가 빨강
//   날짜 · 벽시계 0 — 날은 게임 달력(`dayOf`)으로만 고른다 · 존 DB 는 `lib-tmp` 로.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const BAIT = {
  birth: ["      if (T1405_BIRTH && T1205_HAPPY && _oth > 0) dP = Math.min(dP, t1405BirthCap(t1405BirthH(stats.happinessSlow, stats.happinessBurden, v._t1134E), _oth, T1206_NAT_DEATH ? (v._natExp || 0) : 0));", ''],
  recv: ['  return t1205NeedOut(v, v.npcs.length + a, T) === 0;', '  return true;'],
  birthH: ['t1405BirthCap(t1405BirthH(stats.happinessSlow, stats.happinessBurden, v._t1134E), _oth,', 't1405BirthCap(stats.happiness, _oth,'],
};

// ── 아이(econ) — 손잡이 env 는 어버이가 준다 · BAIT 면 econ 원문 한 곳을 바꿔 컴파일 ──
if (process.argv[2] === '--child') {
  const out = { bait: null };
  const B = BAIT[process.env.T1405_TEST_BAIT];
  if (B) {
    const orig = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== F_E) return orig(m, filename);
      let src = fs.readFileSync(filename, 'utf8');
      const n = src.split(B[0]).length - 1;
      out.bait = n;
      if (n === 1) src = src.replace(B[0], B[1]);
      m._compile(src, filename);
    };
  }
  const C = require(path.join(ROOT, 'server', 'calendar'));
  const E = require(F_E);
  out.on = { birth: E.T1405_BIRTH, recv: E.T1405_RECV, happy: E.T1205_HAPPY };
  // ② 출생 곡선
  out.cap = [E.t1405BirthCap(0.5, 10, 2), E.t1405BirthCap(0.375, 10, 2), E.t1405BirthCap(0.25, 10, 2), E.t1405BirthCap(0.1, 10, 2), E.t1405BirthCap(0.4, -3, 2), E.t1405BirthCap(0.3, 1.5, 2)];
  out.bh = typeof E.t1405BirthH === 'function' ? [E.t1405BirthH(0.3, 0.05, 0.8), E.t1405BirthH(0.9, 0.6, -0.1)] : null;
  // ③ 받는 쪽 문
  const vv = (S, N, T) => ({ _t1205S: S, npcs: new Array(N).fill(0).map((_, i) => ({ id: 'x' + i })), lastStats: { terrCells: T }, land: { size: T / 25, baseSize: 1 } });
  out.recv = { n94: E.t1405RecvOk(vv(0.8, 94, 2500), 1), n95: E.t1405RecvOk(vv(0.8, 95, 2500), 1), s24: E.t1405RecvOk(vv(0.24, 10, 2500), 1),
    h30: E.t1405RecvOk(vv(0.8, 90, 2500), 1, 0.30, 90), h26: E.t1405RecvOk(vv(0.8, 90, 2500), 1, 0.26, 90), h28herd: E.t1405RecvOk(vv(0.8, 90, 2500), 3, 0.28, 90) };
  // ④ econ 하루
  const mk = (size, pop, S, Ev) => {
    E.setSeed(11);
    const v = E.createVillage({ name: '시험', initialPop: pop, fertility: 0.8, water: 0.3, game: 0.3, wood: 1, ore: 0, stone: 1, size });
    for (const r in v.storage) if (typeof v.storage[r] === 'number') v.storage[r] = 0;
    v.storage.food = pop * 400; v.storage.wood = pop * 200; v.housing = pop * 10;
    v._t1205S = S == null ? 0.75 : S; v._H = 0.35; v._prodKema = 5000; v._fuelKema = 5000;   // K 는 사람보다 훨씬 크게(로지스틱 성장 몫이 서게)
    if (Ev != null) v._t1134E = Ev;   // 겪은 일(굶주림 기억) — 굶은 작은 마을 줄
    return v;
  };
  const day = (v, d) => { E.tickVillage(v, d); const p = v._dpDebug || {}, ls = v.lastStats || {};
    const oth = (p.logi || 0) + (v._natExp || 0) + (p.hunger || 0) + (p.health || 0) + (p.prestige || 0);
    const hb = typeof E.t1405BirthH === 'function' ? E.t1405BirthH(ls.happinessSlow, ls.happinessBurden, v._t1134E) : ls.happiness;
    return { h: ls.happiness, B: ls.happinessBurden, S: ls.happinessSlow, Ev: v._t1134E, hb, dP: p.dP, gated: !!p.gated, rep: v._natExp || 0, oth, happy: p.happy,
      want: E.t1405BirthCap(hb, oth, v._natExp || 0), wantH: E.t1405BirthCap(ls.happiness, oth, v._natExp || 0) }; };
  out.D = day(mk(400, 120), C.dayOf(2, 4, 10));   // 영토 10,000칸 · 사람 120 → h ≈ 0.32
  out.L = day(mk(400, 150), C.dayOf(2, 4, 10));   // 사람 150 → h < 0.25
  out.F = day(mk(400, 30, 0.3, 0.9), C.dayOf(2, 4, 10));   // 굶은 작은 마을 — 사람 30 · S 0.3 · E 0.9 → h < 0.5 · 붐빔 행복 ≫ 0.5
  process.stdout.write('\n' + JSON.stringify(out));
  process.exit(0);
}

// ── 아이(존) — 받는 곳 고르기를 존을 띄워 부른다(T1147 하네스 그 꼴) ──
if (process.argv[2] === '--zone') {
  require('./lib-port').noCentral();
  if (process.env.T474_CARAVAN_WALK === undefined) process.env.T474_CARAVAN_WALK = '0';
  const LT = require('./lib-tmp');
  const DB = LT.file('t1405', '.db');
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(44400)), DB_PATH: DB, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', LATENCY_MS: '0' });
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  require(path.join(ROOT, 'server', 'zone.js'));
  const SV = require(path.join(ROOT, 'server', 'villages.js'));
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const E1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { ok: false };
  (async () => {
    let vils = [];
    for (let i = 0; i < 600; i++) { await sleep(500); const cv = (SV.clientVillages && SV.clientVillages()) || []; vils = cv.map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ && v.econ.npcs.length); if (vils.length >= 20) break; }
    console.log = _l; console.warn = _w; console.error = _e;
    if (vils.length < 20 || typeof SV._t1147Pick !== 'function') { process.stdout.write('\n' + JSON.stringify(out)); process.exit(0); }
    const W = vils[0].econ._world, M = W._distMatrix, ev = W.villages;
    const days = (a, b) => { const i = ev.indexOf(a.econ), j = ev.indexOf(b.econ); const d = (M && i >= 0 && j >= 0) ? M[i][j] : Math.hypot(a.ccx - b.ccx, a.ccy - b.ccy) * 2.5; return isFinite(d) ? V2.travelDaysForDistance(d) : Infinity; };
    let src = null, near = [];
    for (const v of vils) { const n = vils.filter((u) => u !== v && days(v, u) <= 4); if (n.length >= 2) { src = v; near = n; break; } }
    if (!src) { process.stdout.write('\n' + JSON.stringify(out)); process.exit(0); }
    const setH = (v, h, S) => { v.econ.lastStats = Object.assign({}, v.econ.lastStats || {}, { happiness: h, terrCells: 2500 }); v.econ._t1205S = S; };
    const room = (v) => { v.econ.housing = v.econ.npcs.length + 10; v.econ._mapBeds = v.econ.npcs.length + 10; v.econ.storage.food = Math.max(v.econ.storage.food || 0, (v.econ.npcs.length + 1) * 3 + 50); };
    for (const v of vils) { setH(v, 0.1, 0.1); room(v); }
    const [b, c] = near;
    const P = E1.t1205Par(), Bn1 = E1.t1205Burden(b.econ.npcs.length + 1, 2500, P);
    setH(src, 0.2, 0.3);
    setH(b, 0.7, 0.25 + Bn1 - 0.001);   // 한 사람 받으면 0.25 밑(받기 앞은 0.25 위)
    setH(c, 0.6, 3);                     // 넉넉
    const nm = (got) => got === b ? 'b' : got === c ? 'c' : (got ? 'other' : 'none');
    const st = () => typeof SV.t1405Stat === 'function' ? SV.t1405Stat() : null;
    out.env = E1.T1405_RECV; out.st0 = st();
    E1.T1405_RECV = false;               // 끔 길 — 이 아이 안에서만(같은 econ 객체 · villages 가 그 자리에서 읽는다)
    out.st1 = st(); out.pickOff = nm(SV._t1147Pick(src)); out.statOff = st();
    E1.T1405_RECV = out.env;             // env 그대로(켬)
    out.pick = nm(SV._t1147Pick(src)); out.stat = st();
    out.ok = true;
    process.stdout.write('\n' + JSON.stringify(out));
    process.exit(0);
  })().catch((e) => { process.stdout.write('\n' + JSON.stringify({ ok: false, err: String(e && e.stack || e) })); process.exit(0); });
  return;
}

// ── 어버이 ──
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const KN = ['T1405_BIRTH', 'T1405_RECV', 'T1405_TEST_BAIT'];
const run = (mode, env) => {
  const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env || {});
  const r = spawnSync(process.execPath, [__filename, mode], { env: e, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000 });
  const last = String(r.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(last); } catch (err) { return { parseErr: String(err), tail: String(r.stdout || '').slice(-400) + String(r.stderr || '').slice(-400) }; }
};
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-6);
const off = run('--child', {}), on = run('--child', { T1405_BIRTH: '1', T1405_RECV: '1' }), z0 = run('--child', { T1405_BIRTH: '0', T1405_RECV: '' });
console.log('① 손잡이');
ok(off.on && off.on.birth === false && off.on.recv === false && z0.on && z0.on.birth === false && z0.on.recv === false, '빈 값 · \'0\' = 끔(둘 다)', [off.on, z0.on]);
ok(on.on && on.on.birth === true && on.on.recv === true && on.on.happy === true, '\'1\' = 켬(둘 다 · T1205 행복 켬 위)', on.on);
console.log('② 출생 곡선(정본 `t1405BirthCap` — 성장 8 · 자연사 채움 2)');
const c = on.cap || [];
ok(near(c[0], 10) && near(c[1], 6), 'h 0.5 → 10(다) · 0.375 → 6(성장 반)', c.slice(0, 2));
ok(near(c[2], 2) && near(c[3], 2), 'h 0.25 → 2(채움만 — 출생 = 자연사) · 0.1 → 2', c.slice(2, 4));
ok(near(c[4], -3) && near(c[5], 1.5), '깎기 앞 몫 ≤ 0 이면 그대로(−3) · 채움이 더 크면 그 몫까지(1.5)', c.slice(4, 6));
const bh = on.bh || [];
ok(near(bh[0], 1.05) && near(bh[1], 0.3), '붐빔 행복(정본 `t1405BirthH`) — S 0.3 · B 0.05 · E 0.8 → 1.05(굶주림 기억은 뺀다) · E −0.1 → 0.3(좋은 일은 안 뺀다)', bh);
console.log('③ 받는 쪽 문(정본 `t1405RecvOk` — S 0.8 · 영토 2,500칸)');
const rv = on.recv || {};
ok(rv.n94 === true, '인구 94 → 받는다(95 명이어도 0.25 위)', rv.n94);
ok(rv.n95 === false, '인구 95 → 안 받는다(96 명이면 0.25 밑)', rv.n95);
ok(rv.s24 === false, 'S 0.24(이미 0.25 밑) → 안 받는다', rv.s24);
ok(rv.h30 === true && rv.h26 === false && rv.h28herd === false, '들은 줄 길 — 들은 행복 0.30 받는다 · 0.26 안 받는다 · 0.28 + 무리 셋 안 받는다', [rv.h30, rv.h26, rv.h28herd]);
console.log('④ econ 하루(정본 `tickVillage` — 땅 400 · 날 2년 4월 10일)');
const D0 = off.D || {}, D1 = on.D || {}, L1 = on.L || {};
ok(D0.h > 0.25 && D0.h < 0.5 && !D0.gated && D0.dP > D0.rep + 0.1, '끔 · 사람 120 — h 가 0.25 ~ 0.5 · 출생이 자연사 채움보다 많다(사람이 는다 — 켬 줄의 전제)', { h: D0.h, dP: D0.dP, rep: D0.rep });
ok(D1.h > 0.25 && D1.h < 0.5 && !D1.gated && near(D1.dP, Math.min(D1.want, D1.dP + 1e9), 0.002) && near(D1.dP, D1.want, 0.002) && D1.dP < D0.dP, '켬 · 사람 120 — 출생 = 채움 + 성장 × (h − 0.25) ÷ 0.25 · 끔보다 적다', { h: D1.h, dP: D1.dP, want: D1.want, off: D0.dP });
ok(L1.h != null && L1.h <= 0.25 && !L1.gated && near(L1.dP, Math.min(L1.oth, L1.rep), 0.002), '켬 · 사람 150(h ≤ 0.25) — 출생 = 자연사 채움만', { h: L1.h, dP: L1.dP, rep: L1.rep });
const F0 = off.F || {}, F1 = on.F || {};
ok(F1.h != null && F1.h < 0.5 && F1.hb > 0.5 && F1.Ev > 0.5 && !F1.gated && F1.dP > F1.rep + 0.05 && near(F1.dP, F0.dP, 1e-9) && F1.wantH < F1.dP - 0.05,
  '굶은 작은 마을(사람 30 · S 0.3 · E 0.9) — 켬 = 끔 그대로(붐빔 행복 > 0.5 · h 를 읽었다면 출생이 채움으로 묶였다)', { h: F1.h, hb: F1.hb, E: F1.Ev, on: F1.dP, off: F0.dP, rep: F1.rep, wantH: F1.wantH });
console.log('⑤ 서버 받는 곳 고르기(정본 `villages._t1147Pick` · 존)');
const zOn = run('--zone', { T1405_RECV: '1' });
ok(zOn.ok && zOn.env === true && zOn.st0 && zOn.st0.recv === true && zOn.st1 && zOn.st1.recv === false, '존 — env 켬이 econ 칸에 서고 · 아이 안에서 내린 칸을 villages 가 그대로 읽는다', zOn.ok ? { env: zOn.env, st0: zOn.st0, st1: zOn.st1 } : zOn);
ok(zOn.ok && zOn.pickOff === 'b' && zOn.statOff && zOn.statOff.full === 0, '끔 — 더 행복한 0.7(받으면 0.25 밑)을 고른다(종전) · 막은 수 0', zOn.ok ? { pick: zOn.pickOff, stat: zOn.statOff } : zOn);
ok(zOn.ok && zOn.pick === 'c' && zOn.stat && zOn.stat.full >= 1, '켬 — 0.7 을 건너뛰고 넉넉한 0.6 · 막은 수 칸 ≥ 1', zOn.ok ? { pick: zOn.pick, stat: zOn.stat } : zOn);
console.log('★미끼 셋(econ 사본 · 바꾼 자리 1곳)');
const ba = run('--child', { T1405_BIRTH: '1', T1405_RECV: '1', T1405_TEST_BAIT: 'birth' });
const bD = ba.D || {};
ok(ba.bait === 1 && !(near(bD.dP, bD.want, 0.002) && bD.dP < D0.dP), '미끼 ⓐ ㉡ 출생 줄을 뺀 사본 — 바꾼 자리 1곳 · ④ "켬 — 출생 = 채움 + 성장 × 몫" 이 빨강', { bait: ba.bait, dP: bD.dP, want: bD.want });
const bb = run('--child', { T1405_BIRTH: '1', T1405_RECV: '1', T1405_TEST_BAIT: 'recv' });
ok(bb.bait === 1 && bb.recv && bb.recv.n95 === true, '미끼 ⓑ 늘 받는 사본(끔 세계 길 한 줄) — 바꾼 자리 1곳 · ③ "인구 95 → 안 받는다" 가 빨강', { bait: bb.bait, n95: bb.recv && bb.recv.n95 });
const bc = run('--child', { T1405_BIRTH: '1', T1405_RECV: '1', T1405_TEST_BAIT: 'birthH' });
const bF = bc.F || {};
ok(bc.bait === 1 && !(near(bF.dP, F0.dP, 1e-9) && bF.dP > bF.rep + 0.05), '미끼 ⓒ 곡선이 h 를 그대로 읽는 사본(첫 판 꼴) — 바꾼 자리 1곳 · ④ "굶은 작은 마을 — 켬 = 끔 그대로" 가 빨강', { bait: bc.bait, dP: bF.dP, off: F0.dP, rep: bF.rep });
console.log(`\n${fail ? '✗' : '✓'} test-t1405-leave-rare ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
