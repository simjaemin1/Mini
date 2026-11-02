// (@regress 없음 — 러너 밖 · T1075 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1075-observe.js — 행복 평형(T1075) 판 자 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1075-observe.js" [T1074_FOOD_DEBT=1] [T1075_HAPPY_EQ=1] node scripts/t577-server-run.js 800 1020,7,42
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1075.json` · 또는 `T1075_OUT=<파일>`)
//   장부 `scanDay`(econ 하루 끝)에서 날마다 마을마다 한 줄 — econ 이 그날 적어 둔 칸을 읽기만 한다(사본 0 · 새 수 0):
//     인구 · 실제 행복 H(`lastStats.happiness` — 켬이면 `v._H`) · 평형 H*(`lastStats.happinessEq` · 끔이면 그날 값과 같다) · 이탈 누계(`_emigTot`) ·
//     길 없어 못 떠난 압력 누계(`_emigLost`) · 그날 죽음(lib-day-deaths) · 빚 죽음 누계(`_fdDeadTot`) · 마을 평균 빚(`foodDebtOf`) · 해체 표지
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.env.T1075_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1075.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = { names: null, rows: [], cols: ['pop', 'H', 'Heq', 'emigTot', 'emigLost', 'deathsToday', 'fdDead', 'debtMean', 'dissolved'] };
const r3 = (x) => Math.round((+x || 0) * 1000) / 1000;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t1075] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, V.map((v) => {
    const st = v.lastStats || {};
    const fd = V1.foodDebtOf ? V1.foodDebtOf(v) : { mean: 0 };
    return [(v.npcs || []).length, r3(st.happiness), r3(st.happinessEq != null ? st.happinessEq : st.happiness), v._emigTot || 0, r3(v._emigLost), DD.deathsToday(v), v._fdDeadTot || 0, r3(fd.mean), v._banditized ? 1 : 0];
  })]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
