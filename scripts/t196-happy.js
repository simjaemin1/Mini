#!/usr/bin/env node
// === scripts/t196-happy.js — T196: 마을 행복 항별 귀속 (서버 51 · 랩 8) =====================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `scripts/t17-metrics.js`·`lab-alloc-server.js` 와 **같은 문**으로 세운다(사본이 아니라 같은 절차 · 족보 130).
// ⚠**코드 0.** `sim/economy-sim.js` 는 한 바이트도 안 고친다. 정본의 `_computeVillageStats` 는
//   내보내기가 없으므로, 이 계측기는 **그 파일의 소스를 그대로 읽어** 끝에 *내보내기 한 줄만* 붙여
//   `require.cache` 에 심는다(= 세계 전체가 그 한 인스턴스를 쓴다 · 동작 무변). 항 분해는
//   **그 정본 함수를 부른다**(사본 0) — 수식을 다시 적지 않는다.
//
// 항 분해는 **되돌림(ablation)** 이다 — 입력 하나를 0 으로 만든 사본을 정본 함수에 다시 넣고 차이를 본다:
//     저장효용 = f(v) − f(v, storage:{})        다양성 = f(v) − f(v, _foodEaten:{})
//     여가     = f(v) − f(v, _idleFrac:0)       가죽   = f(v) − f(v, _lgCov:0)
//     의복품질 = f(v) − f(v, _clothQ:0)         한랭의복 = [f(v) − f(v, _clothCov:0)] − 의복품질
//   항이 전부 더하기라 **합 = 전체**여야 한다 — 매 표본마다 확인하고 어긋나면 빨개진다.
//
// 실행: node scripts/t196-happy.js [일수=800] [시드=1020]
//   T196_HW=0.24            ← T165 켠 팔(`world.happyWorkW` · 코드 무접촉 · `batch/happywork-port-0910` 계수)
//   T196_TRACE=농촌10,광산1  ← 그 마을들의 10일 궤적(행복 · 배수 · 인구 · 항)
//   T196_JSON=/tmp/x.json   ← 표를 JSON 으로도
//   T196_LAB=/tmp/lab.json  ← 랩에서 뽑은 마을 상태(같은 항으로 갈라 읽는다 · 서버 대신)
//   --lab                   ← 랩(`lab/전쟁실험실.html`)을 직접 띄워 **같은 항 표**를 뽑는다(8마을)
//   T196_NOPRNG=1           ← 랩에서 `Math.random` 고정 주입을 **안 한다**(랩 제 씨앗만 · 세계가 달라진다)
//   T196_NVIL=8             ← 랩 마을 수
//                              랩에서도 후크는 같다 — `lastStats` 쓰기 자리에서 입력을 찍고,
//                              분해는 **node 쪽 정본 함수**가 한다(사본 0). 찍은 값으로 다시 부른 값이
//                              랩의 `lastStats.happiness` 와 **한 자도 안 달라야** 한다(자기검사).
//   T196_SAMPLE=10          ← 표본 간격(일)
//
// ⚠**표본은 정본이 재는 그 순간**이다. 틱 중간에 재고·여가가 또 움직이므로 틱 뒤에 다시 계산하면
//   `lastStats` 와 안 맞는다(실측 최대차 0.30 · 여가는 통째로 0 이 된다). 그래서 마을의 `lastStats`
//   **쓰기**에 접근자를 달아(정본 무접촉) `v.lastStats = stats` 바로 그 자리에서 입력을 찍는다 —
//   `_computeVillageStats` 가 돌아온 직후이고 그 사이엔 산술뿐이라 **정본이 본 입력 그대로**다.
//   자기검사가 그것을 증명한다: 찍은 입력으로 다시 부른 값 = `lastStats.happiness` (차 0).
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t196-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── ★정본 한 인스턴스 + 내보내기 한 줄(파일 무접촉) ──────────────────────────
const ECON_FILE = path.join(ROOT, 'sim', 'economy-sim.js');
const _src = fs.readFileSync(ECON_FILE, 'utf8');
const _addend = '\nmodule.exports.__t196_stats = _computeVillageStats;\n';
{
  const m = new Module(ECON_FILE, null);
  m.filename = ECON_FILE;
  m.paths = Module._nodeModulePaths(path.dirname(ECON_FILE));
  require.cache[ECON_FILE] = m;          // ★순환 require 도 이 인스턴스를 본다
  m._compile(_src + _addend, ECON_FILE);
  m.loaded = true;
}

