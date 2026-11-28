'use strict';
// (@regress 없음 — 러너 밖 · T1502 탐침 · 제품 무변)
// === scripts/lib-act-funnel.js — **몸이 한 일 깔때기**(T1502) — 직업 다섯(농부 · 채집 · 나무꾼 · 어부 · 사냥꾼)이 같이 쓰는 한 벌 ===================
//
//   쓰는 법(서버 판 곁 · 읽기만):
//     T1502_FUNNEL=<폴더> T1502_ARM=<팔> NODE_OPTIONS="--require scripts/lib-act-funnel.js" \
//       node scripts/server-baseline-check.js --make … --vclock
//     → <폴더>/funnel-<팔>-<시드>.json
//   ⚠env `T1502_FUNNEL` 이 없거나 아이 존(`T577_SEED` · argv[1] = server/zone.js)이 아니면 **아무것도 안 건다**(끔 = 무변).
//   ⚠켜도 세계는 안 바뀐다 — 껍질은 모두 "부른 뒤 읽기만"이다(인자 · 돌려주는 값 그대로 · 세계 칸에 쓰지 않는다). 관찰기 무변은 하네스가 판 지문으로 잰다.
//
//   깔때기(몸-날 = 그날 살아 있는 그 직업 몸 하나):
//     bd 몸-날 → tick 걸음 틱(npcStep)을 하루 한 번이라도 받음 → out 일터가 섰다(나섬) → reach 일터에 닿음(그 직업의 도착 반경)
//     → work 일함(그 직업의 일 문을 한 번이라도) → harv 거둠(손에 든 양 > 0) → carry 들고 옴(곳간 다리에 짐 > 0) → gran 곳간에 듦(> 0)
//   칸: 하루에 걸은 px(`walkPx` — 관측 사이 자리 차의 합 · 직선) ↔ 일터까지 px(`d0` — 그날 처음 일터가 선 순간의 거리) · 최소 거리 `dmin`
//       곳간 다리: 몸이 곳간에 닿아 넣음(`walk` — 생활 틱 안) ↔ 하루 경계 손 넣기(`day`) — 짐 u · 든 g · 식량등가 fe(곳간 식량등가 전후 차)
//       일괄(몸 아닌 입구 — econ `*ToGranary` 를 몸 다리 밖에서 부른 것) · 끈 세계 하루 생산(`dailyProductionBuf` 합 — 직업별 식량 칸)
//   못 닿은 까닭(몸-날 하나에 하나): noTick(걸음 틱 0) · noSite(일터가 안 섰다 — 그날 마지막 생활 라벨을 같이 센다) · far(섰는데 못 닿음)
//
//   순수 함수(하네스 · 표가 부른다): `funnelOf(row)` · `check(rec)`(닿지 않고 거둠 · 거둔 것보다 많이 듦) · `fpDiff(a, b)`(판 지문 칸 견줌)
const path = require('path'), fs = require('fs');

const JOBS = ['farmer', 'forager', 'lumberjack', 'fisher', 'hunter'];
const STAGES = ['bd', 'tick', 'out', 'reach', 'work', 'harv', 'carry', 'gran'];
const STAGE_KO = { bd: '몸-날', tick: '틱 받음', out: '나섬', reach: '일터 닿음', work: '일함', harv: '거둠', carry: '들고 옴', gran: '곳간 듦' };
const REACH_R = { farmer: 44, forager: 240, lumberjack: 240, fisher: 130, miner: 240 };   // 생활층 도착 반경 그대로(villages.js npcLifeTick 갈래마다 · 새 수 아님 — 읽어 온 값)

