'use strict';
// (@regress 없음 — 러너 밖 · T1243 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1243-observe.js — 밭 세계 켬 판: 날마다 세계 합 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 =====================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1243-observe.js" node scripts/t577-server-run.js 100 1020   (판 JSON 곁 `<판>-<시드>.t1243.json`)
//   날마다(econ `tickVillage` 첫 마을 머리): 인구 · 사람 있는 마을 · 곳간 식량등가(`totalFoodEquivalent`) · 거둔 건수(`_t100HarvestN`) ·
//     거둔 낱개 → kg(`_t368InByItem` × 작물 `kgOf`) · 작물 없는 수확(`_t1243NoCrop`) · 몸 농부 · econ 농부 · 나무꾼
//   첫날: 마을마다 첫 곳간 품목(`_t1243Seed`) · 끝: `_t1243Stat` · `_t1221Stat` · `_t1212Rest`(일괄이 정말 0 인가)
//   ★[T1244] 덧붙인 칸 — 날마다 CPU 초 · 10날마다 빈 마을 · 밭 · 심은 칸 · 굶음 · 첫 곳간 상한 몫 · (`T1244_BODY_MS`) 몸 상태 표본(아래 T1244 줄)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1243.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'pop', 'vils', 'tfe', 'harvN', 'kg', 'noCrop', 'bodyFarmer', 'econFarmer', 'lumber', 'bodies'], rows: [], seed: null, stat: null, err: null };
let last = -1, VIL = null, C = null;
function snap(day) {
  if (!VIL) { VIL = require(path.join(ROOT, 'server', 'villages')); C = require(path.join(ROOT, 'server', 'crops')); }
  const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
  const players = (B.state.deps && B.state.deps.players) || new Map();
  let pop = 0, vils = 0, tfe = 0, harvN = 0, kg = 0, noCrop = 0, bf = 0, ef = 0, lj = 0, bodies = 0;
  for (const vil of (P.villages || [])) {
    const e = vil.econ || {}, n = (e.npcs || []).length;
    pop += n; if (n) vils++;
    tfe += V1.totalFoodEquivalent ? V1.totalFoodEquivalent(e) : 0;
    harvN += e._t100HarvestN || 0; noCrop += e._t1243NoCrop || 0;
    for (const [id, u] of Object.entries(e._t368InByItem || {})) kg += u * (C.kgOf(id) || 0);
    ef += (e.counts && e.counts.farmer) || 0; lj += (e.counts && e.counts.lumberjack) || 0;
    for (const pid of (vil.npcPids || [])) { const p = players.get(pid); if (!p) continue; bodies++; if (p.simJob === 'farmer') bf++; }
  }
  rec.rows.push([day, pop, vils, +tfe.toFixed(1), harvN, +kg.toFixed(1), noCrop, bf, ef, lj, bodies]);
  if (!rec.seed) rec.seed = (P.villages || []).map((v) => ({ n: v.name, pop: ((v.econ || {}).npcs || []).length, s: (v.econ || {})._t1243Seed || null }));
  rec.stat = { t1243: B._t1243Stat || null, t1221: B._t1221Stat || null, rest: B._t1212Rest || null, t1224: B._t1224Stat || null, pick: B._t1243PStat || null };
  if (day % 10 === 0) rec.crops = (P.villages || []).map((v) => { const by = {}; for (const e of (v._crop || new Map()).values()) if (e && e.c) by[e.c] = (by[e.c] || 0) + 1; const pv = {}; for (const x of ((v._t1243Prev || new Map()).values())) pv[x.c] = (pv[x.c] || 0) + 1;
    const sd = {}; for (const [k, n] of Object.entries((v.econ || {}).storage || {})) if (/^seed_|_seed$|씨/.test(k) || (C.seedOf && k.startsWith(C.seedOf('')))) sd[k] = +(+n).toFixed(2);
    return { n: v.name, f: +((((v.econ || {}).land || {}).fertility) || 0).toFixed(3), farm: v._farmSet ? v._farmSet.size : 0, dry: v._drySet ? v._drySet.size : 0, stand: by, prev: pv, seed: sd, day }; });
  t1244Day(day, P, B, bodies);   // ★[T1244] 아래
  if (day % 5 === 0) fs.writeFileSync(OUT, JSON.stringify(rec));
}
// ── ★[T1244] 덧붙인 칸(읽기만 · 위 칸 · 끝 꼴 무변 — 새 칸 셋만 더 실린다) ──────────────────────────────────────
//   `rec.cpu`  날마다 [날 · 그날 CPU 초(사용자 + 시스템 · `process.cpuUsage` — 가상 시계가 안 건드린다) · 그날 벽 초(`process.uptime`) · 몸 수]
//   `rec.ten`  10날마다 한 줄 — 빈 마을(`_everPop` · 인구 0 · 판 JSON 과 같은 식) · 밭 칸 · 선 작물 칸 · 심은 칸(`_crop` 의 심은 날 `p` 를 날마다 훑어 센 누계 — 두 판 같은 자) ·
//              굶음(몸 층 `bodyExitStats().died.starve` · econ 식량 빚 사망 `_fdDeadTot`) · 죽음 누계 · 켬 셈(`_t1243PStat` 심음 · 거둠) ·
//              첫 곳간(켬 = 그 마을 `_t1243Seed.crops` · 끔 = `food`): 곳간 장부(`granary-lots` · 켬 기본)의 첫 레코드(첫 관측 때 가장 이른 열쇠 이하) 남은 단위 · 그중 상한 단위(`spoil` 정본 — `freshOf` 와 같은 식)
//              · 그 품목 곳간 몫 전체 단위 · 상한 단위(`freshOf`)
//   `rec.body` (`T1244_BODY_MS` > 0 일 때만 · 기본 0 = 끔) 가상 시계 간격마다 몸 상태 표본(t1231 `stateOf` 와 같은 가름 — 걸음 뒤 상태 · 감싸기 없음) · 날마다 { 상태: 몸-표본 }
//   쓰기는 위 5날 쓰기 그대로(10날 줄도 그 쓰기가 덮는다 · 끊긴 판도 그 날까지 남는다).
const _cpu0 = { u: process.cpuUsage(), w: process.uptime() };
rec.cpu = []; rec.ten = []; rec.body = {};
const _scan = new Map();   // 마을 → 앞 훑음의 날(심은 칸 셈)
let _sown = 0, _scanDay = null, _gran = null;
function _granMods() { if (_gran === null) { try { _gran = { GL: require(path.join(ROOT, 'server', 'granary-lots')), S: require(path.join(ROOT, 'server', 'spoil')), L: require(path.join(ROOT, 'server', 'lots')) }; } catch (e) { _gran = false; } } return _gran || null; }
const _k0 = new Map();   // 'mark|품목' → 첫 관측 때 가장 이른 열쇠
function t1244Day(day, P, B, bodies) {
  const u = process.cpuUsage(), w = process.uptime();
  rec.cpu.push([day, +(((u.user - _cpu0.u.user) + (u.system - _cpu0.u.system)) / 1e6).toFixed(2), +(w - _cpu0.w).toFixed(2), bodies]);
  _cpu0.u = u; _cpu0.w = w;
  // 심은 칸 — 앞 훑음 날 ≤ p < 오늘
  for (const vil of (P.villages || [])) {
    const from = _scanDay;
    if (from != null && vil._crop) for (const e of vil._crop.values()) if (e && e.c && e.p >= from && e.p < day) _sown++;
  }
  _scanDay = day;
  if (day % 10 !== 0) return;
  let empty = 0, farm = 0, stand = 0, fd = 0, dead = 0;
  for (const vil of (P.villages || [])) {
    const e = vil.econ || {}, n = (e.npcs || []).length;
    if (e._everPop && n === 0) empty++;
    farm += vil._farmSet ? vil._farmSet.size : 0;
    if (vil._crop) for (const x of vil._crop.values()) if (x && x.c) stand++;
    fd += e._fdDeadTot || 0; dead += e._deadTot || 0;
  }
  let bx = null; try { bx = VIL.bodyExitStats ? VIL.bodyExitStats() : null; } catch (e) { bx = null; }
  const G = { firstU: 0, firstBadU: 0, itemU: 0, itemBadU: 0, vils: 0, att: 0 };
  const M = _granMods();
  if (M && M.GL && typeof M.GL.ledger === 'function') {
    const nd = M.L && M.L.dayMs ? M.L.dayMs() : null, nn = M.L && M.L.nowMs ? M.L.nowMs() : null;
    const today = nd && nn != null ? Math.floor(nn / nd) : null;
    for (const vil of (P.villages || [])) {
      const ev = vil.econ; if (!ev) continue;
      const items = (ev._t1243Seed && ev._t1243Seed.crops) ? ev._t1243Seed.crops : ['food'];
      G.vils++; if (!M.GL.attached(ev)) continue; G.att++;
      for (const id of items) {
        const arr = M.GL.ledger(ev, id) || [];
        const key = vil.name + '|' + id;
        if (!_k0.has(key)) { let mk = Infinity; for (const r of arr) if (r && r.k < mk) mk = r.k; _k0.set(key, mk); }
        const K0 = _k0.get(key);
        for (const r of arr) {
          if (!r) continue;
          let f = 1; if (today != null) { try { f = M.S.freshnessOf(id, M.S.exposureOf(Object.assign({}, r, { k: r.k }), today, 0)); } catch (e) { f = 1; } }
          G.itemU += r.u; if (f <= 0) G.itemBadU += r.u;
          if (r.k <= K0) { G.firstU += r.u; if (f <= 0) G.firstBadU += r.u; }
        }
      }
    }
    for (const k of Object.keys(G)) G[k] = +(+G[k]).toFixed(2);
  }
  const ps = B._t1243PStat || null;
  rec.ten.push({ day, empty, farm, stand, sown: _sown, fdDead: +fd.toFixed(2), deadTot: +dead.toFixed(2),
    starve: bx && bx.died ? bx.died.starve : null, old: bx && bx.died ? bx.died.old : null,
    pick: ps ? ps.pick : null, reaped: ps ? ps.reaped : null, seedUse: ps ? (ps.seedUse || 0) : null,
    seedUnits: B._t1243Stat ? B._t1243Stat.seedUnits : null, gran: G });
}
// 몸 상태 표본 — 가상 시계 간격(아이 존 · 읽기만)
const BODY_MS = +(process.env.T1244_BODY_MS || 0);
if (BODY_MS > 0) {
  const WORK = new Set(['경작', '수확', '낚시', '드리움', '놓침', '낚음', '벌목', '채석', '채광', '제작', '수색', '채집', '파종', '모내기', '김매기', '추수', '사냥', '건축', '개간']);
  const WALK = new Set(['출근', '귀가', '운반', '저장', '인출']);
  const REST = new Set(['휴식', '요양']);
  const OTHER = new Set(['대피', '장마당']);
  const stateOf = (npc) => {   // t1231-observe.js `stateOf` 와 같은 가름
    const act = npc._lifeAct || '', beh = npc.behavior || '';
    const mv = Math.hypot(npc.vx || 0, npc.vy || 0) > 1;
    if (beh === 'fight' || beh === 'flee' || OTHER.has(act) || npc.canadiaTask) return 'other';
    if (act === '취침') return mv ? 'walk' : 'sleep';
    if (act === '식사') return 'eat';
    if (WALK.has(act)) return 'walk';
    if (WORK.has(act) || beh === 'gather' || beh === 'plant' || beh === 'harvest') return mv ? 'walk' : 'work';
    if (REST.has(act)) return mv ? 'wander' : 'rest';
    return mv ? 'wander' : 'rest';
  };
  setInterval(() => {
    try {
      if (!VIL) return;
      const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
      const players = (B.state.deps && B.state.deps.players) || new Map();
      const day = (B.state && B.state.world && B.state.world.day) | 0;
      const d = rec.body[day] || (rec.body[day] = { work: 0, walk: 0, wander: 0, rest: 0, sleep: 0, eat: 0, other: 0, n: 0 });
      d.n++;
      for (const vil of (P.villages || [])) for (const pid of (vil.npcPids || [])) { const p = players.get(pid); if (p) d[stateOf(p)]++; }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  }, BODY_MS);
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} });