const _av = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = parseInt(_av[0], 10) || 800;
const SEED = parseInt(_av[1], 10) || 1020;
const HW = parseFloat(process.env.T196_HW || '0') || 0;
const TRACE = (process.env.T196_TRACE || '').split(',').map((s) => s.trim()).filter(Boolean);
const LABIN = process.env.T196_LAB || '';

const LABMODE = process.argv.indexOf('--lab') >= 0;
const econ = R('sim/economy-sim');
const F = econ.__t196_stats;
if (typeof F !== 'function') { console.error('정본 함수를 못 잡았다'); process.exit(1); }

// ── 항 분해 — 정본 함수만 부른다(사본 0) ─────────────────────────────────────
const TERMS = ['저장효용', '다양성', '여가', '한랭의복', '의복품질', '가죽제품'];
function decompose(v, N) {
  const h = (o) => F(Object.assign({}, v, o), N).happiness;
  const full = h({});
  const t = {};
  t['저장효용'] = full - h({ storage: {} });
  t['다양성'] = full - h({ _foodEaten: {} });
  t['여가'] = full - h({ _idleFrac: 0, _tradingN: 0 });
  t['가죽제품'] = full - h({ _lgCov: 0 });
  t['의복품질'] = full - h({ _clothQ: 0 });
  t['한랭의복'] = (full - h({ _clothCov: 0 })) - t['의복품질'];
  let s = 0; for (const k of TERMS) s += t[k];
  t.__full = full; t.__sum = s; t.__gap = s - full;
  return t;
}

function mulOf(hp) { return HW > 0 ? econ.happyWorkMul(hp, HW) : (1 + (hp - 0.5) * 0.24); }   // ★끈 팔에선 '켜면 될 배수'(가정 H=0.24)

// ── ★표본 후크 — 정본이 `v.lastStats = stats` 하는 그 자리(코드 0 · 접근자만) ─
const SAMPLE = parseInt(process.env.T196_SAMPLE || '10', 10) || 10;
const HIST = new Map();
const LASTSNAP = new Map();   // 마을 → 마지막 표본(품목별 갈래용)
const TR = {};
for (const n of TRACE) TR[n] = [];

