'use strict';
// (@regress 없음 — 러너 밖 · T1388 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1388-observe.js — 끔 세계 식량 장부 분해: 먹은 식량을 출처로(마을 · 달 · 마을 유형 · 철) ======================
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1388-observe.js" node scripts/t577-server-run.js <날> <시드>   (판 JSON 곁 `<판>-<시드>.t1388.json` · `T1388_OUT` 이면 그 자리)
//   판 자(부모)는 안 적는다 — 존(아이)에서만.
// ★훅(메모리에서만 · 파일 무접촉) — econ 을 읽을 때 글자 자리 일곱에 부름 하나씩을 덧댄다(값 무변 · 하네스 `test-t1388-farm-gap` ② 가 바이트 같음을 본다):
//   ㉮ 수식 산출(`addProduce` 곳간 줄 · 어종 정확 갈래) — 직업 · 품목 · 든 낱개 ㉯ 부산물 루프 표지(그 부름 동안만) ㉰ 앵커 수확(`_t100Credit`)
//   ㉱ 텃밭 하한(`gardenFloorTopUp`) ㉲ 밭 작물(`_t368Credit`) ㉳ 먹음(`consumeFood` — 그날 먹은 하루치 = 필요 − 모자람)
// ★장부(마을마다 · 칸 = 출처): 들어온 몫은 그 출처 칸에 · 나간 몫(먹음 · 그 밖 줄어듦)은 칸 비례로 뺀다 · 먹은 몫도 칸 비례로 출처에 적는다.
//   그 밖 줄어듦/늘어남 = 곳간 식량(`totalFoodEquivalent`) 차 − 든 몫 + 먹은 몫(썩음 · 갈무리 · 요리 · 나감 · 들어옴 — 칸 `잔차`).
//   처음 곳간 = 칸 `start`(마을을 처음 본 날의 곳간). 단위 = 하루치(econ 식량 1 = `DAY_KCAL`).
//   출처 칸: farm(농부 주산출) · farmBy(농부 부산물 곡식) · harvest(앵커 수확 n × T100_K) · garden(텃밭 하한) · crop(밭 작물 낱개) ·
//            fish · hunt · forage · <직업>(그 밖 직업 산출 — 요리사 · 나무꾼 …) · start · gain(잔차가 늘린 몫)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = !SERVER ? '' : (process.env.T1388_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1388.json' : ''));
if (!OUT && !process.env.T1388_INPROC) return;
const ROOT = path.join(__dirname, '..');
const ES = path.join(ROOT, 'sim', 'economy-sim.js');
const HOOKS = [
  ["else v.storage[r] = (v.storage[r] || 0) + (amt - tax);", "else v.storage[r] = (v.storage[r] || 0) + (amt - tax); if (globalThis.__t1388in) globalThis.__t1388in(v, globalThis.__t1388by ? 'farmBy' : npc.currentJob, r, amt - tax);"],
  ["if(T1192_FISH_SPECIES&&exactPreserve){if(!(amt>0))return;v.storage[r]=(v.storage[r]||0)+amt;", "if(T1192_FISH_SPECIES&&exactPreserve){if(!(amt>0))return;v.storage[r]=(v.storage[r]||0)+amt;if(globalThis.__t1388in)globalThis.__t1388in(v,npc.currentJob,r,amt);"],
  ["addProduce(r, baseAmt * rate);", "{ globalThis.__t1388by = npc.currentJob === 'farmer' ? 1 : 0; addProduce(r, baseAmt * rate); globalThis.__t1388by = 0; }"],
  ["function _t100Credit(v, amt) {", "function _t100Credit(v, amt) { if (amt > 0 && globalThis.__t1388in) globalThis.__t1388in(v, 'harvest', 'food', amt - amt * TAX_RATE);"],
  ["v._t100FloorTot = (v._t100FloorTot || 0) + gap;", "v._t100FloorTot = (v._t100FloorTot || 0) + gap; if (globalThis.__t1388in) globalThis.__t1388in(v, 'garden', 'food', gap - tax);"],
  ["v._t368FoodTot = (v._t368FoodTot || 0) + fe;", "v._t368FoodTot = (v._t368FoodTot || 0) + fe; if (globalThis.__t1388in) globalThis.__t1388in(v, 'crop', crop, units - tax);"],
  ["function consumeFood(v, need) {", "function consumeFood(v, need) { const __g = __t1388Eat0(v, need); if (globalThis.__t1388eat) globalThis.__t1388eat(v, need - (__g > 0 ? __g : 0)); return __g; }\nfunction __t1388Eat0(v, need) {"],
];
const Module = require('module'), _comp = Module.prototype._compile;
const HOOKN = [];
Module.prototype._compile = function (c, f) {
  if (f === ES) { for (const [a, b] of HOOKS) { const n = c.split(a).length - 1; HOOKN.push(n); if (n === 1) c = c.replace(a, b); } }
  return _comp.call(this, c, f);
};
const E = require(ES);
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const JOBSRC = { farmer: 'farm', fisher: 'fish', hunter: 'hunt', forager: 'forage' };
const L = new Map();   // 마을 이름 → { b: {출처: 칸}, s0: 지난 곳간, inn: {출처: 오늘 든}, eat: 오늘 먹은 }
let curV = null;
function feOf(v, r, a) {
  if (!(a > 0) || /^seed_/.test(r)) return 0;
  try { if (E.T1243_FARM_ON) { const f = E.storageFoodPer(v, r); return f > 0 ? a * f : 0; } } catch (_) {}
  try { const o = Object.create(v), st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; for (const k of Object.keys(v.storage || {})) st[k] = 0; st[r] = a; o.storage = st; const f = E.totalFoodEquivalent(o); return f > 0 ? f : 0; } catch (_) { return 0; }   // 그 품목만 든 곳간(칸은 다 0 — 끈 세계 합계식이 칸 없음을 NaN 으로 읽는다)
}
function led(v) { let x = L.get(v.name); if (!x) { x = { b: {}, s0: null, inn: {}, eat: 0 }; L.set(v.name, x); } return x; }
const TRANSFORM = new Set(['cook']);   // 요리사 — 곳간 식량을 조리식으로 바꾼다(새 식량 아님 · 든 몫으로 안 센다 — 그 차는 잔차)
globalThis.__t1388in = (v, src, r, a) => { if (!v || !v.name || TRANSFORM.has(src)) return; const f = feOf(v, r, a); if (!(f > 0)) return; const k = JOBSRC[src] || src; const x = led(v); x.inn[k] = (x.inn[k] || 0) + f; };
globalThis.__t1388eat = (v, a) => { if (!v || !v.name || !(a > 0)) return; led(v).eat += a; };
const typeOf = (n) => (/^농촌/.test(n) ? '농촌' : /^어촌/.test(n) ? '어촌' : /^임업/.test(n) ? '임업' : /^광산/.test(n) ? '광산' : '그 밖');
const seasonOf = (m) => (m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울');
const rec = { hooks: null, cols: ['ym', 'name', 'pop', 'tfe', 'eat', 'resid'], src: [], rows: [], ag: {}, tot: { eat: 0, eatBy: {}, inBy: {}, resid: 0, gain: 0, loss: 0, closeMax: 0 } };
const MON = new Map();   // 마을-달 → { pop, tfe, eat, resid, eatBy, inBy }
function settle(v, day) {
  const x = led(v), S1 = E.totalFoodEquivalent(v) || 0;
  if (x.s0 === null) { x.s0 = Math.max(0, S1 - sumIn(x) + x.eat); x.b.start = x.s0; }   // 처음 본 날 — 틱 앞 곳간(그날 든 몫을 빼고 먹은 몫을 더해) = 처음 부존 칸
  const In = sumIn(x);
  for (const [k, f] of Object.entries(x.inn)) x.b[k] = (x.b[k] || 0) + f;
  const resid = S1 - x.s0 - In + x.eat;   // + 늘어남(들어옴 · 요리 덤) · − 줄어듦(썩음 · 갈무리 · 나감)
  if (resid > 0) x.b.gain = (x.b.gain || 0) + resid;
  const B = Object.values(x.b).reduce((a, c) => a + c, 0), out = x.eat + (resid < 0 ? -resid : 0);
  const eatBy = {};
  if (B > 0) { const kE = x.eat / B, kO = Math.min(1, out / B); for (const k of Object.keys(x.b)) { eatBy[k] = x.b[k] * kE; x.b[k] -= x.b[k] * kO; } }
  else if (x.eat > 0) eatBy.unknown = x.eat;
  const t = CAL.dateOf(day), ym = t.year * 100 + t.month, key = ym + '|' + v.name;
  let m = MON.get(key); if (!m) { m = { ym, name: v.name, pop: 0, tfe: 0, eat: 0, resid: 0, eatBy: {}, inBy: {} }; MON.set(key, m); }
  m.pop = (v.npcs || []).length; m.tfe = S1; m.eat += x.eat; m.resid += resid;
  for (const [k, f] of Object.entries(eatBy)) m.eatBy[k] = (m.eatBy[k] || 0) + f;
  for (const [k, f] of Object.entries(x.inn)) m.inBy[k] = (m.inBy[k] || 0) + f;
  const T = rec.tot; T.eat += x.eat; T.resid += resid; if (resid > 0) T.gain += resid; else T.loss -= resid;
  for (const [k, f] of Object.entries(eatBy)) T.eatBy[k] = (T.eatBy[k] || 0) + f;
  for (const [k, f] of Object.entries(x.inn)) T.inBy[k] = (T.inBy[k] || 0) + f;
  const ag = rec.ag[typeOf(v.name) + '|' + seasonOf(t.month) + '|' + t.year] || (rec.ag[typeOf(v.name) + '|' + seasonOf(t.month) + '|' + t.year] = { eat: 0, eatBy: {}, popDays: 0 });
  ag.eat += x.eat; ag.popDays += (v.npcs || []).length; for (const [k, f] of Object.entries(eatBy)) ag.eatBy[k] = (ag.eatBy[k] || 0) + f;
  const close = Math.abs(Object.values(x.b).reduce((a, c) => a + c, 0) - Math.max(0, S1));   // 칸 합 ↔ 곳간(먹음 · 잔차를 다 뺀 뒤)
  if (close > T.closeMax) T.closeMax = close;
  x.s0 = S1; x.inn = {}; x.eat = 0;
}
function sumIn(x) { let a = 0; for (const f of Object.values(x.inn)) a += f; return a; }
function dump() {
  rec.hooks = HOOKN.slice(0, HOOKS.length);
  const src = new Set(); for (const m of MON.values()) for (const k of Object.keys(m.eatBy)) src.add(k);
  rec.src = [...src].sort(); rec.cols = ['ym', 'name', 'pop', 'tfe', 'eat', 'resid', ...rec.src.map((k) => 'e_' + k), ...rec.src.map((k) => 'i_' + k)];
  rec.rows = [...MON.values()].map((m) => [m.ym, m.name, m.pop, +m.tfe.toFixed(2), +m.eat.toFixed(3), +m.resid.toFixed(3), ...rec.src.map((k) => +(m.eatBy[k] || 0).toFixed(3)), ...rec.src.map((k) => +(m.inBy[k] || 0).toFixed(3))]);
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {}
  return rec;
}
const _t = E.tickVillage;
let lastDay = -1;
E.tickVillage = function (v, day) {
  const r = _t.apply(this, arguments);
  try { if (v && v.name) settle(v, day); if (day !== lastDay) { lastDay = day; if (day % 20 === 0) dump(); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { dump(); } catch (_) {} });
module.exports = { dump, HOOKS, HOOKN };
