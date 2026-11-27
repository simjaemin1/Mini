'use strict';
// === scripts/t1484-observe.js — T1484 서버 판 곁 관찰기: 마을마다 · 날마다 장부(읽기만 · 세계 무변 · @regress 없음) ===
//   쓰는 법: T1484_OBS=<폴더> T1484_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   econ `tickVillage` 를 감싸(인자 · 돌려주는 값 그대로) 날이 바뀔 때마다 그 앞 날 끝의 마을 장부를 적는다. 세계 객체에는 쓰지 않는다(읽기 · 제 칸만).
//   마을마다 날마다: n(사람) · fe(곳간 식량 환산 `totalFoodEquivalent` — 1.0 = 사람 하루치) · fd(굶어 죽음 누계 `_fdDeadTot`) · dd(죽음 누계 `_deadTot`)
//     · em(떠남 누계 `_emigTot`) · fin / fout(그날 교역 장부에 오른 식량류 수량 — 들어온 · 나간 · 약탈 전 장부 값) · iso(봉쇄 중).
//   날마다(모든 마을 공통): car(길 위 캐러밴 수) · rows(그날 새 교역 장부 줄) · mon(달력 달) · sea(달력 철).
//   마을마다 한 번: 이름 · 땅(물 · 해안 · 경지 · 숲 · 돌 · 광석 · 사냥 · 땅 크기) · 좌표 · 가까운 이웃 8곳(econ 거리 `villageDist` 순 · 거리).
//   식량류 = v2 `FOOD_CLASSES` 와 같은 글자(food · fish · meat · cooked_food + `FORAGE_FOOD_FACTOR` 열쇠).
//   못 보는 것: 출생 · 들어온 이주자 · 먹은 양 · 약탈로 잃은 양(장부는 약탈 전 값) — 표에서 "계측 없음".
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1484_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const OUT = path.join(DIR, `obs-${process.env.T1484_ARM || 'x'}-${process.env.T577_SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
let CAL = null; try { CAL = require(path.join(ROOT, 'server', 'calendar')); } catch (e) {}
const FOODC = { food: 1, fish: 1, meat: 1, cooked_food: 1 };
for (const k of Object.keys(V1.FORAGE_FOOD_FACTOR || {})) FOODC[k] = 1;
const rec = { seed: +process.env.T577_SEED, arm: process.env.T1484_ARM || '?', names: null, stat: null, day: [], car: [], rows: [], mon: [], sea: [],
  n: [], fe: [], fd: [], dd: [], em: [], fin: [], fout: [], iso: [], infoRange: null, err: null };
let last = -1, world = null, vills = null, idx = null, lastWrite = 0;
const seen = new WeakSet();
let dayIn = null, dayOut = null;   // 아직 안 적은 날 몫 — 교역 장부 줄의 `day` 로 모은다(날 → Float64Array)
const acc = new Map();             // day → { fin: Float64Array, fout: Float64Array, rows }
function bucket(d) { let b = acc.get(d); if (!b) { b = { fin: new Float64Array(vills.length), fout: new Float64Array(vills.length), rows: 0 }; acc.set(d, b); } return b; }
function foodAmt(list) { let s = 0; for (const it of list) if (it && FOODC[it.res] && it.amt > 0) s += +it.amt; return s; }
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
    const g = foodAmt(give), t = foodAmt(get);
    bk.fout[a] += g; bk.fin[b] += g;      // 보낸 마을 → 받은 마을
    bk.fin[a] += t; bk.fout[b] += t;      // 사 온 것(되가져온 짐) : 상대 → 나
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
}
function snap(day) {   // day = 끝난 날
  try {
    if (!vills) { const VIL = require(path.join(ROOT, 'server', 'villages')); setup(VIL.__labProbe._t569Probe.setup().villages || []); }
    scanTrade();
    const bk = acc.get(day) || bucket(day), N = vills.length;
    const n = new Array(N), fe = new Array(N), fd = new Array(N), dd = new Array(N), em = new Array(N), iso = new Array(N);
    for (let i = 0; i < N; i++) {
      const v = vills[i]; n[i] = (v.npcs || []).length; fe[i] = +V1.totalFoodEquivalent(v).toFixed(2);
      fd[i] = v._fdDeadTot || 0; dd[i] = v._deadTot || 0; em[i] = v._emigTot || 0; iso[i] = v.isolated && day < v.isolatedUntilDay ? 1 : 0;
    }
    let mon = null, sea = null; try { if (CAL && CAL.dateOf) { mon = CAL.dateOf(day).month; sea = CAL.seasonOf(day); } } catch (e) {}
    rec.day.push(day); rec.car.push((world.caravans || []).length); rec.rows.push(bk.rows); rec.mon.push(mon); rec.sea.push(sea);
    rec.n.push(n); rec.fe.push(fe); rec.fd.push(fd); rec.dd.push(dd); rec.em.push(em); rec.iso.push(iso);
    rec.fin.push(Array.from(bk.fin, (x) => +x.toFixed(2))); rec.fout.push(Array.from(bk.fout, (x) => +x.toFixed(2)));
    for (const d of Array.from(acc.keys())) if (d <= day) acc.delete(d);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 500); }
  const now = Date.now();
  if (day % 50 === 0 || now - lastWrite > 120000) { lastWrite = now; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { if (last > 0) snap(last); last = day; }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0 && !rec.day.includes(last)) snap(last); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
