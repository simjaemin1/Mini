'use strict';
// === scripts/t1488-observe.js — T1488 서버 판 곁 관찰기: 마을마다 · 날마다 사람 · 식량 장부 (읽기만 · 세계 무변 · @regress 없음) ===
//   쓰는 법: T1488_OBS=<폴더> T1488_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   T1484 관찰기 위에 얹었다. 같은 두 문(econ `tickVillage` 감쌈 · 날이 바뀔 때 앞 날 끝 기록) + 마을 하루 몸통(`tickWorldV2Parts().village`)을 감싸 곳간을 세 곳에서 읽는다.
//   세계 객체에는 쓰지 않는다(읽기 · 제 칸만 · 감싼 함수는 인자 · 돌려주는 값 그대로). 계산 없는 복사만 한다 — 새 주사위 0 · econ 함수 호출 0(캐시 칸만 읽는다).
//   마을마다 날마다(장부):
//     사람 — n · 태어남 b(처음 보는 몸 · 같은 판 몸 객체 추적) · 옮겨 옴 im(다른 마을 몸이 이 마을 명부에 든 수) · 떠남 em(`_emigTot` 증분) · 명부에서 사라진 몸 vn(죽음 · 떠남 · 도적 · 전쟁 합)
//          · 죽음 누계 dd 와 까닭 누계 fd(식량 빚) nat(나이) war(전쟁) cap(포로 나감 — 죽음 아님) wild(야생) kill(행상 피살)
//     식량(환산 = 사람 하루치) — S0 몸통 머리 곳간 · S1 `tickVillage` 뒤 · S3 몸통 끝(부패 뒤) · 거둔 것 hf 농(곡 · 작물) hs 어(fish 류) hm 사냥(meat) hg 채집 hc 요리 ho 보존식 · 그 밖 —
//          `dailyProductionBuf`(그날 econ 생산 버퍼 · 몸이 곳간에 넣은 것도 econ 이 여기 적는다) 품목 × 환산 · 먹은 것 eat = `_foodEaten` × 환산 · 썩은 것 sp = S1 − S3(tickVillage 뒤 몸통 끝까지 줄어든 것: 부패 정본 `tickDecay` 뿐)
//          · 들여온 것 fin · 내보낸 것 fout(교역 장부 줄의 식량류 수량 × 환산 · 약탈 전 값 · xzone 줄 제외)
//     결정 — g1297(출생 곳간 문이 닫혔나 `_t1297Gate`) g1374 g1149 · nd(켬: 그날 버틸 날 캐시 `_t1419N.d` · 안 물었으면 null)
//   교역 줄(하루 · 쌍) rt: [날, 보낸 마을, 받은 마을, 식량 보냄 환산, 식량 되가져옴 환산] — 물 먼 땅 들여오는 길 표용
//   못 보는 것: 곡 · 작물이 밭에 서 있는 동안(익는 날 곳간에 든다) 거둔 몫의 시차 · 세금(TAX_RATE · treasury) · 약탈 · 몸이 곳간에 넣는 시차 — 표의 "장부 틈"으로 센다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1488_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const OUT = path.join(DIR, `obs-${process.env.T1488_ARM || 'x'}-${process.env.T577_SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
let CAL = null; try { CAL = require(path.join(ROOT, 'server', 'calendar')); } catch (e) {}
let FG = null; try { FG = require(path.join(ROOT, 'server', 'fish-goods')); } catch (e) {}
const FORAGE = V1.FORAGE_FOOD_FACTOR || {};
const PRES = new Set(V1.PRESERVED_FOODS || []);
const RAWG = new Set(V1.RAW_GRAINS || []);
const FIELDS = ['n', 'fe', 'fd', 'dd', 'em', 'nat', 'war', 'cap', 'wild', 'kill', 'iso', 'b', 'im', 'vn', 'S0', 'S1', 'S3', 'hf', 'hs', 'hm', 'hg', 'hc', 'ho', 'eat', 'fin', 'fout', 'g1297', 'g1374', 'g1149', 'nd'];
const rec = { seed: +process.env.T577_SEED, arm: process.env.T1488_ARM || '?', names: null, stat: null, day: [], car: [], rows: [], mon: [], sea: [], rt: [], cn: [], infoRange: null, err: null,
  knobs: { T1419: V1.T1419_FOOD_NEED || '', T1297_BIRTH_FOOD: !!V1.T1297_BIRTH_FOOD, T1374_BIRTH_HARV: !!V1.T1374_BIRTH_HARV, T1306_MIGRATE_FOOD: process.env.T1306_MIGRATE_FOOD || '', T1312_HERD: process.env.T1312_HERD || '', T1243_FARM_ON: !!V1.T1243_FARM_ON, DAILY_FOOD_CONSUMPTION: V1.DAILY_FOOD_CONSUMPTION },
  legacyNeed: [], tags: [] };