function newRow() {
  const r = { stepN: 0, lifeN: 0, workN: 0, harvU: 0, carryU: 0, granU: 0, granX: 0, granFE: 0, walkPx: 0, d0Sum: 0, d0N: 0, walkOutPx: 0, harvNoReach: 0,
    why: { noTick: 0, noSite: 0, far: 0 }, lab: {}, del: { walk: { n: 0, u: 0, g: 0, fe: 0 }, day: { n: 0, u: 0, g: 0, fe: 0 } }, farHist: [0, 0, 0, 0, 0, 0] };
  for (const s of STAGES) r[s] = 0;
  return r;
}
// 깔때기 한 줄 → 단계마다 남은 몸-날 · 새는 몫(앞 단계 대비) · 가장 크게 새는 단계
function funnelOf(row) {
  const out = []; let worst = null;
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i], n = row[s] || 0, prev = i ? (row[STAGES[i - 1]] || 0) : n;
    const leak = (i && prev > 0) ? 1 - n / prev : 0;
    const e = { stage: s, ko: STAGE_KO[s], n, leak: +leak.toFixed(4), ofBd: row.bd ? +(n / row.bd).toFixed(4) : 0 };
    out.push(e);
    if (i && prev > 0 && (!worst || leak > worst.leak)) worst = e;
  }
  return { stages: out, worst };
}
// 불변식: ① 닿지 않은 몸-날이 거두면 안 된다 ② 몸 다리로 곳간에 든 양 ≤ 거둔 양(판 누계 — 손은 날을 넘는다) ③ 단계는 줄기만 한다
function check(rec) {
  const bad = [];
  for (const j of Object.keys((rec && rec.rows) || {})) {
    const r = rec.rows[j];
    if (r.harvNoReach > 0) bad.push(`${j}: 닿지 않고 거둔 몸-날 ${r.harvNoReach}`);
    if (j !== 'hunter' && r.granU > r.harvU + 1e-6) bad.push(`${j}: 곳간에 든 ${r.granU.toFixed(3)} > 거둔 ${r.harvU.toFixed(3)}`);
    for (let i = 1; i < STAGES.length; i++) if ((r[STAGES[i]] || 0) > (r[STAGES[i - 1]] || 0)) bad.push(`${j}: ${STAGES[i]} ${r[STAGES[i]]} > ${STAGES[i - 1]} ${r[STAGES[i - 1]]}`);
  }
  return bad;
}
// 판 지문(server-baseline-check --make JSON) 두 벌 견줌 — 다른 칸 목록(시드 · 날 · 칸). 빈 목록 = 같음.
function fpDiff(a, b) {
  const d = [];
  const sa = (a && a.byseed) || {}, sb = (b && b.byseed) || {};
  for (const s of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    const x = sa[s], y = sb[s];
    if (!x || !y) { d.push(`${s}: 한쪽 없음`); continue; }
    if ((x.runHash || null) !== (y.runHash || null)) d.push(`${s}: runHash ${x.runHash} ≠ ${y.runHash}`);
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      if (k === 'runHash' || k === 'sec' || k === 'ms' || k === 'wall' || k === 'cpu') continue;
      const vx = JSON.stringify(x[k]), vy = JSON.stringify(y[k]);
      if (vx === vy) continue;
      if (Array.isArray(x[k]) && Array.isArray(y[k])) { const n = Math.max(x[k].length, y[k].length); for (let i = 0; i < n; i++) if (JSON.stringify(x[k][i]) !== JSON.stringify(y[k][i])) d.push(`${s}.${k}[${i}]`); }
      else d.push(`${s}.${k}`);
    }
  }
  return d;
}
module.exports = { JOBS, STAGES, STAGE_KO, REACH_R, newRow, funnelOf, check, fpDiff };

