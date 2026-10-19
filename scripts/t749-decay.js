// === scripts/t749-decay.js — T749 부패 문 계측(읽기만 · 제품 무접촉) ==========================================
//
// ★왜 [T749 ① ②] T726 켬에서 생선이 첫 60일 ×4.4 썩는다(T739 §5). 부패량 = `tickDecay` 식의 어느 항인지,
//   보유 수요를 지운 목표(켬)에서 생선 목표가 얼마로 내려가는지(마을 · 날), 그리고 그 양이 물리 정본(`server/spoil.js` 곡선 ·
//   곳간 로트 장부 `server/granary-lots.js`)과 같은 날 같은 양인지 — 엔진은 그 장부를 따로 갖고 있지 않다.
//
// 어떻게(세계에 쓰는 것 0):
//   ① `economy-sim-v2.js` 를 **적재할 때 메모리 사본만** 고친다(디스크 무변 · t739-arms 와 같은 문법). 고치는 것은 셋:
//      · `tickDecay` 첫 줄에 관측 훅 `__T749_PRE(v)`(마을 하나 · 부패 앞)
//      · 품목 줄 `v.storage[r] = s * (1 - rate)` 앞에 관측 훅 `__T749_DEC(…)`(그 품목의 곳간 · 쓴 목표 · 과잉 · 율 · 옹기 배율)
//      · 모듈 끝에 내부 이름 몇을 읽는 표 `__T749_IN`(목표 함수 둘 · 표 넷 — 읽기만)
//      훅은 값을 돌려주지 않고 세계를 안 만진다. 반사실 목표(끔 식 · 켬 식)를 같은 상태에서 다시 셀 때 결정층 함수가
//      그날의 유효수요 캐시(`world._effDemCache`)를 처음 채울 수 있다 — 부른 뒤 캐시를 **부르기 전 그 객체로 되돌린다**.
//   ② `T749_LEDGER=1`(순간 로트 켬 — ★[T778] 켬 기본 · `T732_MOMENT_LOT=0` 이면 못 붙인다)이면 제품의 곳간 로트 장부(T732 — 관측자 · econ 값 무변)를 CLI 세계에 붙인다:
//      시계 = econ 날(하루 마감 = 한 순간 · 서버와 같은 규약) · `attach` · `setLotHook`(캐러밴 짐) · 하루 앞 `tickBegin` · 뒤 `sync`/`tickEnd`.
//      부패 앞(`__T749_PRE`)에서 생선 · 고기 장부를 읽어 — 보관일(`spoil.shelfOf`)을 넘긴 몫(서 있는 상한 몫) · 오늘 넘긴 몫 ·
//      단위 가중 나이를 센다(노출 = `spoil.exposureAt` 정본 · 곳간 자리 seal 0.70 · damp 0.55 · 고도 0 = 장부가 쓰는 그 값).
//   검산: 훅 판(장부 포함)의 t17 JSON = 훅 없는 판(보고 §0).
//
// 쓰는 법: NODE_OPTIONS="--require <레포>/scripts/t749-decay.js" T749_OUT=/tmp/x.json [T749_LEDGER=1] node scripts/t17-metrics.js 800 1020
//   자리 갈래와 같이: NODE_OPTIONS="--require <레포>/scripts/t739-arms.js --require <레포>/scripts/t749-decay.js"(이 차례 — 이 문이 바깥이라야 둘 다 선다)
// 결정론 — 새 수 0(보관일 · 자리 · 곡선은 정본에서 읽는다).
'use strict';
const OUT = process.env.T749_OUT || '';
if (OUT) {
  const Module = require('module'), fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const PATCH = [
    ['function tickDecay(v) {', 'function tickDecay(v) { if (globalThis.__T749_PRE) globalThis.__T749_PRE(v);'],
    ['    v.storage[r] = s * (1 - rate);\n',
      '    if (globalThis.__T749_DEC) globalThis.__T749_DEC(v, r, s, target, xm, excess, rate, baseRate, _potMul, _founding);\n    v.storage[r] = s * (1 - rate);\n'],
  ];
  const TAIL = '\n;globalThis.__T749_IN = { _targetCtxV2, _targetV2, SUBSISTENCE_PER_NPC, UTILITY_WEIGHT, subsGuard, DECAY_V2, DECAY_EXCESS_MULT, POTTERY_FOODS, VARIETY_FOOD, VARIETY_TARGET_PC };\n';
  const prev = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, f) {
    if (path.basename(f) === 'economy-sim-v2.js' && path.basename(path.dirname(f)) === 'sim') {
      const orig = m._compile;
      m._compile = function (c, fn) {
        for (const [a, b] of PATCH) {
          const n = c.split(a).length - 1;
          if (n !== 1) throw new Error(`t749-decay: 고칠 줄이 ${n}개 — 하나여야 한다(제품이 바뀌었다 · 이 문을 고칠 것): ${a.trim()}`);
          c = c.replace(a, b);
        }
        return orig.call(this, c + TAIL, fn);
      };
    }
    return prev(m, f);
  };

  const v2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const v1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const IN = globalThis.__T749_IN;
  if (!IN) throw new Error('t749-decay: 내부 표를 못 읽었다(적재 차례 — 이 문이 economy-sim-v2 보다 먼저 실려야 한다)');
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const LEDGER = process.env.T749_LEDGER === '1';
  let Lots = null, G = null;
  if (LEDGER) {
    if (process.env.T732_MOMENT_LOT === '0') throw new Error('t749-decay: T749_LEDGER=1 은 T732_MOMENT_LOT=0 과 같이 못 쓴다(장부가 순간 시계를 쓴다)');   // ★[T778] 켬 기본 — 끔 = `=0` 만
    Lots = require(path.join(ROOT, 'server', 'lots.js'));
    G = require(path.join(ROOT, 'server', 'granary-lots.js'));
  }
  const DAYMS = 1440000;   // 시계 눈금(게임 ms/일) — 노출은 날의 소수로만 읽으니 값은 결과에 안 닿는다
  let CLOCK = 0;
  if (LEDGER) Lots.setClock(() => CLOCK, DAYMS);

  const FG = ['fish', 'meat'];                       // 마을 × 날 줄을 적는 품목
  const WG = ['fish', 'meat', 'food', 'cooked_food', 'fruit', 'vegetable', 'mushroom', 'wheat', 'rice', 'barley', 'charcoal', 'hide', 'bone', 'weapon'];
  const SHELF = {}; for (const g of FG) SHELF[g] = Spoil.shelfOf(g);
  // 둘째 읽기(08-31 부패 배치 G-4 "곳간의 생선은 이미 말린 생선") — 그 보존식의 보관일(정본 `PRESERVED_ITEMS`)
  const SHELF2 = { fish: Spoil.shelfOf('dried_fish'), meat: Spoil.shelfOf('smoked_meat') };
  const r5 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toPrecision(5) : (x == null ? null : x);
  // 끔 식(tickDecay 의 종전 네 항 — 같은 이름 같은 차례) · 어느 항이 묶나: 0 자급 · 1 보유 수요 · 2 흐름 · 3 파생
  function tOffOf(v, r, N) {
    const subs = (IN.SUBSISTENCE_PER_NPC[r] || 0) * N;
    const util = IN.UTILITY_WEIGHT[r] || 0.1;
    const flowT = IN.subsGuard(r, 'price') ? 0 : ((v._consEMA || {})[r] || 0) * 30;
    const buffer = N * (util * 1.2);
    const derivT = v1.derivedInputTarget ? v1.derivedInputTarget(v, r) : 0;
    const a = [subs * 30, buffer, flowT, derivT];
    let t = -Infinity, b = -1; for (let i = 0; i < 4; i++) if (a[i] > t) { t = a[i]; b = i; }
    return { t, b, flowT, buffer, derivT };
  }
  // 켬 식(결정층 `_targetV2` 그대로) · 어느 항이 묶나: 0 자급 · 2 흐름 · 3 파생 · 4 다양성 · 5 영(바닥 1 이 문턱)
  function tOnOf(v, r, ctx, N, off) {
    const w = v._world, had = !!w && Object.prototype.hasOwnProperty.call(w, '_effDemCache'), keep = had ? w._effDemCache : undefined;
    let T;
    try { T = IN._targetV2(v, r, ctx).target; } finally { if (w) { if (had) w._effDemCache = keep; else delete w._effDemCache; } }
    let b;
    if (!(T > 0)) b = 5;
    else if (Math.abs(T - (IN.SUBSISTENCE_PER_NPC[r] || 0) * N * 30) < 1e-9) b = 0;
    else if (IN.VARIETY_FOOD[r] && Math.abs(T - N * IN.VARIETY_TARGET_PC) < 1e-9) b = 4;
    else if (Math.abs(T - off.flowT) < 1e-9) b = 2;
    else if (Math.abs(T - off.derivT) < 1e-9) b = 3;
    else b = 6;   // 그 밖(유효수요 상한 등 — 생선 · 고기에는 안 걸린다)
    return { t: T, b };
  }
  // 장부 읽기 — 보관일을 넘긴 몫 · 오늘 넘긴 몫 · 단위 가중 나이(날) · 노출
  function ledgerOf(v, r, D) {
    if (!G || !G.attached(v)) return null;
    const arr = G.ledger(v, r) || [];
    let U = 0, sp = 0, cr = 0, age = 0, ex = 0, sp2 = 0, cr2 = 0;
    const sh = SHELF[r], sh2 = SHELF2[r];
    for (const rec of arr) {
      const u = +rec.u || 0; if (!(u > 0)) continue;
      const e1 = Spoil.exposureAt(rec, D, 0);
      const k0 = rec.k / DAYMS;
      const e0 = (k0 <= D - 1) ? Spoil.exposureAt(rec, D - 1, 0) : 0;
      U += u; age += u * Math.max(0, D - k0); ex += u * e1;
      if (e1 >= sh) { sp += u; if (e0 < sh) cr += u; }
      if (e1 >= sh2) { sp2 += u; if (e0 < sh2) cr2 += u; }
    }
    return { U, sp, cr, age: U > 0 ? age / U : 0, ex: U > 0 ? ex / U : 0, sp2, cr2 };
  }

  const T = { meta: { knob: process.env.T726_ONE_TARGET || '', sites: process.env.T739_SITES || '', dgoods: process.env.T739_DGOODS || '', dexcept: process.env.T739_DEXCEPT || '',
    foodCons: process.env.T263_FOOD_CONS || '', ledger: LEDGER, FG, WG, shelf: SHELF, shelf2: SHELF2, names: null,
    vcols: ['N', 's', 'tUsed', 'tOff', 'tOn', 'bOff', 'bOn', 'rate', 'dec', 'decBase', 'flowT', 'prodPC', 'foodPC', 'potMul', 'xm', 'LU', 'Lspoiled', 'Lcross', 'Lage', 'Lexp', 'Lspoiled2', 'Lcross2'],
    wcols: ['dec', 'decBase', 'decExc', 'clampN', 'stock'] },
    v: {}, w: [], ledgerStats: null };
  for (const g of FG) T.v[g] = [];
  T.meta.first = [];   // 마을마다 처음 본 날(줄 i 의 날 = first + i)
  let W = null, names = null, day = 0, pre = null, wrec = null;
  const vidx = new WeakMap();   // 마을 → 영구 번호(처음 본 차례 — 배열에서 빠져도 안 바뀐다)
  const grow = () => { for (const v of W.villages) if (!vidx.has(v)) { vidx.set(v, names.length); names.push(v.name); T.meta.first.push(day); for (const g of FG) T.v[g].push([]); } };

  globalThis.__T749_PRE = function (v) {
    const k = vidx.get(v); if (k == null) { pre = null; return; }
    const N = v.npcs.length || 1;
    const ctx = IN._targetCtxV2(v);
    pre = { k, N, rows: {} };
    for (const g of FG) {
      const off = tOffOf(v, g, N);
      const on = tOnOf(v, g, ctx, N, off);
      const L = ledgerOf(v, g, day);
      pre.rows[g] = { off, on, L, prodPC: ((v.dailyProductionBuf || {})[g] || 0) / N, foodPC: (v.storage.food || 0) / N };
    }
  };
  globalThis.__T749_DEC = function (v, r, s, target, xm, excess, rate, baseRate, potMul, founding) {
    const pot = IN.POTTERY_FOODS[r] ? potMul : 1;
    const dec = s * rate, base = s * Math.min(0.95, baseRate * pot);
    const wi = WG.indexOf(r);
    if (wi >= 0 && wrec) { const o = wi * 5; wrec[o] += dec; wrec[o + 1] += base; wrec[o + 2] += dec - base; if (rate >= 0.95) wrec[o + 3] += 1; wrec[o + 4] += s; }
    if (FG.includes(r) && pre && vidx.get(v) === pre.k) {
      const P = pre.rows[r], L = P.L || {};
      const rows = T.v[r][pre.k];
      while (T.meta.first[pre.k] + rows.length < day) rows.push(null);   // 그 마을이 부패 문을 안 지난 날(인구 0 등) — 빈 칸
      rows.push([pre.N, s, target, P.off.t, P.on.t, P.off.b, P.on.b, rate, dec, base, P.off.flowT, P.prodPC, P.foodPC, pot, xm,
        L.U, L.sp, L.cr, L.age, L.ex, L.sp2, L.cr2].map(r5));
    }
  };

  const _tick = v2.tickWorldV2;
  v2.tickWorldV2 = function (world) {
    day = world.day + 1;
    if (!W) {
      W = world; names = []; grow();
      if (LEDGER) { CLOCK = day * DAYMS; for (const v of world.villages) G.attach(v, null, CLOCK); v2.setLotHook(G.hooks); }
    }
    grow();
    CLOCK = day * DAYMS;
    wrec = new Float64Array(WG.length * 5);
    if (LEDGER) G.tickBegin();
    // 마을이 head 에서 늘 수 있다 — 훅은 vidx 에 없는 마을을 건너뛴다(다음 날부터 적는다)
    const r = _tick.apply(this, arguments);
    if (LEDGER) { G.sync(world.villages); G.tickEnd(); }
    grow();
    T.w.push([world.day, ...Array.from(wrec, r5)]);
    return r;
  };
  process.on('exit', () => {
    try {
      T.meta.names = names;
      if (LEDGER) { T.ledgerStats = G.stats(); const ck = G.check(W ? W.villages : [], 1e-6); T.ledgerCheck = { cells: ck.cells, bad: ck.bad.length, badSample: ck.bad.slice(0, 5) }; }
      const body = JSON.stringify(T);
      fs.writeFileSync(OUT, /\.gz$/.test(OUT) ? require('zlib').gzipSync(body) : body);
    } catch (e) { process.stderr.write('[t749-decay] 쓰기 실패 ' + e.message + '\n'); }
  });
}
