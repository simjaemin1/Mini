'use strict';
// (@regress 없음 — 판 곁 관찰기 · 읽기만 · 세계 무변 · T1360 관찰기 꼴)
// === 계측/T1355_2026-11-18/t1355-observe.js — 서버 몸 판 곁 관찰기: 남는 시간 요리 문 · 먹은 것 건강 몫 · 로트 건강이 가는 길 ===
//   쓰는 법: T1355_OBS=<out.json> NODE_OPTIONS="--require <이 파일>" node --experimental-sqlite scripts/server-baseline-check.js --make … --seeds <한 시드> --bodies all --farm
//   마을-날마다(마을 틱 `tickVillage` 바로 뒤 — 그날 셈이 막 끝난 자리):
//     ① 남는 시간 요리(`T1286_COOK_SPARE`) 문 — 그날 econ 이 적은 칸만 읽는다: `_t1286Gd`(남는 손이 있어 문을 셈한 날) · `_t1286G`(식량 안보 문 — 곳간 합 ≥ 사람×35 · 식량 ≥ 사람×8)
//        · `_t1286C.lastD`(조리식을 낸 날) ⇒ 가름 넷: 0 남는 손 없음 · 1 문 닫힘 · 2 재료 없음(문은 열림) · 3 요리함. 곁에 사람 · 곳간 합 ÷ 사람(`totalFoodEquivalent`).
//     ② 로트 건강 — 끼니마다(`granary-lots.eatEnd` 감쌈) 나간 로트의 [건강 합 · 단위]를 몸 끼니(`t1197Meal` 몸 갈래 — 서버가 econ 내보낸 함수로 부른다) · 마을 틱 끼니로 갈라 모은다.
//        그날 셈이 쓴 칸(`_t1309LotH` — 틱 뒤 그대로)과 견준다: 기대 = 지난 틱 뒤 몸 끼니 + 이번 틱 끼니(식단 칸 `_foodEaten` 이 모으는 그 끼니들).
//     ③ 5날마다(그 날 틱 바로 뒤 · 그날 셈과 같은 입력) 사람 가중: 건강 · 먹은 것 건강 몫(`t1309EatenHealth`) · 군마다(먹은 품목을 군으로 거른 칸 — 프로토타입 겹 · 원본 무변)
//        · 분자 가운데 로트 몫 · 평균 칸 몫(`t1298Hw`) · 다양성 몫(`lastStats.foodGroups` → 정본 상수 — 소스에서 읽는다) · 행복 · 여가.
//   세계에 0: 감싼 함수는 인자 · 돌려주는 값을 그대로 넘긴다 · 칸을 쓰지 않는다(프로토타입 겹은 새 객체).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1355_OBS; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const G = require(path.join(ROOT, 'server', 'granary-lots'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (n) => { const m = new RegExp('const ' + n + ' = ([\\d.]+);').exec(SRC); return m ? +m[1] : null; };
const DIV_FULL = K('DIVERSITY_FULL'), DIV_HEALTH_W = K('DIVERSITY_HEALTH_W'), DIV_HAPPY_W = K('DIVERSITY_HAPPY_W');
const rec = { seed: +process.env.T577_SEED, knobs: { T1260: V1.T1260_FOOD_READS, T1279: V1.T1279_COOK, T1286: V1.T1286_COOK_SPARE, T1298H: V1.T1298_HEALTH,
  MOVE: V1.T1309_MOVE_CONS, HEALTH: V1.T1309_HEALTH_EATEN, DIV: V1.T1309_DIVERSITY_EATEN, T1197: V1.T1197_MEAL_BODY }, consts: { DIV_FULL, DIV_HEALTH_W, DIV_HAPPY_W },
  days: [], snaps: [], vill: {}, err: null };
let cur = null, last = -1, inBody = false, inTick = null, sn = null;
const pendBody = new Map();   // 마을 → 지난 틱 뒤 몸 끼니 로트 [건강 합, 단위]
const day0 = (d) => ({ day: d, vd: 0, famine: 0, gate35: 0, c: [0, 0, 0, 0], tag: 0, tagH: 0, tagHU: 0,
  bodyH: 0, bodyU: 0, tickH: 0, tickU: 0, expH: 0, usedH: 0, usedU: 0, gapH: 0, eatCalls: 0 });