for (const f of FIELDS) rec[f] = [];
let last = -1, world = null, vills = null, idx = null, lastWrite = 0;
const seen = new WeakSet();            // 교역 장부 줄
const where = new WeakMap();           // 몸 객체 → 마지막으로 본 마을 칸
const acc = new Map();                 // 날 → { rows, fin, fout, rt }
const cur = new Map();                 // 날 → 마을 칸마다 몸통 안 기록
let inBody = null;                     // 지금 몸통을 도는 마을
const facCache = new Map();
function bucket(d) { let b = acc.get(d); if (!b) { b = { fin: new Float64Array(vills.length), fout: new Float64Array(vills.length), rows: 0, rt: [] }; acc.set(d, b); } return b; }
function curOf(d) { let c = cur.get(d); if (!c) { c = {}; cur.set(d, c); } return c; }
function fac(v, r) {   // 식량 환산(품목 1 단위 = 사람 하루치의 몇 배) · 식량 아니면 0
  let f = facCache.get(r); if (f !== undefined) return f;
  try { f = +V1.storageFoodPer(v, r) || 0; } catch (e) { f = 0; }
  if (!(f > 0) && Object.prototype.hasOwnProperty.call(FORAGE, r)) f = FORAGE[r];
  facCache.set(r, f); return f;
}
function grp(r) {   // 거둔 품목 → 직업 몫(품목 기준 · 직업 계측 없음)
  if (r === 'cooked_food') return 'hc';
  if (r === 'meat') return 'hm';
  if (r === 'fish' || (FG && FG.isItem && FG.isItem(r))) return 'hs';
  if (Object.prototype.hasOwnProperty.call(FORAGE, r)) return 'hg';
  if (PRES.has(r)) return 'ho';
  return 'hf';
}
function foodAmt(v, list) { let s = 0; for (const it of list) if (it && it.res && it.amt > 0) { const f = fac(v, it.res); if (f > 0) s += it.amt * f; } return s; }
function scanTrade() {
  const tl = world.tradeLog || []; let k = tl.length - 1; const fresh = [];
  while (k >= 0 && !seen.has(tl[k])) { fresh.push(tl[k]); k--; }
  for (let i = fresh.length - 1; i >= 0; i--) {
    const r = fresh[i]; seen.add(r);
    if (r.xzone) continue;
    const a = idx.get(r.from), b = idx.get(r.to); const bk = bucket(+r.day || 0); bk.rows++;
    if (a == null || b == null || r.abandoned || r.rerouted) continue;
    const give = Array.isArray(r.basket) ? r.basket : [r.sent, r.sent2];
    const get = Array.isArray(r.retBasket) ? r.retBasket : [r.bought];
    const g = foodAmt(vills[a], give), t = foodAmt(vills[b], get);
    bk.fout[a] += g; bk.fin[b] += g;
    bk.fin[a] += t; bk.fout[b] += t;
    bk.rt.push([+r.day || 0, a, b, +g.toFixed(2), +t.toFixed(2)]);
  }
}
function setup(vs) {
  vills = vs.map((x) => x.econ).filter(Boolean); world = vills[0] && vills[0]._world;
  idx = new Map(vills.map((v, i) => [v.name, i]));
  rec.names = vills.map((v) => v.name); rec.infoRange = world && world.infoRange;
  rec.stat = vills.map((v) => {
    const L = v._origLand || v.land || {}, ds = vills.map((u, j) => [j, u === v ? Infinity : V1.villageDist(v, u)]).sort((p, q) => p[1] - q[1]).slice(0, 8);
    return { name: v.name, water: L.water, coastal: L.coastal, arable: L.arable, wood: L.wood, stone: L.stone, ore: L.ore, game: L.game, fertility: L.fertility, size: L.size, founder: !!v.founder,
      x: v.coord && v.coord.x, y: v.coord && v.coord.y, near: ds.map((p) => [p[0], +(+p[1]).toFixed(1)]) };
  });
  for (let i = 0; i < vills.length; i++) for (const p of vills[i].npcs || []) where.set(p, i);
}
function ensure() {
  if (!vills) { const VIL = require(path.join(ROOT, 'server', 'villages')); setup(VIL.__labProbe._t569Probe.setup().villages || []); }
}
function snap(day) {   // day = 끝난 날
  try {
    ensure();
    scanTrade();
    const bk = acc.get(day) || bucket(day), N = vills.length, cu = cur.get(day) || {};
    const F = {}; for (const f of FIELDS) F[f] = new Array(N).fill(0);
    F.nd = new Array(N).fill(null);
    const now = new Array(N);
    for (let i = 0; i < N; i++) {
      const v = vills[i], npcs = v.npcs || [];
      let b = 0, im = 0; const set = new Set(npcs); now[i] = set;
      for (const p of npcs) { const w = where.get(p); if (w === undefined) b++; else if (w !== i) im++; where.set(p, i); }
      F.b[i] = b; F.im[i] = im; F.n[i] = npcs.length;
      F.fe[i] = +V1.totalFoodEquivalent(v).toFixed(2);
      F.fd[i] = v._fdDeadTot || 0; F.dd[i] = v._deadTot || 0; F.em[i] = v._emigTot || 0; F.nat[i] = v._natDeadTot || 0; F.war[i] = v._warDeadTot || 0;
      F.cap[i] = v._capOutTot || 0; F.wild[i] = v._wildDeadTot || 0; F.kill[i] = +((v.tradeStats && v.tradeStats.tradersKilled) || 0);
      F.iso[i] = v.isolated && day < v.isolatedUntilDay ? 1 : 0;
      const c = cu[i];
      if (c) for (const f of ['S0', 'S1', 'S3', 'hf', 'hs', 'hm', 'hg', 'hc', 'ho', 'eat', 'g1297', 'g1374', 'g1149']) F[f][i] = c[f] || 0;
      if (c && c.nd != null) F.nd[i] = c.nd;
      F.fin[i] = +bk.fin[i].toFixed(2); F.fout[i] = +bk.fout[i].toFixed(2);
    }
    // 사라진 몸: 지난 기록에 이 마을 명부였는데 지금 이 마을 명부가 아닌 몸(몸 객체 추적 — 마지막으로 본 칸이 i 인 채 남은 수는 where 로는 못 센다 → 마을별 지난 명부 집합)
    if (lastSets) for (let i = 0; i < N; i++) { let g = 0; for (const p of lastSets[i]) if (!now[i].has(p)) g++; F.vn[i] = g; }
    lastSets = now;
    let mon = null, sea = null; try { if (CAL && CAL.dateOf) { mon = CAL.dateOf(day).month; sea = CAL.seasonOf(day); } } catch (e) {}
    rec.day.push(day); rec.car.push((world.caravans || []).length); rec.rows.push(bk.rows); rec.mon.push(mon); rec.sea.push(sea);
    for (const f of FIELDS) rec[f].push(F[f]);
    for (const r of bk.rt) rec.rt.push(r);
    if (day % 10 === 0) {   // 켬이 읽는 자리 호출수(읽기만) · 끔 대조용 종전 날 수
      try { rec.tags.push([day, V1.t1419Stat ? V1.t1419Stat() : null]); } catch (e) {}
      try { rec.legacyNeed.push([day, V1.t1297NeedDays ? +V1.t1297NeedDays(day, null) : null, V1.t1319MigNeedDays ? +V1.t1319MigNeedDays(day, null) : null]); } catch (e) {}
    }
    for (const d of Array.from(acc.keys())) if (d <= day) acc.delete(d);
    for (const d of Array.from(cur.keys())) if (d <= day) cur.delete(d);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 500); }
  const t = Date.now();
  if (day % 50 === 0 || t - lastWrite > 120000) { lastWrite = t; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
}
let lastSets = null;
function dayCheck(day) { if (day !== last) { if (last > 0) snap(last); last = day; } }
function vIndex(v) { ensure(); return vills ? vills.indexOf(v) : -1; }

