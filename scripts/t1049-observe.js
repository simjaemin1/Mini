'use strict';
// (@regress 없음 — 러너 밖 · T1049 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1049-observe.js — 마을은 왜 굶어서 해체되나 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===========================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1049-observe.js" node scripts/t577-server-run.js 800 1020
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1049.json` · 표는 `scripts/t1049-table.js`)
//   ★왜 [T1049 · ★재민 11-01 판정대기 3] "대체 왜 굶는지 · 처음 마을들은 터지면 안 된다" — 해체 마을마다 피크 → 해체까지 날별 장부를 남긴다.
//   T1022 관찰기(`t1022-observe.js`)의 걸쇠 문법을 그대로 쓴다(장부가 서는 때 두 모듈을 캐시에서 집기 · 명부 배열 숨은 칸 감싸개 · 호출 스택 이름).
//   뜨는 것(이미 있는 칸을 읽기만 — 새 수 0):
//     ⓐ 날 줄 — 도적 하루(`bandits.dayTick` · ★T986 켬 기본 · 끔이면 `onGameTick`) **앞**(해체 문턱이 보는 그 순간)에 모든 econ 마을 한 줄:
//        인구 · 곳간 식량 등가(`totalFoodEquivalent` 정본 · 해체 자 `fe` = food+fish+meat+cooked_food) · 그날 산출(`dailyProductionBuf` 의 먹을 것 칸) ·
//        그날 먹음(`_foodEaten` 합) · 인구식 항(`_dpDebug` — K · logi · hunger · health · happy · dP) · K 의 셋(`_kDbg` slot · prod · fuel) ·
//        교역 누계(`tradeStats` 먹을 것 수입 · 수출 · 잃은 짐 · 피살 행상) · 전쟁(조공 냄 `_warTribOut` · 징집 `_warDraft` · 짐 `_warPack` · 싸우는 전쟁) ·
//        직업 몫(`counts`) · 도적 셈(`_bdtFall` · `_bdtCri` · `_bdtPeak`) · stat(건강 · 행복).
//     ⓑ 빠진 사람 — 명부 배열(`econ.npcs`)에 숨은 칸 감싸개(`splice`/`pop`/`shift`)를 달아, 빠질 때 부른 자리(호출 스택의 제품 함수 이름)와
//        그 순간 인구식 항을 적는다. `tickVillage`(인구식 죽음)는 가장 음수인 항(logi · hunger · health · happy)과 K 를 묶은 칸(slot · prod · fuel)으로 가른다.
//     ⓒ 들어온 사람 — 날마다 명부 객체를 견준다: 처음 보는 객체 = 출생 · 다른 마을에서 본 객체 = 옮겨 옴.
//     ⓓ 해체 — 그날 `_banditized` 0 → 1 이 된 마을(T1022 문법).
//   ⚠값을 안 바꾼다: 숨은 칸은 배열 원소가 아니다(`JSON.stringify` · `length` · 순회 무변). 감싸개는 원 함수를 같은 인자로 부르고 돌려줌을 그대로 돌려준다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const LAB = /t17-metrics\.js$/.test(A1);   // ★랩 대조(②) — `T1049_OUT=<파일> node -r scripts/t1049-observe.js scripts/t17-metrics.js 800 <시드>` · 날 줄만(해체 · 도적 층 없음)
if (!LAB && !(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = LAB ? (process.env.T1049_OUT || '') : process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1049.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const Ev = require(path.join(ROOT, 'server', 'events'));
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));   // 정본 식(같은 모듈 인스턴스 — 존이 실은 그것)
const FOOD = ['food', 'fish', 'meat', 'cooked_food', ...Object.keys(E.FORAGE_FOOD_FACTOR || {}), ...(E.RAW_GRAINS || [])];
const FE4 = ['food', 'fish', 'meat', 'cooked_food'];   // bandits.js 해체 자 `fe`(원문 네 칸)
const COLS = ['d', 'n', 'fe', 'fe4', 'prod', 'eat', 'K', 'logi', 'hunger', 'health', 'happy', 'dP', 'kSlot', 'kProd', 'kFuel',
  'imp', 'exp', 'lost', 'tk', 'trib', 'draft', 'pack', 'war', 'fall', 'cri', 'peak', 'hp', 'hap', 'dead', 'born', 'inn', 'outn', 'tre', 'pGrain', 'pFish', 'pMeat', 'pForage', 'tool', 'stone', 'deps', 'toolQ', 'tBoost', 'sProd', 'sCons', 'tMade', 'wMade'];
const G_GRAIN = ['food', 'cooked_food', ...(E.RAW_GRAINS || [])], G_FORAGE = Object.keys(E.FORAGE_FOOD_FACTOR || {});   // 산출 갈래(농사 · 어로 · 사냥 · 채집) — 원 칸 그대로(등가 계수 안 곱함)
const rec = { ver: 1, cols: COLS, food: FOOD, seed: +(process.env.T577_SEED || process.argv[3] || 0), lab: LAB, knob: Object.fromEntries(['T858_NO_SHIELD', 'VILLAGE_NPC_CAP', 'T577_CAND_WALK', 'DCTL_SKIP', 'VILLAGE_DAY_MS'].map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  vil: {}, gone: {}, jobs: {}, dis: [], lastDay: null, hooked: 0, errs: [] };
const err = (w, e) => { if (rec.errs.length < 40) rec.errs.push(w + ': ' + String(e && e.message || e)); };
let B = null, VL = null;
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const _hold = { stack: '' };
const CAUSE = ['formGang', '_t577Walk', 'killTrader', '_killWarriors', '_warRemoveNpc', 'warKill', 'warCapture', '_capComplete', 'warDraftKillPid', 'tickVillage', 'tickForceEvacuation', 'tickMigration', 'reapDead', 'daily'];
function caller() {   // T1022 `caller` 그대로(호출 스택을 위로 훑어 처음 만나는 아는 제품 함수)
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 18; Error.captureStackTrace(_hold, caller); Error.stackTraceLimit = L;
  for (const ln of String(_hold.stack).split('\n').slice(1)) {
    const m = /at (?:Object\.|Array\.)?([A-Za-z_$][\w$]*)/.exec(ln);
    if (!m) continue;
    if (m[1] === 'daily' && !/bandits\.js/.test(ln)) continue;
    if (m[1] === 'takeOne') return 'warCapture';
    if (CAUSE.includes(m[1])) return m[1];
  }
  return '?';
}
function popCause(v) {   // 인구식 죽음 — 그 순간 가장 음수인 항 · logi 면 K 를 묶은 칸
  const d = v._dpDebug || {}, k = v._kDbg || {};
  const terms = { logi: +d.logi || 0, hunger: +d.hunger || 0, health: +d.health || 0, happy: +d.happy || 0 };
  let w = 'logi', m = Infinity; for (const t in terms) if (terms[t] < m) { m = terms[t]; w = t; }
  if (m >= 0) return 'pop:?';
  if (w !== 'logi') return 'pop:' + w;
  const ks = { slot: +k.slot, prod: +k.prod, fuel: +k.fuel };
  let kw = 'slot', km = Infinity; for (const t in ks) if (Number.isFinite(ks[t]) && ks[t] < km) { km = ks[t]; kw = t; }
  return 'pop:logi/' + kw;
}
const ARR = new WeakMap();   // 명부 배열 → 마을 이름
let curDay = 0;
function addGone(name, cause) { const g = rec.gone[name] || (rec.gone[name] = {}); const k = curDay + ':' + cause; g[k] = (g[k] || 0) + 1; }
function noteGone(arr, x) {
  const name = ARR.get(arr); if (!name || !x) return;
  let c = caller();
  if (c === 'tickVillage') { const vil = byName.get(name); c = vil ? popCause(vil.econ) : 'pop:?'; }
  else if (c === 'daily') { const vil = byName.get(name); c = vil && vil.econ._bdtExoAt === curDay ? 'desert' : 'expedition'; }
  addGone(name, c);
}
function wrapArr(arr, name) {
  if (!arr) return;
  ARR.set(arr, name);
  if (arr.__t1049w) return;
  Object.defineProperty(arr, '__t1049w', { value: 1, enumerable: false, configurable: true, writable: true });
  for (const fn of ['splice', 'pop', 'shift']) {
    const P = Array.prototype[fn];
    Object.defineProperty(arr, fn, { enumerable: false, configurable: true, writable: true, value: function () {
      const r = P.apply(this, arguments);
      try { if (fn === 'splice') { for (const x of r) noteGone(this, x); } else if (r !== undefined) noteGone(this, r); } catch (e) { err('wrap', e); }
      return r;
    } });
  }
}
// 도구 배수 — `tickVillage` 의 `toolBoostShared` 식 원문(E:3013~3021) 그대로 다시 센다(읽기만 · 그날 명부 · 그날 곳간)
function tBoost(e) {
  const deps = e._toolDeps | 0; if (!deps) return 1;
  const st = e.storage || {}, q = e._toolQ != null ? e._toolQ : 1.4;
  const ni = Math.min(deps, st.iron_tool || 0), nb = Math.min(deps - ni, st.bronze_tool || 0), ns = Math.min(deps - ni - nb, st.tool || 0), nn = deps - ni - nb - ns;
  return (ni * 1.8 + nb * 1.4 + ns * q + nn * 0.25) / deps;
}
// ★[T1049 · 돌 덫] `T1049_STONE_TRACE=1` 이면 곳간 `stone` 칸을 접근자로 바꿔, 줄어들 때마다 부른 함수 이름(스택 머리 — 이 파일 밖 첫 칸)으로 양을 적는다.
//   값은 그대로다(읽으면 넣은 값 · 쓰면 그 값). 곳간 객체가 바뀌면 그날 다시 단다. 랩 판(빠름)에서만 쓰려고 둔 문이다.
const STONE_TRACE = process.env.T1049_STONE_TRACE === '1';
rec.stoneOut = {};   // 마을 → { 함수: 양 } (판 전체 · 날 창은 stoneOutDay)
rec.stoneOutDay = {};   // 마을 → [[날, 함수, 양] …] (D≤400 만)
const _sh = { stack: '' };
function topFn() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 6; Error.captureStackTrace(_sh, topFn); Error.stackTraceLimit = L;
  for (const ln of String(_sh.stack).split('\n').slice(1)) { if (/t1049-observe/.test(ln)) continue; const m = /at (?:Object\.|Array\.)?([A-Za-z_$][\w$.]*)/.exec(ln); if (m) return m[1]; return ln.trim().slice(3, 60); }
  return '?';
}
function trapStone(name, e) { for (const it of ['stone', 'tool']) trapItem(name, e, it); }
function trapItem(name, e, it) {
  const st = e.storage; const tag = '__t1049s_' + it; if (!st || st[tag]) return;
  let val = st[it];
  Object.defineProperty(st, tag, { value: 1, enumerable: false, configurable: true, writable: true });
  Object.defineProperty(st, it, { enumerable: true, configurable: true,
    get() { return val; },
    set(x) { try { if (+x < +val) { const f = topFn(), d = (+val || 0) - (+x || 0); const key = it === 'stone' ? name : name + '#' + it; const o = rec.stoneOut[key] || (rec.stoneOut[key] = {}); o[f] = (o[f] || 0) + d;
      if (curDay <= 400) { const L = rec.stoneOutDay[key] || (rec.stoneOutDay[key] = []); L.push([curDay, f, Math.round(d * 1000) / 1000]); } } } catch (z) {} val = x; } });
}
const byName = new Map();
const prevSet = new Map();      // 마을 → 어제 명부 객체
const homeOf = new WeakMap();   // 사람 객체 → 처음 본 마을
const cum = new Map();          // 마을 → 어제 누계(교역)
function sumFood(o, keys) { let s = 0; if (o) for (const k of keys) s += +o[k] || 0; return s; }
function atWar(world, e) { try { for (const w of (world._warWars || [])) if (w && (w.atk === e || w.def === e || w.atk === e.name || w.def === e.name || (w.atk && w.atk.name === e.name) || (w.def && w.def.name === e.name))) return 1; } catch (x) {} return 0; }
function snap(host, day) {
  const world = host.world;
  for (const vil of host.villages) {
    const e = vil.econ; if (!e) continue;
    const name = vil.name; byName.set(name, vil);
    if (!rec.vil[name]) { rec.vil[name] = []; rec.jobs[name] = []; }
    wrapArr(e.npcs, name);
    if (STONE_TRACE) trapStone(name, e);
    const now = new Set(e.npcs), prev = prevSet.get(name) || new Set();
    let born = 0, inn = 0, outn = 0;
    for (const x of now) if (!prev.has(x)) { if (homeOf.has(x) && homeOf.get(x) !== name) inn++; else if (!homeOf.has(x)) born++; homeOf.set(x, homeOf.get(x) || name); }
    for (const x of prev) if (!now.has(x)) outn++;
    prevSet.set(name, now);
    const ts = e.tradeStats || {}, c0 = cum.get(name) || { imp: 0, exp: 0, lost: 0, tk: 0 };
    const c1 = { imp: +ts.foodImported || 0, exp: sumFood(ts.exportBy, FOOD), lost: +ts.cargoLost || 0, tk: +ts.tradersKilled || 0 };
    cum.set(name, c1);
    const d = e._dpDebug || {}, k = e._kDbg || {}, st = e.lastStats || {};
    let draft = 0, pack = 0; for (const x of e.npcs) { if (x._warDraft) draft++; if (x._warPack) pack++; }
    let fe = 0; try { fe = E.totalFoodEquivalent(e); } catch (x) { err('fe', x); }
    const row = [day, e.npcs.length, r2(fe), r2(sumFood(e.storage, FE4)), r2(sumFood(e.dailyProductionBuf, FOOD)), r2(sumFood(e._foodEaten, FOOD)),
      d.K, d.logi, d.hunger, d.health, d.happy, d.dP, k.slot, k.prod, k.fuel,
      r2(c1.imp - c0.imp), r2(c1.exp - c0.exp), r2(c1.lost - c0.lost), c1.tk - c0.tk,
      (e._warTribOut || []).length, draft, pack, atWar(world, e), e._bdtFall | 0, r2(e._bdtCri), e._bdtPeak | 0, r2(st.health), r2(st.happiness),
      e._deadTot | 0, born, inn, outn, r2(e.treasury && e.treasury.food),
      r2(sumFood(e.dailyProductionBuf, G_GRAIN)), r2(sumFood(e.dailyProductionBuf, ['fish'])), r2(sumFood(e.dailyProductionBuf, ['meat'])), r2(sumFood(e.dailyProductionBuf, G_FORAGE)),
      r2(e.storage && e.storage.tool), r2(e.storage && e.storage.stone), e._toolDeps | 0, r2(e._toolQ), r2(tBoost(e)),
      r2(e.dailyProductionBuf && e.dailyProductionBuf.stone), r2(e._consDay && e._consDay.stone),   // 돌 산출 · 돌 실소비(`_cons` — 유지 · 주거 · 생계)
      r2((+e._stoneToolMade || 0) - (c0.tm || 0)), r2((+e._stoneWeaponMade || 0) - (c0.wm || 0))];   // 그날 석기 · 마제석검(누계 차)
    c1.tm = +e._stoneToolMade || 0; c1.wm = +e._stoneWeaponMade || 0;
    rec.vil[name].push(row);
    if (day % 5 === 0) rec.jobs[name].push([day, Object.assign({}, e.counts || {})]);
  }
}
const preB = new Map();
function hook() {
  B = require(path.join(ROOT, 'server', 'bandits'));
  VL = require(path.join(ROOT, 'server', 'villages'));
  const on986 = (() => { try { return !!B.t986().on; } catch (e) { return true; } })();
  const name = on986 ? 'dayTick' : 'onGameTick';
  const f0 = B[name];
  B[name] = function () {
    let fresh = false;
    try { const ld = B.t986().lastDay; const h = VL.banditHost(); if (h && h.world && (h.world.day | 0) !== ld) { fresh = true; curDay = h.world.day | 0; rec.hooked++; snap(h, curDay); preB.clear(); for (const v of h.villages) if (v.econ) preB.set(v.name, !!v.econ._banditized); } } catch (e) { err('before', e); }
    const r = f0.apply(this, arguments);
    try { if (fresh) { const h = VL.banditHost(); for (const v of h.villages) if (v.econ && v.econ._banditized && preB.get(v.name) === false) rec.dis.push({ v: v.name, day: curDay, n: v.econ.npcs.length }); } } catch (e) { err('after', e); }
    return r;
  };
}
let hooked = false;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  try { if (!hooked && !LAB) { hooked = true; hook(); } } catch (e) { err('hook', e); }
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    if (LAB) { try { curDay = day | 0; rec.lastDay = curDay; rec.hooked++; snap({ world, villages: (world.villages || []).map((v) => ({ name: v.name, econ: v })) }, curDay); } catch (e) { err('lab', e); } return sd.apply(this, arguments); }
    try { if (!hooked) { hooked = true; hook(); } rec.lastDay = day | 0; } catch (e) { err('scan', e); } return sd.apply(this, arguments); };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