// ─────────────────────────────── 아래는 판 곁에서만(아이 존 · env 켬) ───────────────────────────────
const A1 = process.argv[1] || '';
if (!(process.env.T1502_FUNNEL && process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1502_FUNNEL;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1502_ARM || 'x', SEED = process.env.T577_SEED;
const OUT = path.join(DIR, `funnel-${ARM}-${SEED}.json`);
const Module = require('module');
const SNIP_V = `
;(function(){ var H = global.__T1502; if (!H) return; try {
  var v1 = _lifeDoTask; _lifeDoTask = function(vil, npc, k, day){ var r = v1.apply(this, arguments); try { if (npc && r) H.work(npc, 1); } catch (e) { H.err(e); } return r; };
  var v2 = _t368Hold; _t368Hold = function(npc, it){ var r = v2.apply(this, arguments); try { if (npc && it) H.harvFarm(npc, +it.u || 0); } catch (e) { H.err(e); } return r; };
  var v3 = _t368Deliver; _t368Deliver = function(vil, npc, why){ var u = 0; try { var Hh = npc && npc._t368H; if (Hh) for (var c in Hh) u += Math.min(Hh[c] || 0, (npc.inventory && npc.inventory[c]) || 0); } catch (e) {} return H.del(vil, npc, u, function(){ return v3.apply(this, arguments); }.bind(this, vil, npc, why)); };
  var v4 = _t347Deliver; _t347Deliver = function(vil, npc){ var u = 0; try { u = H.handOf(npc, vil); } catch (e) {} return H.del(vil, npc, u, function(){ return v4.call(this, vil, npc); }.bind(this)); };
  var v5 = _t325Deliver; _t325Deliver = function(vil, npc){ var u = (npc && npc.inventory && npc.inventory.wood) || 0; return H.del(vil, npc, u, function(){ return v5.call(this, vil, npc); }.bind(this)); };
  var v6 = _t312Deliver; _t312Deliver = function(vil, npc){ var u = (npc && npc._t312U) || 0; return H.del(vil, npc, u, function(){ return v6.call(this, vil, npc); }.bind(this)); };
  var m = module.exports, lt = m.npcLifeTick;
  if (lt) m.npcLifeTick = function(npc, now){ H.cur = npc; var r; try { r = lt.apply(this, arguments); } finally { H.cur = null; } try { H.life(npc); } catch (e) { H.err(e); } return r; };
  H.vint = { state: state, keepOf: _t347KeepOf, handsOf: _t347HandsOf };
} catch (e) { H.err(e); } })();
`;
const SNIP_Z = `
;(function(){ var H = global.__T1502; if (!H) return; try {
  var z1 = npcStep; npcStep = function(npc, dt, now){ var J = npc && npc.simVillageId ? H.J(npc) : null; if (J) { try { H.pre(npc, J); } catch (e) { H.err(e); } }
    var r = z1.apply(this, arguments); if (J) { try { H.post(npc, J); } catch (e) { H.err(e); } } return r; };
  var z2 = _npcGatherResource; _npcGatherResource = function(npc, r){ var J = npc && npc.simVillageId ? H.J(npc) : null; var h0 = J ? H.hand(npc, J) : 0;
    var x = z2.apply(this, arguments); if (J) { try { H.gather(npc, J, h0); } catch (e) { H.err(e); } } return x; };
  H.zint = { players: players };
} catch (e) { H.err(e); } })();
`;
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof filename === 'string') {
    if (filename === path.join(ROOT, 'server', 'villages.js')) arguments[0] = content + '\n' + SNIP_V;
    else if (filename === path.resolve(A1)) arguments[0] = content + '\n' + SNIP_Z;
  }
  return _compile.apply(this, arguments);
};
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const WIN = 100;
const rec = { seed: +SEED, arm: ARM, lastDay: 0, err: null, hooked: {}, rows: {}, win: [], batch: {}, prod: { days: 0, sum: {}, fe: 0 }, snaps: [], ticks: { steps: 0, lifes: 0 } };
for (const j of JOBS) rec.rows[j] = newRow();
let winRows = null; const newWin = () => { const w = {}; for (const j of JOBS) w[j] = newRow(); return w; };
winRows = newWin();
const H = global.__T1502 = { cur: null, inDel: 0, vint: null, zint: null,
  err: (e) => { rec.err = rec.err || ('hook ' + String(e && e.stack || e).slice(0, 400)); } };