const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  dayCheck(day);
  const r = _t.apply(this, arguments);
  if (inBody === v) {
    try {
      const i = vIndex(v); if (i >= 0) {
        const c = curOf(day); const o = c[i] || (c[i] = {});
        o.S1 = +V1.totalFoodEquivalent(v).toFixed(3);
        const g = { hf: 0, hs: 0, hm: 0, hg: 0, hc: 0, ho: 0 };
        if (v.npcs && v.npcs.length > 0) {   // 빈 마을은 `tickVillage` 가 바로 돌아와 버퍼가 어제 값으로 남는다 → 0
          const buf = v.dailyProductionBuf || {};
          for (const k in buf) { const a = buf[k]; if (!(a > 0)) continue; const f = fac(v, k); if (f > 0) g[grp(k)] += a * f; }
          let eat = 0; const ee = v._foodEaten || {};
          for (const k in ee) { const a = ee[k]; if (!(a > 0)) continue; const f = fac(v, k); if (f > 0) eat += a * f; }
          o.eat = +eat.toFixed(3);
        } else o.eat = 0;
        for (const k in g) o[k] = +g[k].toFixed(3);
        o.g1297 = v._t1297Gate ? 1 : 0; o.g1374 = v._t1374Gate ? 1 : 0; o.g1149 = v._t1149Gate ? 1 : 0;
        const nn = v._t1419N; o.nd = nn && nn.day === (day | 0) && typeof nn.d === 'number' ? +nn.d.toFixed(2) : null;
      }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 500); }
  }
  return r;
};
const _P = V2.tickWorldV2Parts;
V2.tickWorldV2Parts = function () {
  const P = _P.apply(this, arguments);
  try {
    if (P && typeof P.village === 'function' && !P.village.__t1488) {
      const pv = P.village;
      P.village = function (v) {
        const day = (v && v._world && v._world.day) | 0; dayCheck(day);
        let i = -1, S0 = 0;
        try { i = vIndex(v); if (i >= 0) S0 = +V1.totalFoodEquivalent(v).toFixed(3); } catch (e) {}
        inBody = v;
        try { return pv.apply(this, arguments); }
        finally {
          inBody = null;
          try { if (i >= 0) { const o = curOf(day)[i] || (curOf(day)[i] = {}); o.S0 = S0; o.S3 = +V1.totalFoodEquivalent(v).toFixed(3); } } catch (e) {}
        }
      };
      P.village.__t1488 = true;
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 500); }
  return P;
};
process.on('exit', () => { if (last > 0 && !rec.day.includes(last)) snap(last); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
