'use strict';
// (@regress 없음 — 러너 밖 · T1408 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1408-observe.js — 밭 세계 인구 진단: 마을-달 줄(K 분해 · 출생 문 · 일 몫 · 곳간 며칠치 · 태어남 · 죽음) =========
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1408-observe.js" node scripts/t577-server-run.js <날> <시드>  (판 JSON 곁 `<판>-<시드>.t1408.json`)
//   `T1408_OUT=<파일>` 이면 그 자리. 존(아이)에서만 선다.
//   econ `tickVillage` 뒤에 그 마을 칸을 읽는다(쓰기 0):
//     pop · K · slot · prod · fuel(`_kDbg`) · logi · dP(`_dpDebug`) · 문 날 수(g74 = T1374 ② · g49 = T1149 · g97 = T1297 · g46 = T1346 · gh = 주거) ·
//     fdays(곳간 ÷ 사람 = 며칠치) · need(`t1374NeedDays`) · born(인구 차 + 죽음 차 — 캐러밴 0 판) · fd(굶어 죽음 차) · nat(늙어 죽음 차) · 일 몫(달 평균 counts) ·
//     gateBorn(문이 막은 날의 dP 합 — 문이 없었다면 태어났을 몫 · `_dpDebug.dP` 는 문 뒤 값이라 문 앞 값을 따로 센다)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = !SERVER ? '' : (process.env.T1408_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1408.json' : ''));
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
//   ★일 고르기 엿보기(메모리 글자 덧댐 · 제품 파일 손 0 · 바꾼 자리 수는 rec.hooks): 실현 배분 후보(`allocRealCandidates` 반환) · 고른 일(`pickDeficitJob_rational` 반환)
const ES = path.join(ROOT, 'sim', 'economy-sim.js');
const HOOKS = [
  ['function allocRealCandidates(v, world, cands, ctx) {', 'function allocRealCandidates(v, world, cands, ctx) { const __r = __arc0(v, world, cands, ctx); if (globalThis.__t1408c) globalThis.__t1408c(v, __r || cands, !!__r, ctx); return __r; }\nfunction __arc0(v, world, cands, ctx) {'],
  ['function pickDeficitJob_rational(v, world) {', 'function pickDeficitJob_rational(v, world) { const __j = __pdr0(v, world); if (globalThis.__t1408p) globalThis.__t1408p(v, __j); return __j; }\nfunction __pdr0(v, world) {'],
];
const HN = [];
//   ★[T1421 ④] 밭 일 늦음(세계 날 합 — 달마다 rec.late[ym] = [김매기 늦음 칸-날, 물대기 늦음 칸-날, 익어 기다림 칸-날, 품질 합, 품질 표본])
const VS = path.join(ROOT, 'server', 'villages.js');
const VHOOKS = [
  ['  if (!e || _cropRipe(e, day)) return;\n  _cropSky(e, day);', '  if (!e) return; if (_cropRipe(e, day)) { if (globalThis.__t1421L) globalThis.__t1421L(2, e); return; }\n  _cropSky(e, day);'],
  ['  else if (wd < L_WEEDS.length && gf >= L_WEEDS[wd] + 0.06) { e.q -= L_QW; _wm = 1; }', '  else if (wd < L_WEEDS.length && gf >= L_WEEDS[wd] + 0.06) { e.q -= L_QW; _wm = 1; if (globalThis.__t1421L) globalThis.__t1421L(0, e); }'],
  ['  if (nong && day - (e.w || e.p) >= L_WATERGAP + 8) e.q -= L_QW;', '  if (nong && day - (e.w || e.p) >= L_WATERGAP + 8) { e.q -= L_QW; if (globalThis.__t1421L) globalThis.__t1421L(1, e); } if (globalThis.__t1421L) globalThis.__t1421L(3, e);'],
  //   ★[T1421 덧붙임 ① ② ③] 밭이 일을 부른 날 · 밭 일손 초 · 선 작물 자라는 날(읽기만 — 빈 칸은 `_cellTask` 를 부르지 않는다: 빈 칸 갈래는 그날 심기 메모를 만들어 판을 바꿀 수 있다 → 달력의 심을 수 있는 달만 본다)
  ['function _lifeHeadlessDay(vil) {\n  _t1276Stand(vil);', 'function _lifeHeadlessDay(vil) {\n  if (globalThis.__t1421W && vil && vil._farmSet && vil._crop) { try { const __C = _Crops(), __E = _lifeEcon(), __d = _farmDay(vil, state.dayMs ? (T731_ON ? _ledgerDay(vil, _dayNow()) : gameDayOf(_dayNow())) : 0); let __w = 0, __e = 0, __gf = 0, __gw = 0; for (const k of vil._farmSet) { const e = vil._crop.get(k); if (!e) { __e++; continue; } if (_cellTask(vil, k, __d) > 0) __w++; } if (__C && __E) for (const [k, e] of vil._crop) { if (!e || !e.c) continue; const it = _t368Item(vil, k, e); if (it && it.u > 0) { const f = it.u * (__E.t368FoodPer(vil.econ, e.c) || 0); if (f > 0) { __gf += f; __gw += f * (__C.growDaysOf(e.c) || 0); } } } const __sow = __e > 0 && __C && (__C.sowableMonth(\'밭\', __C.monthOf(__d)).length + __C.sowableMonth(\'논\', __C.monthOf(__d)).length) > 0; globalThis.__t1421W(vil, __w, __sow ? __e : 0, __gf > 0 ? __gw / __gf : 0, _t1221DayS()); } catch (e) { globalThis.__t1421Err = String(e && e.stack || e).slice(0, 300); } }\n  _t1276Stand(vil);'],
  ['        if (_L) { _t1221Stat.usedS += _c; _t1221Stat.tasks++;', '        if (_L && globalThis.__t1421B) globalThis.__t1421B(vil, _c);\n        if (_L) { _t1221Stat.usedS += _c; _t1221Stat.tasks++;'],
  ['        if (_L && _ok) _t1221Stat.bodyS += _c;', '        if (_L && _ok && globalThis.__t1421B) globalThis.__t1421B(vil, _c);\n        if (_L && _ok) _t1221Stat.bodyS += _c;'],
];
{ const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (c, f) {
    if (f === VS) { for (const [a, b] of VHOOKS) { const n = c.split(a).length - 1; HN.push('v' + n); if (n === 1) c = c.replace(a, b); } return _c.call(this, c, f); }
    if (f !== ES) return _c.call(this, c, f);
    for (const [a, b] of HOOKS) { const n = c.split(a).length - 1; HN.push(n); if (n === 1) c = c.replace(a, b); }
    const r = _c.call(this, c, f); install(this.exports); return r;   // ★econ 을 다 읽은 뒤에 건다 — 다른 관찰기(t1388)의 글자 덧댐이 먼저든 뒤든 같이 선다(이 파일은 econ 을 먼저 읽지 않는다)
  }; }