// ── 랩 모드 · 랩 JSON 모드 — 같은 항을 랩 세계에서 (정본 함수 그대로 · 사본 0) ─
function ingestLab(rec, lands) {
  const rows = [];
  for (const name in rec) {
    const arr = rec[name].filter((x) => x.happy != null && x.pop > 0);
    if (!arr.length) continue;
    const h = [];
    for (const x of arr) {
      const t = decompose(x.v, Math.max(1, x.N || x.pop));
      h.push({ d: x.d, pop: x.pop, happy: x.happy, gap: t.__gap, last: t.__full - x.happy, terms: TERMS.map((k) => t[k]) });
    }
    HIST.set(name, h);
    const last = arr[arr.length - 1];
    LASTSNAP.set(name, { v: last.v, N: Math.max(1, last.N || last.pop), d: last.d });
    rows.push({ name, pop: last.pop, happy: last.happy, mul: mulOf(last.happy), land: (lands && lands[name]) || {} });
  }
  return rows;
}
if (LABIN) {
  const J = JSON.parse(fs.readFileSync(LABIN, 'utf8'));
  report(`랩 ${Object.keys(J.rec).length}곳`, ingestLab(J.rec, J.land), null);
  process.exit(0);
}
if (LABMODE) {
  const { chromium } = require('playwright');
  const LAB = path.join(ROOT, 'lab', '전쟁실험실.html');
  const NVIL = parseInt(process.env.T196_NVIL || '8', 10) || 8;
  const PRNG = (sd) => `(()=>{let s=${sd}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    if (process.env.T196_NOPRNG !== '1') await p.addInitScript(PRNG(SEED));   // ★랩 하네스 문법(고정 PRNG) · 끄면 랩 제 씨앗만
    // ★★랩의 기본은 **T165 켬**이다(`L_HAPPYWORK_BASE=0.24`) — 끈 팔을 보려면 **0 을 명시로 넣어야 한다**.
    if (process.env.T196_HW !== undefined) await p.addInitScript(`window.L_HAPPYWORK=${HW};`);
    if (process.env.L_HAPPY_FLOOR1 && process.env.L_HAPPY_FLOOR1 !== '0') await p.addInitScript('window.L_HAPPY_FLOOR1=1;');   // ★[T209] 하한 1 — 랩은 손잡이만 켠다(수는 정본)
    const errs = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    await p.goto('file://' + LAB, { waitUntil: 'load', timeout: 300000 });
    await p.waitForTimeout(1200);
    const out = await p.evaluate(async ([DAYS, SEED, NVIL, SAMPLE, HW]) => {
      document.getElementById('seed').value = String(SEED);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(NVIL);
      reseed(); lifeInit();
      if (HW > 0 && ECON_WORLD) ECON_WORLD.happyWorkW = HW;
      const rec = {}, land = {};
      const hook = () => VILS.forEach((V, i) => {
        const v = V.econ; if (!v || v.__t196) return; v.__t196 = true;
        const name = v.name || ('마을' + (i + 1));
        land[name] = { fert: v.land && v.land.fertility, water: v.land && v.land.water, wood: v.land && v.land.wood,
          stone: v.land && v.land.stone, game: v.land && v.land.game, ore: v.land && v.land.ore };
        let _ls = v.lastStats;
        Object.defineProperty(v, 'lastStats', { configurable: true, enumerable: true,
          get() { return _ls; },
          set(s) {
            _ls = s;
            if (!window.__t196on) return;
            const o = { storage: Object.assign({}, v.storage || {}), _foodEaten: Object.assign({}, v._foodEaten || {}) };
            for (const k of ['_idleFrac', '_tradingN', '_coldStress', '_clothCov', '_clothQ', '_lgCov', '_weapQ', '_fuelCov']) o[k] = v[k];
            (rec[name] || (rec[name] = [])).push({ d: (ECON_WORLD && ECON_WORLD.day) || 0, pop: (v.npcs || []).length,
              happy: s && s.happiness, N: Math.max(1, (v.npcs || []).length), v: o });
          } });
      });
      hook();
      for (let d = 0; d < DAYS; d++) {
        window.__t196on = (d % SAMPLE === 0) || (d === DAYS - 1);
        lifeDayAll(true);
        hook();
      }
      window.__t196on = false;
      return { rec, land, pop: VILS.reduce((a, V) => a + ((V.econ.npcs || []).length), 0), nv: VILS.length, day: ECON_WORLD ? ECON_WORLD.day : null };
    }, [DAYS, SEED, NVIL, SAMPLE, HW]);
    await b.close();
    if (errs.length) console.log('  ⚠페이지 오류 ' + errs.length + ': ' + errs.slice(0, 3).join(' | '));
    if (process.env.T196_LABOUT) fs.writeFileSync(process.env.T196_LABOUT, JSON.stringify({ rec: out.rec, land: out.land }));
    const rows = ingestLab(out.rec, out.land);
    console.log(`  [랩] 마을 ${out.nv}곳 · 인구 ${out.pop} · 마지막 날 ${out.day} · 페이지오류 ${errs.length}`);
    report(`랩 ${out.nv}곳`, rows, null);
  })().catch((e) => { console.error(e); process.exit(1); });
  return;
}
let CAPTURE = false;
function hookVillage(v) {
  if (v.__t196) return; v.__t196 = true;
  let _ls = v.lastStats, _snap = null, _snapDay = -1, _snapN = 0, _snapH = null;
  Object.defineProperty(v, 'lastStats', {
    configurable: true, enumerable: true,
    get() { return _ls; },
    set(s) {
      _ls = s;
      if (!CAPTURE) return;
      _snap = Object.assign({}, v, { storage: Object.assign({}, v.storage || {}), _foodEaten: Object.assign({}, v._foodEaten || {}) });
      _snapDay = (v._world && v._world.day) || 0; _snapN = Math.max(1, (v.npcs || []).length);
      _snapH = (s && typeof s.happiness === 'number') ? s.happiness : null;   // ★그 순간의 행복 — 나중에 읽으면 짝이 어긋난다(실측: 틱을 거른 마을)
    },
  });
  Object.defineProperty(v, '__t196snap', { configurable: true, enumerable: false, get() { return _snap ? { v: _snap, day: _snapDay, N: _snapN, happy: _snapH } : null; } });
}

// ── 세계 — `t17-metrics.js` 와 같은 문 ───────────────────────────────────────
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;

P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const seeds = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  let layout;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);        // ★족보 130 — 서버가 여는 그 문을 계측기도 연다
if (HW > 0) world.happyWorkW = HW;             // ★T165 켠 팔 — 코드 무접촉(주입이 없으면 비트 동일)
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
for (const v of world.villages) hookVillage(v);
const LAND = {};
for (const s of seeds) LAND[s.name] = { fert: s.lp.fertility, water: s.lp.water, wood: s.lp.wood, stone: s.lp.stone, game: s.lp.game, ore: s.lp.ore };

const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

// ── 궤적 — 이름 지정 마을 ────────────────────────────────────────────────────
function snap() {
  for (const v of world.villages) {
    if (!TR[v.name]) continue;
    const S0 = v.__t196snap; if (!S0) continue;
    const tr = TR[v.name]; if (tr.length && tr[tr.length - 1].d === S0.day) continue;
    const t = decompose(S0.v, S0.N);
    const hp = S0.happy;
    TR[v.name].push({ d: S0.day, pop: (v.npcs || []).length, happy: hp == null ? null : +hp.toFixed(3),
      mul: hp == null ? null : +mulOf(hp).toFixed(3),
      terms: TERMS.map((k) => +t[k].toFixed(3)), sum: +t.__full.toFixed(3) });
  }
}

// 표본 이력 — 마을 × 표본일 (항별 기여 분포는 이 위에서 읽는다)
function harvest() {   // ★표본일 끝에 — 후크가 찍은 입력으로 항을 가른다
  for (const v of world.villages) {
    const S0 = v.__t196snap; if (!S0 || S0.happy == null) continue;
    if ((v.npcs || []).length <= 0) continue;
    let a = HIST.get(v.name); if (!a) HIST.set(v.name, a = []);
    if (a.length && a[a.length - 1].d === S0.day) continue;   // ★틱을 거른 마을 — 같은 표본을 두 번 세지 않는다
    const t = decompose(S0.v, S0.N);
    if (process.env.T196_DEBUG === '1' && Math.abs(t.__full - S0.happy) > 1e-9) {
      _log(`  [debug] ${v.name} 표본일 ${S0.day} / 오늘 ${world.day} · 그때 행복 ${S0.happy.toFixed(4)} vs 재계산 ${t.__full.toFixed(4)} · N ${S0.N} 현재 ${(v.npcs || []).length}`);
    }
    a.push({ d: S0.day, pop: (v.npcs || []).length, happy: S0.happy, gap: t.__gap, last: t.__full - S0.happy,
      terms: TERMS.map((k) => t[k]) });
    LASTSNAP.set(v.name, { v: S0.v, N: S0.N, d: S0.day });
  }
}

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  CAPTURE = (world.day % SAMPLE === 0) || (d === DAYS - 1);
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  for (const v of world.villages) hookVillage(v);          // 도중에 생긴 마을도 (지금 설정엔 없다)
  if (CAPTURE) { harvest(); if (TRACE.length) snap(); }
}
CAPTURE = false;
console.log = _log;

// ── 여덟 수 ──────────────────────────────────────────────────────────────────
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) * (v._toolQ != null ? v._toolQ : 1);
}
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const presStock = world.villages.reduce((a, v) => a + PRESERVED.reduce((b, r) => b + (v.storage[r] || 0), 0), 0);
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats;
const daysPer = 1 / Math.max(1e-9, S.emitted / Math.max(1, live * S.days));

// ── 마을별 항 분해 ───────────────────────────────────────────────────────────
const rows = [];
for (const v of world.villages) {
  const S0 = v.__t196snap;
  const hp = (v.lastStats && typeof v.lastStats.happiness === 'number') ? v.lastStats.happiness : null;
  rows.push({ name: v.name, pop: (v.npcs || []).length, happy: hp, mul: hp == null ? null : mulOf(hp),
    day: S0 ? S0.day : null, land: LAND[v.name] || {} });
}
report(`서버 ${seeds.length}곳`, rows, { pop, dead, ever, weapQ, expand, toolQ, presStock, S, daysPer });

function med(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pct(x) { return (100 * x).toFixed(0) + '%'; }

function report(tag, rows, eight) {
  const _fl = !!(process.env.L_HAPPY_FLOOR1 && process.env.L_HAPPY_FLOOR1 !== '0');
  const armTxt = (HW > 0 ? `T165 **켠** 팔(H=${HW})` : '**끈** 팔(손잡이 전부 미설정)') + (_fl ? ' + **하한 1**(T209)' : '');
  console.log(`\n=== T196 행복 항별 귀속 — ${tag} · 시드 ${SEED} · ${DAYS}일 · ${armTxt} · 표본 ${SAMPLE}일 ===`);
  if (eight) {
    console.log(`  여덟 수   인구 ${eight.pop} · 소멸 ${eight.dead}/${eight.ever} · 무기Q ${eight.weapQ.toFixed(0)} · 확장셀 ${eight.expand}`);
    console.log(`            게시 ${eight.S.reqOpened} · 일/건 ${eight.daysPer.toFixed(2)} · 도구Q ${eight.toolQ.toFixed(1)} · 보존식 ${eight.presStock.toFixed(1)}`);
  }

  // ── 마을 단위 요약(시간 중앙) ──────────────────────────────────────────────
  const V = [];
  let pool = [], worstGap = 0, worstLast = 0, nSample = 0;
  for (const r of rows) {
    const h = HIST.get(r.name) || [];
    if (!h.length) continue;
    for (const x of h) { worstGap = Math.max(worstGap, Math.abs(x.gap)); worstLast = Math.max(worstLast, Math.abs(x.last)); nSample++; pool.push(x); }
    const tm = TERMS.map((k, j) => med(h.map((x) => x.terms[j])));
    V.push({ name: r.name, pop: r.pop, land: r.land || {},
      hMed: med(h.map((x) => x.happy)), hMin: Math.min.apply(null, h.map((x) => x.happy)),
      hEnd: r.happy, tm, hist: h,
      empty: TERMS.map((k, j) => h.filter((x) => x.terms[j] <= 1e-9).length / h.length) });
  }
  console.log(`  자기검사  항 합 − 전체 최대차 ${worstGap.toExponential(1)} · **정본 lastStats 와 최대차 ${worstLast.toFixed(6)}** · 표본 ${nSample}개(마을·일)`);

  const endAlive = rows.filter((r) => r.happy != null && r.pop > 0);
  void 0;
  const endH = endAlive.map((r) => r.happy);
  const endBelow = endAlive.filter((r) => r.happy < 0.5);
  const poolBelow = pool.filter((x) => x.happy < 0.5).length;
  const medBelow = V.filter((v) => v.hMed < 0.5);
  console.log(`  행복 최종일  중앙 ${med(endH).toFixed(3)} · **최저 ${Math.min.apply(null, endH).toFixed(2)}** · 최고 ${Math.max.apply(null, endH).toFixed(2)} · **배수 1 미만 ${endBelow.length}/${endAlive.length}곳**`);
  console.log(`  행복 마을·일 중앙 ${med(pool.map((x) => x.happy)).toFixed(3)} · 최저 ${Math.min.apply(null, pool.map((x) => x.happy)).toFixed(3)} · 0.5 미만 ${pct(poolBelow / pool.length)} · 시간중앙<0.5 인 마을 ${medBelow.length}/${V.length}곳`);

  // ── 항 표 ─────────────────────────────────────────────────────────────────
  const bottom = V.slice().sort((a, b) => a.hMed - b.hMed).slice(0, 10);
  const topV = V.slice().sort((a, b) => b.hMed - a.hMed).slice(0, 5);
  console.log('\n  항'.padEnd(12) + '마을·일중앙'.padStart(13) + '하위10중앙'.padStart(12) + '상위5중앙'.padStart(11)
    + '빈비율(전체)'.padStart(14) + '빈비율(하위10)'.padStart(16) + '최대'.padStart(8));
  for (let j = 0; j < TERMS.length; j++) {
    const all = pool.map((x) => x.terms[j]);
    const bot = bottom.flatMap((v) => v.hist.map((x) => x.terms[j]));
    const tp = topV.flatMap((v) => v.hist.map((x) => x.terms[j]));
    const eAll = all.filter((x) => x <= 1e-9).length / all.length;
    const eBot = bot.filter((x) => x <= 1e-9).length / Math.max(1, bot.length);
    console.log('  ' + TERMS[j].padEnd(10) + med(all).toFixed(3).padStart(13) + med(bot).toFixed(3).padStart(12) + med(tp).toFixed(3).padStart(11)
      + pct(eAll).padStart(14) + pct(eBot).padStart(16) + Math.max.apply(null, all).toFixed(2).padStart(8));
  }
  console.log('  ' + '합(행복)'.padEnd(10) + med(pool.map((x) => x.happy)).toFixed(3).padStart(13)
    + med(bottom.flatMap((v) => v.hist.map((x) => x.happy))).toFixed(3).padStart(12)
    + med(topV.flatMap((v) => v.hist.map((x) => x.happy))).toFixed(3).padStart(11));

  // ── 하위 10곳 귀속 ────────────────────────────────────────────────────────
  console.log('\n  하위 10곳'.padEnd(14) + '인구'.padStart(6) + '행복중앙'.padStart(10) + '최종'.padStart(7) + '최저'.padStart(7)
    + TERMS.map((k) => k.padStart(9)).join('') + '  |  지력   물    숲    돌   사냥');
  for (const v of bottom) {
    const l = v.land || {};
    console.log('  ' + String(v.name).padEnd(12) + String(v.pop).padStart(6) + v.hMed.toFixed(3).padStart(10)
      + (v.hEnd == null ? '—' : v.hEnd.toFixed(2)).padStart(7) + v.hMin.toFixed(2).padStart(7)
      + v.tm.map((x) => x.toFixed(3).padStart(9)).join('')
      + `  |  ${String(l.fert ?? '—').padStart(4)} ${String(l.water ?? '—').padStart(5)} ${String(l.wood ?? '—').padStart(5)} ${String(l.stone ?? '—').padStart(5)} ${String(l.game ?? '—').padStart(5)}`);
  }
  console.log('\n  상위 5곳'.padEnd(14) + '인구'.padStart(6) + '행복중앙'.padStart(10) + '최종'.padStart(7) + '최저'.padStart(7)
    + TERMS.map((k) => k.padStart(9)).join('') + '  |  지력   물    숲    돌   사냥');
  for (const v of topV) {
    const l = v.land || {};
    console.log('  ' + String(v.name).padEnd(12) + String(v.pop).padStart(6) + v.hMed.toFixed(3).padStart(10)
      + (v.hEnd == null ? '—' : v.hEnd.toFixed(2)).padStart(7) + v.hMin.toFixed(2).padStart(7)
      + v.tm.map((x) => x.toFixed(3).padStart(9)).join('')
      + `  |  ${String(l.fert ?? '—').padStart(4)} ${String(l.water ?? '—').padStart(5)} ${String(l.wood ?? '—').padStart(5)} ${String(l.stone ?? '—').padStart(5)} ${String(l.game ?? '—').padStart(5)}`);
  }

  // ── 저장효용 안 — 어느 품목이 행복을 내나(품목 하나씩 빼 본다 · 정본 함수) ──
  function items(set, topN) {
    const acc = {};
    for (const v of set) {
      const S0 = LASTSNAP.get(v.name); if (!S0) continue;
      const base = F(S0.v, S0.N).happiness;
      for (const id in (S0.v.storage || {})) {
        const q = S0.v.storage[id]; if (!(q > 0)) continue;
        const st2 = Object.assign({}, S0.v.storage); delete st2[id];
        const d = base - F(Object.assign({}, S0.v, { storage: st2 }), S0.N).happiness;
        if (d > 1e-9) acc[id] = (acc[id] || 0) + d;
      }
    }
    const n = Math.max(1, set.length);
    return Object.entries(acc).map(([k, x]) => [k, x / n]).sort((a, b) => b[1] - a[1]).slice(0, topN);
  }
  const itB = items(bottom, 6), itT = items(topV, 6);
  console.log('\n  저장효용 안(마지막 표본 · 마을당 평균 기여)');
  console.log('    하위 10곳: ' + (itB.length ? itB.map(([k, x]) => `${k} ${x.toFixed(3)}`).join(' · ') : '—(전부 0)'));
  console.log('    상위  5곳: ' + (itT.length ? itT.map(([k, x]) => `${k} ${x.toFixed(3)}`).join(' · ') : '—(전부 0)'));

  // ── 지도 성질 대조(하위 10 vs 나머지) ─────────────────────────────────────
  const rest = V.filter((v) => bottom.indexOf(v) < 0);
  const LK = ['fert', 'water', 'wood', 'stone', 'game', 'ore'];
  const mOf = (set, k) => med(set.map((v) => +(v.land || {})[k]).filter((x) => Number.isFinite(x)));
  if (mOf(V, 'fert') != null) {
    console.log('\n  지도 성질 중앙'.padEnd(18) + LK.map((k) => k.padStart(8)).join('') + '   인구중앙');
    console.log('  ' + '하위 10곳'.padEnd(14) + LK.map((k) => (mOf(bottom, k) == null ? '—' : mOf(bottom, k).toFixed(2)).padStart(8)).join('') + String(med(bottom.map((v) => v.pop))).padStart(10));
    console.log('  ' + '나머지'.padEnd(15) + LK.map((k) => (mOf(rest, k) == null ? '—' : mOf(rest, k).toFixed(2)).padStart(8)).join('') + String(med(rest.map((v) => v.pop))).padStart(10));
  }

  // ── 궤적 ──────────────────────────────────────────────────────────────────
  if (TRACE.length) {
    for (const n of TRACE) {
      const t = TR[n]; if (!t || !t.length) { console.log(`\n  [궤적] ${n} — 없음`); continue; }
      console.log(`\n  [궤적] ${n} — ${SAMPLE}일 간격 (항: ${TERMS.join(' · ')})`);
      console.log('   일'.padStart(5) + '인구'.padStart(6) + '행복'.padStart(8) + '배수'.padStart(7) + TERMS.map((k) => k.padStart(9)).join(''));
      const step = Math.max(1, Math.round(t.length / 30));
      for (let i = 0; i < t.length; i += step) {
        const r = t[i];
        console.log(String(r.d).padStart(5) + String(r.pop).padStart(6) + (r.happy == null ? '—' : r.happy.toFixed(3)).padStart(8)
          + (r.mul == null ? '—' : r.mul.toFixed(3)).padStart(7) + r.terms.map((x) => x.toFixed(3).padStart(9)).join(''));
      }
      const nz = t.filter((r) => r.pop > 0);
      const lastLive = nz.length ? nz[nz.length - 1] : null;
      // 궤적 요약 — 최고 인구일 · 반감일 · 마지막 표본 · 내려가는 구간의 행복·배수
      let pk = t[0], pki = 0;
      t.forEach((r, i) => { if (r.pop >= pk.pop) { pk = r; pki = i; } });
      const half = t.find((r, i) => i > pki && r.pop <= pk.pop / 2);
      const down = t.slice(pki);
      const dHap = med(down.map((r) => r.happy).filter((x) => x != null));
      const dMul = med(down.map((r) => r.mul).filter((x) => x != null));
      console.log(`  요약  최고 인구 ${pk.pop}명(${pk.d}일 · 행복 ${pk.happy} · 배수 ${pk.mul})`
        + ` · 반감 ${half ? half.d + '일' : '없음'}`
        + ` · 마지막 표본 ${lastLive ? lastLive.d + '일 ' + lastLive.pop + '명 행복 ' + lastLive.happy : '—'}`
        + ` · 내려가는 구간 행복중앙 ${dHap == null ? '—' : dHap.toFixed(3)} 배수중앙 ${dMul == null ? '—' : dMul.toFixed(3)}`);
      const emptyCols = TERMS.map((k, j) => `${k} ${(100 * down.filter((r) => r.terms[j] <= 1e-9).length / Math.max(1, down.length)).toFixed(0)}%`);
      console.log('  그 구간 빈 비율  ' + emptyCols.join(' · '));
    }
  }

  if (process.env.T196_JSON) {
    fs.writeFileSync(process.env.T196_JSON, JSON.stringify({ tag, seed: SEED, days: DAYS, hw: HW, sample: SAMPLE, eight,
      terms: TERMS, villages: V.map((v) => ({ name: v.name, pop: v.pop, land: v.land, hMed: v.hMed, hMin: v.hMin, hEnd: v.hEnd, tm: v.tm, empty: v.empty })),
      trace: TR }, null, 1));
    console.log(`\n  [JSON] ${process.env.T196_JSON}`);
  }
}
