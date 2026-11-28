'use strict';
// === 계측/T1499_2026-11-27/t1499-observe.js — 몸 걸음 자 관찰기(T1499 · 읽기만 · 제품 코드 손 0) ===
//   쓰는 법: T1499_OBS=<폴더> T1499_ARM=<태그> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … [--vclock] [--body-day]
//   존 아이(T577_SEED 가 선 존 프로세스)에서만 선다. 마을 몸(나무꾼 · 어부 · 농부 · 채집)마다 게임 날마다:
//     px   = 걸은 거리 — 결정 문(npcStep) 사이 위치 차의 합(정본 실제 시계는 틱마다 · 30 Hz) + 판 시계 걸음(_t1295Walk)이 길을 따라 간 거리
//            (켬 걸음은 몸에 `_t1499Mv` = 이번 부름에 간 px 를 남긴다 — 있으면 그것 · 없으면 위치 차)
//     jump = 한 번에 3 칸(96 px) 넘게 바뀐 위치 차 — 걸음이 아닌 자리 옮김(되살림 · 집 들기 · 갈래 보간) — px 에 넣지 않고 따로 센다
//     far  = 그날 첫 자리에서 가장 멀리 간 거리 · trips = 곳간 넣기 횟수(손에 든 것 > 0 · 일터 ↔ 곳간 왕복)
//     work = 손에 든 채 곳간 문에 온 양(한 일) · gran = 곳간이 받은 양 · gath = 자원 캐기 부름 수
//   쓰기: <폴더>/obs-<태그>-<시드>.json(100날마다 · 끝에).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1499_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1499_ARM || 'x', SEED = process.env.T577_SEED;
const OUT = path.join(DIR, `obs-${ARM}-${SEED}.json`);
const JOBS = { lumberjack: 'L', fisher: 'F', farmer: 'R', forager: 'G' };
const H = global.__T1499 = { err: (e) => { rec.errN++; if (!rec.err) rec.err = String(e && e.stack || e).slice(0, 400); } };
const Module = require('module');
const SNIP_V = `
;(function(){ var H = global.__T1499; if (!H) return; try {
  function W(name, f){ return function(vil, npc){ var inv = npc && npc.inventory, u0 = 0; if (inv) for (var k in inv) { var q = inv[k]; if (typeof q === 'number' && q > 0) u0 += q; } var r = f.apply(this, arguments); try { H.deliver(name, npc, u0, r); } catch (e) { H.err(e); } return r; }; }
  _t325Deliver = W('wood', _t325Deliver); _t312Deliver = W('fish', _t312Deliver); _t368Deliver = W('farm', _t368Deliver); _t347Deliver = W('forage', _t347Deliver);
  var c4 = _t340Try; _t340Try = function(vil, npc, now){ var r = c4.apply(this, arguments); try { H.cnt(npc, r === 'miss' ? 'miss' : (r && typeof r === 'object') ? 'hook' : (r === 'wait' && npc._t340 && npc._t340.castAt === now) ? 'cast' : r === 'none' ? 'none' : 'wait', 1); } catch (e) { H.err(e); } return r; };
  var c5 = _t312Catch; _t312Catch = function(vil,day,cx,cy,want,kg,now,npc){ var r = c5.apply(this, arguments); try { if (r > 0) { H.cnt(npc, 'fish', 1); H.cnt(npc, 'fishU', r); } } catch (e) { H.err(e); } return r; };
  var c6 = _lifeDoTask0; _lifeDoTask0 = function(vil, npc){ var r = c6.apply(this, arguments); try { if (r && npc) H.cnt(npc, 'task', 1); } catch (e) { H.err(e); } return r; };
  var c7 = _t720Settle; _t720Settle = function(vil, npc){ try { H.cnt(npc, 'settle', 1); } catch (e) { H.err(e); } return c7.apply(this, arguments); };
  H.vstate = state;
} catch (e) { H.err(e); } })();
`;
const SNIP_Z = `
;(function(){ var H = global.__T1499; if (!H) return; try {
  var c1 = npcStep; npcStep = function(npc, dt, now){ var r = c1.apply(this, arguments); try { if (npc && npc.simVillageId) H.see(npc, 0); } catch (e) { H.err(e); } return r; };
  var c2 = _t1295Walk; _t1295Walk = function(p, dt, sub){ var r = c2.apply(this, arguments); try { if (r && p && p.simVillageId) H.see(p, 1); } catch (e) { H.err(e); } return r; };
  var c3 = _npcGatherResource; _npcGatherResource = function(npc, r){ var x = c3.apply(this, arguments); try { H.gath(npc); } catch (e) { H.err(e); } return x; };
  H.zint = { x: function(p){ return _xyX(p); }, y: function(p){ return _xyY(p); }, mv: function(p){ if (typeof _t1499Mv === 'undefined') return undefined; var m = _t1499Mv.get(p); _t1499Mv.delete(p); return m; }, st: function(){ return typeof _t1499Stat === 'undefined' ? null : _t1499Stat; } };
} catch (e) { H.err(e); } })();
`;
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof filename === 'string') {
    if (/server[\/\\]villages\.js$/.test(filename)) arguments[0] = content + '\n' + SNIP_V;
    else if (filename === path.resolve(A1)) arguments[0] = content + '\n' + SNIP_Z;
  }
  return _compile.apply(this, arguments);
};
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { arm: ARM, seed: SEED, dayMs: +process.env.VILLAGE_DAY_MS || null, vclock: process.env.T745_VCLOCK === '1', knob: process.env.T1499_VCLOCK_WALK || '0',
  lastDay: 0, errN: 0, err: null, wall0: Date.now(), dayWall: {}, days: {} };