let E = null;
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const JOBS = ['farmer', 'fisher', 'hunter', 'forager', 'lumberjack', 'miner', 'mason', 'smith', 'cook', 'tailor', 'warrior', 'trader', 'armorsmith'];
const COLS = ['ym', 'name', 'days', 'pop', 'popMin', 'popMax', 'K', 'slot', 'prod', 'fuel', 'logi', 'dP', 'g74', 'g49', 'g97', 'g46', 'gh', 'fdays', 'fdaysMin', 'need', 'born', 'fd', 'nat', 'gateBorn', 'happy', 'health', 'flow', 'fishCap', 'huntCap', 'forCap', 'cells', 'land', 'perCell', 'yearFood', 'g21', 'call', 'idleF', 'callF', 'dropI', 'dropC', 'labD', 'wcells', 'ecells', 'grow', 'labY'].concat(JOBS.map((j) => 'j_' + j));   // ★[T1421] K 풀이 · 한 해 문(날 합 — 달 평균은 ÷ days)
const rec = { cols: COLS, rows: [], wcols: ['day', 'pop', 'vils', 'fd', 'born', 'K', 'farmer'], w: [], first: {}, err: null, hooks: HN,
  //   일 고르기 — 달마다: picks[ym][일] = 뽑힌 수 · famine[ym] = 기근 블록(곳간 ÷ (다음 거둠 ÷ 30) < N × 30) 안에서 뽑힌 수 · cand[ym][일] = [실현 여부별 값 합, 표본 수, 실현 표본]
  picks: {}, famine: {}, cand: {} };
let __ymNow = null;
globalThis.__t1408p = (v, j) => { if (__ymNow == null || !j) return; const P = rec.picks[__ymNow] || (rec.picks[__ymNow] = {}); P[j] = (P[j] || 0) + 1;
  const N = (v.npcs || []).length || 1, fe = E.totalFoodEquivalent(v) / (E.T1374_FAMINE_HARV ? E.t1374NeedDays(v, (v._world && v._world.day) || 0) / 30 : 1);
  if (fe < N * 30) { const F = rec.famine[__ymNow] || (rec.famine[__ymNow] = {}); F[j] = (F[j] || 0) + 1; } };