const snap0 = (d) => ({ day: d, pop: 0, cooks: 0, w: 0, h: 0, eh: 0, dh: 0, fg: 0, hp: 0, lei: 0, lotN: 0, avgN: 0, grp: {} });
const lhSum = (m) => { let h = 0, u = 0; if (m) for (const k in m) { h += +m[k][0] || 0; u += +m[k][1] || 0; } return [h, u]; };
const _tag = G.tagH;
G.tagH = function (v, res, du, h) { const ok = _tag.apply(this, arguments); if (ok && cur) { cur.tag++; if (h > 0) { cur.tagH++; cur.tagHU += du; } } return ok; };
const _end = G.eatEnd;
G.eatEnd = function (v) {
  const m = _end.apply(this, arguments);
  if (m && cur) {
    const [h, u] = lhSum(m); cur.eatCalls++;
    if (inBody) { const p = pendBody.get(v) || [0, 0]; p[0] += h; p[1] += u; pendBody.set(v, p); cur.bodyH += h; cur.bodyU += u; }
    else if (inTick === v) { cur.tickH += h; cur.tickU += u; cur._tk[0] += h; cur._tk[1] += u; }
  }
  return m;
};
const _meal = V1.t1197Meal;
if (typeof _meal === 'function') V1.t1197Meal = function (v, who, s, body) { const o = inBody; inBody = !!body; try { return _meal.apply(this, arguments); } finally { inBody = o; } };
function addSnap(e) {   // 그 마을 틱 바로 뒤(그날 셈과 같은 입력)
  const n = (e.npcs || []).length; sn.pop += n; sn.cooks += (e.counts && e.counts.cook) || 0;
  const L = e.lastStats; if (!(L && n > 0)) return;
  sn.w += n; sn.h += (+L.health || 0) * n; sn.fg += (+L.foodGroups || 0) * n; sn.hp += (+L.happiness || 0) * n; sn.lei += (+L.leisure || 0) * n;
  if (DIV_FULL) sn.dh += Math.min(1, (+L.foodGroups || 0) / DIV_FULL) * DIV_HEALTH_W * n;
  if (!(V1.T1309_HEALTH_EATEN && typeof V1.t1309EatenHealth === 'function')) return;
  const pp = Math.max(1, n); sn.eh += V1.t1309EatenHealth(e, pp) * n;
  const E = e._foodEaten || {}, LH = e._t1309LotH || null, by = {};
  for (const id in E) {
    const q = +E[id] || 0; if (!(q > 0)) continue; const g = V1.t1309Group(id); if (!g) continue; (by[g] || (by[g] = {}))[id] = q;
    const Lr = LH && LH[id], lu = Lr ? Math.min(q, Lr[1]) : 0;
    sn.lotN += (Lr && Lr[1] > 0 ? Lr[0] * lu / Lr[1] : 0) * n; sn.avgN += (q - lu) * V1.t1298Hw(e, id) * n;
  }
  for (const g in by) { const o = Object.create(e); o._foodEaten = by[g]; sn.grp[g] = (sn.grp[g] || 0) + V1.t1309EatenHealth(o, pp) * n; }
}
function pushSnap() {
  if (!sn) return; const w = sn.w, r4 = (x) => (w ? +(x / w).toFixed(4) : null), G4 = {};
  for (const g in sn.grp) G4[g] = r4(sn.grp[g]);
  rec.snaps.push({ day: sn.day, pop: sn.pop, cooks: sn.cooks, health: r4(sn.h), eaten: r4(sn.eh), div: r4(sn.dh), fg: r4(sn.fg), happy: r4(sn.hp), leisure: r4(sn.lei), eatGrp: G4, numLot: r4(sn.lotN), numAvg: r4(sn.avgN) });
  sn = null;
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { if (cur) rec.days.push(strip(cur)); pushSnap(); last = day; cur = day0(day); if (day % 5 === 0) sn = snap0(day); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
  const o = inTick; inTick = v; cur._tk = [0, 0];
  let ret;
  try { ret = _t.apply(this, arguments); } finally { inTick = o; }
  try {
    const n = (v.npcs || []).length;
    if (sn) addSnap(v);
    if (n > 0) {
      cur.vd++;
      const F = V1.totalFoodEquivalent(v), fpn = F / n; if (fpn < 30) cur.famine++; if (fpn >= 35) cur.gate35++;
      let cls = -1;
      if (V1.T1286_COOK_SPARE) {
        const wd = (v._world && v._world.day) || 0;
        const spare = v._t1286Gd === wd, cooked = !!(v._t1286C && v._t1286C.lastD === wd);
        cls = cooked ? 3 : !spare ? 0 : !v._t1286G ? 1 : 2;   // 0 남는 손 없음 · 1 문 닫힘 · 2 재료 없음 · 3 요리함
        cur.c[cls]++;
      }
      if (V1.T1309_HEALTH_EATEN) {
        const pb = pendBody.get(v) || [0, 0]; pendBody.delete(v);
        const exp = pb[0] + cur._tk[0], used = lhSum(v._t1309LotH);
        cur.expH += exp; cur.usedH += used[0]; cur.usedU += used[1]; cur.gapH += exp - used[0];
      }
      const nm = v.name || String(v.id);
      (rec.vill[nm] || (rec.vill[nm] = [])).push([day, n, +fpn.toFixed(1), cls]);
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
function strip(c) { const o = Object.assign({}, c); delete o._tk; for (const k of ['tagHU', 'bodyH', 'bodyU', 'tickH', 'tickU', 'expH', 'usedH', 'usedU', 'gapH']) o[k] = +o[k].toFixed(3); return o; }
process.on('exit', () => { try { if (cur) rec.days.push(strip(cur)); pushSnap(); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