const _wall = (() => { try { return require('perf_hooks').performance; } catch (e) { return null; } })();
const W0 = _wall ? _wall.timeOrigin + _wall.now() : 0;   // 실제 벽시계(가상 시계가 Date.now 를 쥐어도 perf 는 산다)
const wallNow = () => _wall ? _wall.timeOrigin + _wall.now() - W0 : 0;
let last = 0, dayB = new Map();   // pid → 그날 몸 칸
function bOf(npc) {
  let b = dayB.get(npc.pid);
  if (!b) {
    const J = JOBS[npc.simJob]; if (!J) return null;
    const x = H.zint ? H.zint.x(npc) : npc.x, y = H.zint ? H.zint.y(npc) : npc.y;
    b = { J, v: npc.simVillageId, x, y, x0: x, y0: y, px: 0, jump: 0, jumpPx: 0, far: 0, n: 0, trips: 0, work: 0, gran: 0, gath: 0, wk: 0 };
    dayB.set(npc.pid, b);
  }
  return b;
}
H.see = (npc, walk) => {
  if (last < 1) return;
  const b = bOf(npc); if (!b) return;
  const x = H.zint.x(npc), y = H.zint.y(npc);
  let d = Math.hypot(x - b.x, y - b.y);
  const mv = walk ? H.zint.mv(npc) : undefined;
  if (typeof mv === 'number') { b.px += mv; b.wk++; }
  else if (d > 96) { b.jump++; b.jumpPx += d; }
  else b.px += d;
  b.x = x; b.y = y; b.n++;
  const f = Math.hypot(x - b.x0, y - b.y0); if (f > b.far) b.far = f;
};
const CK = ['cast', 'wait', 'none', 'miss', 'hook', 'fish', 'fishU', 'task', 'settle'];
H.cnt = (npc, k, a) => { if (last < 1 || !npc || !npc.simVillageId) return; const b = bOf(npc); if (b) b[k] = (b[k] || 0) + a; };
H.gath = (npc) => { if (last < 1 || !npc || !npc.simVillageId) return; const b = bOf(npc); if (b) b.gath++; };
H.deliver = (name, npc, u0, r) => {
  if (last < 1 || !npc || !npc.simVillageId) return; const b = bOf(npc); if (!b) return;
  const g = +r || 0; if (u0 > 1e-9) { b.trips++; b.work += u0; } b.gran += g;
};
function flush(day) {
  const o = {}, pv = {};
  for (const [pid, b] of dayB) {
    const a = o[b.J] || (o[b.J] = { bodies: 0, px: 0, moved: 0, jump: 0, jumpPx: 0, far: 0, far650: 0, trips: 0, work: 0, gran: 0, gath: 0, n: 0, wk: 0, pxs: [] });
    a.bodies++; a.px += b.px; if (b.px > 1) a.moved++; a.jump += b.jump; a.jumpPx += b.jumpPx; a.far += b.far; if (b.far >= 650) a.far650++;
    for (const k of CK) if (b[k]) a[k] = (a[k] || 0) + b[k];
    a.trips += b.trips; a.work += b.work; a.gran += b.gran; a.gath += b.gath; a.n += b.n; a.wk += b.wk; a.pxs.push(Math.round(b.px));
    const vk = String(b.v), q = pv[vk] || (pv[vk] = {}); const qa = q[b.J] || (q[b.J] = { bodies: 0, px: 0, trips: 0, work: 0, gran: 0, far: 0 });
    qa.bodies++; qa.px += b.px; qa.trips += b.trips; qa.work += b.work; qa.gran += b.gran; qa.far += b.far;
    // 다음 날 첫 자리 = 오늘 끝 자리
    b.x0 = b.x; b.y0 = b.y;
  }
  for (const J in o) { const p = o[J].pxs.sort((a, c) => a - c); o[J].p50 = p[p.length >> 1] || 0; o[J].p90 = p[Math.floor(p.length * 0.9)] || 0; delete o[J].pxs; }
  rec.days[day] = { job: o, vil: day <= 5 || day % 50 === 0 ? pv : undefined };
  rec.dayWall[day] = Math.round(wallNow());
  try { const st = H.zint && H.zint.st(); if (st) rec.walkStat = Object.assign({}, st); } catch (e) {}
  const nb = new Map(); for (const [pid, b] of dayB) nb.set(pid, Object.assign({}, b, { cast: 0, wait: 0, none: 0, miss: 0, hook: 0, fish: 0, fishU: 0, task: 0, settle: 0, px: 0, jump: 0, jumpPx: 0, far: 0, n: 0, trips: 0, work: 0, gran: 0, gath: 0, wk: 0 }));
  dayB = nb;
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) {
    if (last > 0) { try { flush(last); } catch (e) { H.err(e); } if (last % 50 === 0 || last <= 5) write(); }
    last = day; rec.lastDay = day;
  }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0) { try { flush(last); } catch (e) {} } write(); });