rec.late = {};
globalThis.__t1421L = (k, e) => { if (__ymNow == null) return; const L = rec.late[__ymNow] || (rec.late[__ymNow] = [0, 0, 0, 0, 0]); if (k === 3) { L[3] += e.q || 0; L[4]++; } else L[k]++; };
//   ★[T1421 덧붙임] 마을(econ)마다 그날 밭 — FW.get(econ) = { w: 일 부른 칸, e: 심을 수 있는 빈 칸, g: 자라는 날 평균, dayS, labS: 오늘 일손 초, ring: 날마다 일손 초(한 해) }
const FW = new WeakMap();
const fwOf = (ec) => { let o = FW.get(ec); if (!o) { o = { w: 0, e: 0, g: 0, dayS: 0, labS: 0, ring: [], labY: 0, g0: 0 }; FW.set(ec, o); } return o; };
globalThis.__t1421W = (vil, w, e, g, dayS) => { if (!vil.econ) return; const o = fwOf(vil.econ); o.w = w; o.e = e; if (g > 0) o.g = g; o.dayS = dayS; };
globalThis.__t1421B = (vil, c) => { if (!vil.econ) return; fwOf(vil.econ).labS += +c || 0; };
rec.fv = {};   // 달마다 농부 1인 값(× ㉯ 열량 값 × 창) — [ⓐ ÷ 365 합, ⓑ ÷ 자라는 날 합, ⓒ ÷ 밭 일손 날 합, 표본]
globalThis.__t1408c = (v, cands, real, ctx) => {
  if (__ymNow != null && ctx && E && E.t1421FoodPrice) { try { const n = (ctx.counts && ctx.counts.farmer) || 0; if (n > 0) { const o = fwOf(v), Y = Math.max(v._t1276H || 0, v._t1276Stand || 0), k = E.t1421FoodPrice(v, ctx.w, 'kcal') * ctx.period;
    const F = rec.fv[__ymNow] || (rec.fv[__ymNow] = [0, 0, 0, 0]); F[0] += Y / 365 / n * k; F[1] += Y / (o.g > 0 ? o.g : 365) / n * k; F[2] += Y / Math.max(1, o.labY) * k; F[3]++; } } catch (e) {} } if (__ymNow == null) return; const C = rec.cand[__ymNow] || (rec.cand[__ymNow] = {});
  for (const [j, g] of cands) { const x = C[j] || (C[j] = [0, 0, 0]); x[0] += +g || 0; x[1]++; x[2] += real ? 1 : 0; } };
