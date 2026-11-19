'use strict';
// (@regress 없음 — 러너 밖 · T1374 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1374-observe.js — 밭 켬 겨울 진단: 마을-달 줄(심은 칸 · 거둔 칸 · 곳간에 든 · 먹은 · 썩은 · 씨 · 농부 · 굶음) =========
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1374-observe.js" node scripts/t577-server-run.js <날> <시드>   (판 JSON 곁 `<판>-<시드>.t1374.json`)
//   `T1374_OUT=<파일>` 이면 그 자리. 판 자(부모)는 안 적는다 — 존(아이)에서만(T1351 회부 5 · 빈 줄로 덮지 않게).
//   마을-달(달력 정본 `calendar.dateOf` — 날 0 = 3월 1일) 칸 — 단위: 식량 = 하루치(× `DAY_KCAL` = kcal) · 칸 = 생활층 밭 칸:
//     pop(달 끝) · popMin · sown(그달 새로 심은 칸 — `_crop` 의 새 항목) · stand(달 끝 선 칸) · harv(거둔 건수 `_t100HarvestN` 차) ·
//     inF(곳간에 든 밭 식량 `_t368FoodTot` 차) · eatF(먹은 것 `_foodEaten` 환산 합) · tfe(달 끝 곳간 식량) · tfeMin · rotF(달 끝 상한 몫 — 로트 `spoiledU` 환산) ·
//     byF(농부 부산물 곡식 — 작물 철 켬일 때 밭 못자리에 든 몫 `_t1179F.acc` 차) · byIn(그 몫이 익어 곳간에 든 `_t1179F.inTot` 차) ·
//     seedU(달 끝 씨 낱개 합) · farm(econ 농부 달 평균) · bodyF(몸 농부 달 평균) · fd(굶어 죽음 차) · nat(늙어 죽음 차) · farmSet(밭 칸 수 달 끝)
//   세계 날 줄: [날 · 인구 · 사람 있는 마을 · 굶어 죽음 누계 · 곳간 식량 합]
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = !SERVER ? '' : (process.env.T1374_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1374.json' : ''));
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
let LOT = null; try { LOT = require(path.join(ROOT, 'server', 'granary-lots')); } catch (_) {}
const COLS = ['ym', 'name', 'pop', 'popMin', 'sown', 'stand', 'harv', 'inF', 'eatF', 'tfe', 'tfeMin', 'rotF', 'seedU', 'farm', 'bodyF', 'fd', 'nat', 'farmSet', 'byF', 'byIn', 'days'];
const rec = { cols: COLS, rows: [], wcols: ['day', 'pop', 'vils', 'fd', 'tfe'], w: [], err: null };
const SEEN = new WeakSet();          // 이미 센 `_crop` 항목(새 항목 = 그날 심은 칸)
const M = new Map();                 // 이름 → 그달 칸
const PREV = new WeakMap();          // econ 마을 → { f368, harv, fd, nat }
let B = null, V = null, curDay = -1, curYm = null, wd = null;
function srv() { if (B) return B; try { V = require(path.join(ROOT, 'server', 'villages')); B = V.__p3Bind ? V.__p3Bind({}) : null; } catch (e) { B = null; } return B; }
function ymOf(day) { const t = CAL.dateOf(day); return t.year * 100 + t.month; }
function flushMonth() {
  for (const [name, m] of M) rec.rows.push(COLS.map((c) => c === 'ym' ? curYm : c === 'name' ? name : +(+(m[c] || 0)).toFixed(3)));
  M.clear();
}
function lifeDay(day) {   // 생활층 — 심은 칸 · 선 칸 · 몸 농부 · 밭 칸
  const b = srv(); if (!b || !b.state || !b.state.villages) return;
  const pl = b.state.deps && b.state.deps.players;
  for (const vil of b.state.villages) {
    const e = vil.econ; if (!e) continue;
    const m = M.get(e.name) || null; if (!m) continue;
    let sown = 0, stand = 0;
    if (vil._crop) for (const x of vil._crop.values()) { if (!x || !x.c) continue; stand++; if (!SEEN.has(x)) { SEEN.add(x); if (day > 0) sown++; } }
    m.sown = (m.sown || 0) + sown; m.stand = stand; m.farmSet = vil._farmSet ? vil._farmSet.size : 0;
    let bf = 0; if (pl) for (const pid of (vil.npcPids || [])) { const q = pl.get(pid); if (q && q.simJob === 'farmer') bf++; }
    m._bf = (m._bf || 0) + bf;
  }
}
function endDay() {
  if (curDay < 0) return;
  try { lifeDay(curDay); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  for (const m of M.values()) { m.days = (m.days || 0) + 1; }
  if (wd) rec.w.push([curDay, wd.pop, wd.vils, wd.fd, +wd.tfe.toFixed(1)]);
  if (curDay % 10 === 0) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {}
}
function finishMonth() { for (const m of M.values()) { const d = m.days || 1; m.farm = (m._fa || 0) / d; m.bodyF = (m._bf || 0) / d; delete m._fa; delete m._bf; } flushMonth(); }
function foodPerItems(v, st) { try { return E.storageFoodEquivalent(v, st || {}, false); } catch (_) { return 0; } }
function rotOf(v) {
  if (!LOT || !LOT.freshOf) return 0; let t = 0;
  for (const [r, n] of Object.entries(v.storage || {})) { if (!(n > 0)) continue; let f = 0; try { f = E.storageFoodPer(v, r); } catch (_) {} if (!(f > 0)) continue; let s = null; try { s = LOT.freshOf(v, r); } catch (_) {} if (s && s.spoiledU > 0) t += Math.min(n, s.spoiledU) * f; }
  return t;
}
const _t = E.tickVillage;
E.tickVillage = function (v, day) {
  const r = _t.apply(this, arguments);
  try {
    if (day !== curDay) {
      endDay();
      const ym = ymOf(day);
      if (curYm !== null && ym !== curYm) finishMonth();
      curYm = ym; curDay = day; wd = { pop: 0, vils: 0, fd: 0, tfe: 0 };
    }
    const n = (v.npcs || []).length, tfe = E.totalFoodEquivalent ? E.totalFoodEquivalent(v) : 0;
    wd.pop += n; if (n) wd.vils++; wd.fd += v._fdDeadTot || 0; wd.tfe += tfe;
    let m = M.get(v.name); if (!m) { m = { popMin: Infinity, tfeMin: Infinity }; M.set(v.name, m); }
    const F9 = v._t1179F || {}, P = PREV.get(v) || { f: v._t368FoodTot || 0, h: v._t100HarvestN || 0, fd: v._fdDeadTot || 0, nat: v._natDeadTot || 0, a: F9.acc || 0, i: F9.inTot || 0 };
    m.harv = (m.harv || 0) + ((v._t100HarvestN || 0) - P.h); m.inF = (m.inF || 0) + ((v._t368FoodTot || 0) - P.f);
    m.byF = (m.byF || 0) + ((F9.acc || 0) - P.a); m.byIn = (m.byIn || 0) + ((F9.inTot || 0) - P.i);
    m.fd = (m.fd || 0) + ((v._fdDeadTot || 0) - P.fd); m.nat = (m.nat || 0) + ((v._natDeadTot || 0) - P.nat);
    PREV.set(v, { f: v._t368FoodTot || 0, h: v._t100HarvestN || 0, fd: v._fdDeadTot || 0, nat: v._natDeadTot || 0, a: F9.acc || 0, i: F9.inTot || 0 });
    m.eatF = (m.eatF || 0) + foodPerItems(v, v._foodEaten);
    m.pop = n; m.popMin = Math.min(m.popMin, n); m.tfe = tfe; m.tfeMin = Math.min(m.tfeMin, tfe);
    m._fa = (m._fa || 0) + ((v.counts && v.counts.farmer) || 0);
    if (CAL.dateOf(day + 1).month !== CAL.dateOf(day).month) { m.rotF = rotOf(v); let s = 0; for (const [k, q] of Object.entries(v.storage || {})) if (k.startsWith('seed_') && q > 0) s += q; m.seedU = s; }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { endDay(); finishMonth(); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} });