const JSET = new Set(JOBS);
H.J = (npc) => { const j = npc.simJob; return JSET.has(j) ? j : null; };
let last = -1, VIL = null;
const bodies = new Map();
function vilOf(npc) { const st = H.vint && H.vint.state; return st && st.byDbId && st.byDbId.get(npc.simVillageId); }
function B(npc, J) {
  let b = bodies.get(npc.pid);
  const pJ = b ? b.J : J;
  if (!b || b.day !== last) {
    const lx = b ? b.lx : npc.x, ly = b ? b.ly : npc.y, lh = b ? b.lh : null;
    b = { J, pid: npc.pid, day: last, step: 0, life: 0, out: 0, reach: 0, work: 0, harv: 0, carry: 0, gran: 0, harvU: 0, walk: 0, walkOut: 0, d0: null, dmin: Infinity, lx, ly, lh, lab: null, noReachHarv: 0 };
    bodies.set(npc.pid, b);
  }
  if (pJ !== J) {   // 탐침 고침 ⑥: 바뀌기 전 자로 본 손 차(직업이 바뀌기 직전 걸음에 거두고 아직 못 본 손)는 앞 직업 거둠 · 앞 직업 손 몫으로 둔다
    if (b.lh != null && pJ !== 'farmer' && pJ !== 'hunter') { const d = H.hand(npc, pJ) - b.lh; if (d > 1e-9) { for (const R of [rec.rows[pJ], winRows[pJ]]) R.harvU += d; holdAdd({ pid: npc.pid, J: pJ }, d); } }
    b.lh = null;
  }
  // 직업이 바뀌면 손 칸 자(`H.hand`)가 바뀐다 — 기준을 새로 잡는다(자가 바뀐 차를 거둠으로 세지 않는다 · 탐침 고침 ①)
  b.J = J;
  return b;
}
function siteOf(npc, J) {
  if (J === 'farmer') {
    if (npc._farmK) { const k = npc._farmK, ci = k.indexOf(','); return [+k.slice(0, ci) * 32 + 16, +k.slice(ci + 1) * 32 + 16, REACH_R.farmer]; }
    const t = npc._lifeTask; if (t && t.px != null) return [t.px, t.py, 44];
    return null;
  }
  if (J === 'lumberjack' && npc._t325Site && !npc._t325Site.none && npc._t325Site.x != null) return [npc._t325Site.x, npc._t325Site.y, 44];
  if (J === 'forager' && npc._t1502F && npc._t1502F.site) return [npc._t1502F.site.x, npc._t1502F.site.y, 44];   // T1502_ACT_FIX 켬 — 채집 색인 셀(몸 절의 44 px)
  if (J === 'hunter') return null;
  const ws = npc._workSite; if (ws && ws.x != null) return [ws.x, ws.y, REACH_R[J] || 240];
  return null;
}
// 그 직업의 손(거둔 것이 처음 드는 칸) — 농부는 `_t368Hold` 껍질이 직접 센다(손 칸 = 작물 이름들)
H.hand = (npc, J) => {
  const inv = npc.inventory; if (!inv) return 0;
  if (J === 'forager') { const vil = vilOf(npc); return vil ? H.handOf(npc, vil) : 0; }
  if (J === 'lumberjack') return inv.wood || 0;
  if (J === 'fisher') return npc._t312U || 0;
  return 0;
};
H.handOf = (npc, vil) => {
  const V = H.vint; if (!V || !npc || !npc.inventory) return 0;
  const keep = V.keepOf(vil) || []; let u = 0;
  for (const k of keep) for (const h of V.handsOf(k)) u += npc.inventory[h] || 0;
  return u;
};
function observe(npc, J, b) {
  const dx = npc.x - b.lx, dy = npc.y - b.ly, d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0 && d < 4000) { b.walk += d; if (b.out) b.walkOut += d; }   // 4000px 넘는 뜀(되살아남 · 순간 이동)은 걸음이 아니다
  b.lx = npc.x; b.ly = npc.y;
  const s = siteOf(npc, J);
  if (s) {
    const ds = Math.hypot(npc.x - s[0], npc.y - s[1]);
    if (!b.out) { b.out = 1; b.d0 = ds; }
    if (ds < b.dmin) b.dmin = ds;
    if (ds <= s[2]) b.reach = 1;
  }
  if (J !== 'farmer' && J !== 'hunter') {   // 손 칸 차 — 늘면 거뒀다(곳간 다리 껍질이 뺀 만큼은 `lh` 를 다시 잡는다)
    const h = H.hand(npc, J);
    if (b.lh != null && h > b.lh + 1e-9) addHarv(b, h - b.lh);
    b.lh = h;
  }
}
function addHarv(b, u) { if (!(u > 0)) return; b.harvU += u; b.harv = 1; if (!b.work) b.work = 1; if (!b.reach) b.noReachHarv = 1; holdAdd(b, u); }   // 거둠은 일이다(밭 일 문이 거짓을 돌려줘도)
// 몸마다 직업별로 거둔 손(곳간에 아직 안 든 양) — 직업을 바꾼 몸이 앞 직업 때 거둔 손을 넣으면 그 몫은 앞 직업 손이다(탐침 고침 ③ · 한 몸 안에서만 옮긴다:
//   어느 직업으로도 거둔 적 없는 손은 지금 직업 `granU` 에 그대로 남는다 — 구멍은 숨지 않는다)
const held = new Map();
function holdAdd(b, u) { if (!(u > 0) || b.pid == null) return; const m = held.get(b.pid) || {}; m[b.J] = (m[b.J] || 0) + u; held.set(b.pid, m); }
function holdTake(pid, J, u) {   // → 다른 직업 때 거둔 몫(단위)
  const m = held.get(pid); if (!m || !(u > 0)) return 0;
  const own = Math.min(u, m[J] || 0); m[J] = (m[J] || 0) - own; let rest = u - own, x = 0;
  for (const k of Object.keys(m)) { if (k === J || !(rest > 0)) continue; const t = Math.min(rest, m[k]); m[k] -= t; rest -= t; x += t; }
  return x;
}
H.pre = (npc, J) => { const b = B(npc, J); observe(npc, J, b); };
H.post = (npc, J) => { const b = B(npc, J); b.step++; rec.ticks.steps++; observe(npc, J, b); };
H.life = (npc) => { const J = H.J(npc); if (!J) return; const b = B(npc, J); b.life++; rec.ticks.lifes++; b.lab = npc._lifeAct || null; observe(npc, J, b); };
H.work = (npc, n) => { rec.hooked.work = 1; const J = H.J(npc); if (!J) return; const b = B(npc, J); observe(npc, J, b); b.work += n; };
H.harvFarm = (npc, u) => { rec.hooked.hold = 1; const J = H.J(npc); if (!J) return; const b = B(npc, J); observe(npc, J, b); addHarv(b, u); };
H.gather = (npc, J, h0) => {
  rec.hooked.gather = 1; const b = B(npc, J); b.work++;
  if (J !== 'farmer' && J !== 'hunter') { const h = H.hand(npc, J); if (h > h0 + 1e-9) { b.out = 1; b.reach = 1; addHarv(b, h - h0); } b.lh = h; }   // 존 채집은 자원 곁(`GATHER_RANGE` — 존이 재고 부른다)에서만 — 그 몸은 일터에 나서 닿았다(탐침 고침 ② · ⑤: 자리를 아직 안 잡은 몸도 — 나섬 없이 닿음만 서면 거둠이 "닿지 않고 거둠"으로 샌다 · 첫 px 는 모름으로 둔다)
};
function feOf(v) { try { return +V1.totalFoodEquivalent(v) || 0; } catch (e) { return 0; } }
H.del = (vil, npc, u, call) => {
  rec.hooked.del = 1;
  const J = npc ? H.J(npc) : null, inLife = H.cur === npc, e = vil && vil.econ;
  const fe0 = (J && e) ? feOf(e) : 0;
  if (J) { try { observe(npc, J, B(npc, J)); } catch (x) { H.err(x); } }   // 넣기 전 손을 한 번 본다 — 한 걸음 안에서 거두고 바로 넣은 손(어부 짐 한도)도 거둠에 든다(탐침 고침 ④)
  H.inDel++; let g; try { g = call(); } finally { H.inDel--; }
  try {
    if (J) {
      const b = B(npc, J), gg = +g || 0, fe = e ? feOf(e) - fe0 : 0;
      const xu = u > 1e-9 ? holdTake(npc.pid, J, u) : 0, gx = xu > 0 ? gg * xu / u : 0;   // 앞 직업 때 거둔 손의 몫
      if (u > 1e-9) { b.carry = 1; b.carryU = (b.carryU || 0) + u; }
      if (gg > 1e-9) { b.gran = 1; b.granU = (b.granU || 0) + gg - gx; b.granFE = (b.granFE || 0) + fe; }
      if (gx > 0) b.granX = (b.granX || 0) + gx;
      const k = inLife ? 'walk' : 'day';
      for (const R of [rec.rows[J], winRows[J]]) { const D = R.del[k]; if (u > 1e-9) { D.n++; D.u += u; } D.g += gg; D.fe += fe; }
      if (J !== 'farmer' && J !== 'hunter') b.lh = H.hand(npc, J);
    }
  } catch (x) { H.err(x); }
  return g;
};
// 몸 다리 밖에서 econ 곳간 입구를 부른 것 = 일괄(몸 XOR 일괄 확인 · 직업별)
for (const [fn, J] of [['harvestToGranary', 'farmer'], ['forageToGranary', 'forager'], ['woodToGranary', 'lumberjack'], ['fishToGranary', 'fisher'], ['huntToGranary', 'hunter']]) {
  const f = V1[fn]; if (typeof f !== 'function') continue;
  V1[fn] = function (v) {
    if (H.inDel) return f.apply(this, arguments);
    const fe0 = feOf(v), r = f.apply(this, arguments);
    try { const a = rec.batch[J] || (rec.batch[J] = { n: 0, g: 0, fe: 0 }); a.n++; a.g += +r || 0; a.fe += feOf(v) - fe0; } catch (e) { H.err(e); }
    return r;
  };
}
function flush() {
  const pl = H.zint && H.zint.players; if (!pl || last < 1) { bodies.clear(); return; }
  for (const p of pl.values()) {
    if (!p || !p.simVillageId || !(p.hp > 0)) continue;
    const J = H.J(p); if (!J) continue;
    const b = bodies.get(p.pid);
    const cur = b && b.day === last ? b : null;
    for (const R of [rec.rows[J], winRows[J]]) {
      R.bd++;
      if (!cur || !cur.step) { R.why.noTick++; if (cur && cur.lab) R.lab[cur.lab] = (R.lab[cur.lab] || 0) + 1; continue; }
      R.tick++; R.stepN += cur.step; R.lifeN += cur.life; R.walkPx += cur.walk;
      if (!cur.out) { R.why.noSite++; const l = cur.lab || '-'; R.lab[l] = (R.lab[l] || 0) + 1; continue; }
      R.out++; if (cur.d0 != null) { R.d0Sum += cur.d0; R.d0N++; } R.walkOutPx += cur.walkOut;
      if (cur.noReachHarv) R.harvNoReach++;
      if (!cur.reach) { R.why.far++; const r = (cur.d0 || 0) / Math.max(1, cur.walk); R.farHist[r < 1 ? 0 : r < 2 ? 1 : r < 5 ? 2 : r < 20 ? 3 : r < 100 ? 4 : 5]++; continue; }
      R.reach++;
      // 단계는 차례로만 든다(앞 단계가 선 몸-날만 — 손은 날을 넘으므로 그날 거두지 않고 어제 짐을 넣은 몸-날은 단계 칸엔 안 들고 양 칸에만 든다)
      if (cur.work) { R.work++; R.workN += cur.work; if (cur.harv) { R.harv++; if (cur.carry) { R.carry++; if (cur.gran) R.gran++; } } }
      R.harvU += cur.harvU;
      R.carryU += cur.carryU || 0;
      R.granU += cur.granU || 0; R.granX += cur.granX || 0; R.granFE += cur.granFE || 0;
    }
  }
  // 닿지 않은 몸-날의 거둠 · 짐 · 듦도 양으로는 센다(단계 칸은 위 차례 그대로 — 닿은 몸만 아래 단계에 든다)
  for (const b of bodies.values()) {
    if (b.day !== last || b.reach) continue;
    for (const R of [rec.rows[b.J], winRows[b.J]]) { R.harvU += b.harvU; R.carryU += b.carryU || 0; R.granU += b.granU || 0; R.granX += b.granX || 0; R.granFE += b.granFE || 0; }
  }
}
// 일괄(몸 없는 일꾼) 채집의 하루 — 생활층이 마을마다 남기는 `vil._t347Dbg`(그날 판 · 읽기만) · 어제 몫을 오늘 첫 틱에 센다
function fbAdd(A, D, vil) {
  A.vd++; if (D.on) A.on++; A.fg += D.fg || 0; A.walked += D.walked || 0; if (!(D.cells > 0)) A.noCell++; A.cap += D.cap || 0; if (!(D.trips > 0)) A.noTrip++;
  A.pick += D.pick || 0; A.units += D.units || 0; if (D.stop) A.stop++; if (D.noloot) A.noloot++; if (D.hold) A.hold++;
  if (D.dem === 0) A.dem0++; else if (D.dem > 0) A.dem += D.dem;
  if (D.fg > 0 && D.cells > 0 && D.on && !(D.pick > 0) && !(D.units > 0)) A.idle++;
  const e = vil.econ; if (e) { const c = (e.counts && e.counts.forager) || 0, o = +e._forageOutLast || 0, sh = +e._t347MixShare || 0; A.econN += c; if (!(c > 0)) A.econ0++; else if (!(sh > 0)) A.share0++; else if (!(o > 0)) A.out0++; A.D += o * sh; A.out += o; }
  const g = +vil._t347Gran || 0, k = vil.dbId != null ? vil.dbId : vil.name; const g0 = fbGran.get(k); fbGran.set(k, g); if (g0 != null && g > g0) A.gran += g - g0;
}
const fbGran = new Map(), fbSeen = new WeakSet();
const newFb = () => ({ vd: 0, on: 0, fg: 0, walked: 0, noCell: 0, cap: 0, noTrip: 0, pick: 0, units: 0, stop: 0, noloot: 0, hold: 0, dem0: 0, dem: 0, idle: 0, gran: 0, econN: 0, econ0: 0, share0: 0, out0: 0, D: 0, out: 0 });
rec.fb = newFb(); let winFb = newFb();
function fbSample() {
  try {
    if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    for (const vil of (P.villages || [])) { const D = vil._t347Dbg; if (!D || fbSeen.has(D)) continue; fbSeen.add(D); fbAdd(rec.fb, D, vil); fbAdd(winFb, D, vil); }
  } catch (e) { H.err(e); }
}
function snap(day) {
  try {
    if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, vills = 0, empty = 0, fd = 0, fe = 0;
    const jobs = {};
    for (const vil of (P.villages || [])) {
      const e = vil.econ; if (!e) continue; vills++;
      const n = (e.npcs || []).length; pop += n; if (n === 0) empty++;
      fd += e._fdDeadTot || 0; fe += feOf(e);
      const c = e.counts; if (c) for (const k of JOBS) jobs[k] = (jobs[k] || 0) + (c[k] || 0);
    }
    rec.snaps.push({ day, pop, vills, empty, fd, foodDays: pop ? +(fe / pop).toFixed(2) : null, jobs });
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 300)); }
}
function save() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
// 끈 세계 하루 생산 — econ 틱이 채운 `dailyProductionBuf`(직업별 식량 칸) · 식량등가 합(`totalFoodProductionEquivalent`)
let prodDay = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) {
    if (last > 0) {
      flush(); fbSample();
      if (last % WIN === 0) { rec.win.push({ day: last, rows: winRows, fb: winFb }); winRows = newWin(); winFb = newFb(); snap(last); save(); }
    }
    last = day; rec.lastDay = day;
  }
  const r = _t.apply(this, arguments);
  try {
    const dp = v && v.dailyProductionBuf;
    if (dp) {
      if (prodDay !== day) { prodDay = day; rec.prod.days++; }
      const S = rec.prod.sum; for (const k in dp) { const q = dp[k]; if (q) S[k] = (S[k] || 0) + q; }
      if (V1.totalFoodProductionEquivalent) rec.prod.fe += +V1.totalFoodProductionEquivalent(dp, v) || 0;
    }
  } catch (e) { H.err(e); }
  return r;
};
process.on('exit', () => { try { if (last > 0) { flush(); if (!rec.snaps.some((s) => s.day === last)) { rec.win.push({ day: last, rows: winRows }); snap(last); } } } catch (e) { H.err(e); } save(); });