const M = new Map(), PREV = new WeakMap();
let curYm = null, curDay = -1, wd = null;
function flush() { for (const [name, m] of M) rec.rows.push(COLS.map((c) => c === 'ym' ? curYm : c === 'name' ? name : +(+(m[c] || 0)).toFixed(3))); M.clear(); }
function dump(fin) { try { if (fin && curYm != null) flush(); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }   // 중간 덤프는 달 줄을 안 끊는다(끝에만 남은 달을 적는다)
function install(EX) {
E = EX;
const _t = E.tickVillage;
E.tickVillage = function (v, day) {
  const p0 = PREV.get(v) || { pop: (v.npcs || []).length, dead: v._deadTot || 0, fd: v._fdDeadTot || 0, nat: v._natDeadTot || 0 };
  const r = _t.apply(this, arguments);
  try {
    const d = day | 0;
    if (d !== curDay) {
      if (wd) rec.w.push([wd.day, wd.pop, wd.vils, wd.fd, wd.born, +wd.K.toFixed(1), wd.farmer]);
      wd = { day: d, pop: 0, vils: 0, fd: 0, born: 0, K: 0, farmer: 0 }; curDay = d;
      const t = CAL.dateOf(d), ym = t.year * 100 + t.month;
      if (ym !== curYm) { if (curYm != null) flush(); curYm = ym; __ymNow = ym; }
      if (d % 30 === 0) dump();
    }
    const n = (v.npcs || []).length, kd = v._kDbg || {}, dp = v._dpDebug || {}, c = v.counts || {};
    const dead = v._deadTot || 0, fd = v._fdDeadTot || 0, nat = v._natDeadTot || 0;
    const born = Math.max(0, n - p0.pop + (dead - p0.dead));
    PREV.set(v, { pop: n, dead, fd, nat, f: (v.counts || {}).farmer || 0 });
    const tfe = E.totalFoodEquivalent(v), need = E.t1374NeedDays ? E.t1374NeedDays(v, d) : 0;
    let m = M.get(v.name); if (!m) { m = { days: 0, popMin: Infinity, popMax: 0, fdaysMin: Infinity }; M.set(v.name, m); }
    const add = (k, x) => { m[k] = (m[k] || 0) + (+x || 0); };
    m.days++; m.pop = n; m.popMin = Math.min(m.popMin, n); m.popMax = Math.max(m.popMax, n);
    add('K', (dp.K || 0)); add('slot', kd.slot); add('prod', kd.prod); add('fuel', kd.fuel); add('logi', dp.logi); add('dP', dp.dP);
    add('g74', v._t1374Gate ? 1 : 0); add('g49', v._t1149Gate ? 1 : 0); add('g97', v._t1297Gate ? 1 : 0); add('g46', v._t1346Gate ? 1 : 0); add('gh', dp.gated ? 1 : 0);
    const fdays = n > 0 ? tfe / n : 0; add('fdays', fdays); m.fdaysMin = Math.min(m.fdaysMin, fdays); add('need', need);
    add('born', born); add('fd', fd - p0.fd); add('nat', nat - p0.nat);
    if (v._t1374Gate) add('gateBorn', Math.max(0, (dp.logi || 0)));
    const st = v.lastStats || {}; add('happy', st.happiness); add('health', st.health);
    if (E.t1276FieldFlow) {   // ★[T1421 ②] prodK 풀이(PRODK_CAP 식 그대로 — 자리 만충 용량 · 관찰만)
      const cf = E.jobCapacity(v), J = E.JOBS, fR = (cf.fisher || 0) * J.fisher.base * (v.land.water || 0);
      const fishCap = (v.land.fishSustain != null && fR > 0) ? Math.min(fR, v.land.fishSustain) : fR;
      const huntCap = (cf.hunter || 0) * J.hunter.base * (v.land.game || 0);
      let fyS = 0, fyF = 0; try { const fy = E.foragerYieldsFor(v); for (const r in fy) { fyS += fy[r]; fyF += fy[r] * (E.FORAGE_FOOD_FACTOR[r] || (r === 'food' ? 1 : 0)); } } catch (_) {}
      const fRaw = Math.floor((cf.forager || 0) * 0.5) * J.forager.base * J.forager.landBoost(v), forCap = ((v.land.forageSustain != null && fRaw > 0) ? Math.min(fRaw, v.land.forageSustain) : fRaw) * (fyS > 0 ? fyF / fyS : 0);
      const cells = v._fieldCells || 0, land = v._t1421Land > 0 ? v._t1421Land : (v._clearedFrac > 0 ? cells / v._clearedFrac : cells);
      add('flow', E.t1276FieldFlow(v)); add('fishCap', fishCap); add('huntCap', huntCap); add('forCap', forCap); add('cells', cells); add('land', land);
      add('perCell', v._t1421PerCell || 0); add('yearFood', E.t1421YearFood ? E.t1421YearFood(v) : 0); add('g21', v._t1421Gate ? 1 : 0);
    }
    {   // ★[T1421 덧붙임 ① ②] 밭이 일을 부른 날(선 칸의 일 > 0 ∨ 심을 수 있는 달의 빈 칸) · 그날 농부 · 농부에서 빠진 수 · 밭 일손 날(오늘 · 지난 한 해)
      const o = fwOf(v), fN = c.farmer || 0, call = (o.w > 0 || o.e > 0) ? 1 : 0, drop = Math.max(0, (p0.f != null ? p0.f : fN) - fN);
      add('call', call); if (call) { add('callF', fN); add('dropC', drop); } else { add('idleF', fN); add('dropI', drop); }
      o.ring.push(o.labS); if (o.ring.length > 365) o.ring.shift(); o.labY = o.dayS > 0 ? o.ring.reduce((x, y) => x + y, 0) / o.dayS : 0;
      add('labD', o.dayS > 0 ? o.labS / o.dayS : 0); o.labS = 0; add('wcells', o.w); add('ecells', o.e); add('grow', o.g); add('labY', o.labY);
    }
    for (const j of JOBS) add('j_' + j, c[j] || 0);
    if (!rec.first[v.name]) rec.first[v.name] = { day: d, pop: n, tfe: +tfe.toFixed(2), need, land: v.land ? { fertility: v.land.fertility, water: v.land.water, game: v.land.game, wood: v.land.wood } : null, type: v.type || null };
    wd.pop += n; wd.vils += n > 0 ? 1 : 0; wd.fd += fd - p0.fd; wd.born += born; wd.K += dp.K || 0; wd.farmer += c.farmer || 0;
  } catch (e) { rec.err = String(e && e.stack || e).slice(0, 400); }
  if (globalThis.__t1421Err) rec.err1421 = globalThis.__t1421Err;
  return r;
};
}
// 달 평균 칸 — 쓸 때 나눈다(읽는 쪽: K · slot · prod · fuel · logi · dP · fdays · need · happy · health · j_* 는 합 ÷ days)
process.on('exit', () => dump(1));
process.on('SIGTERM', () => { dump(1); process.exit(0); });
