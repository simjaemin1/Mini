// (@regress 없음 — 러너 밖 · T1074 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1074-observe.js — 식량 빚(T1074) 판 자 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1074-observe.js" [T1074_FOOD_DEBT=1] node scripts/t577-server-run.js 800 1020,7,42
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1074.json` · 또는 `T1074_OUT=<파일>`)
//   장부 `scanDay`(econ 하루 끝)에서 날마다 마을마다 한 줄 — econ 이 그날 적어 둔 칸을 읽기만 한다(사본 0 · 새 수 0):
//     인구 · 그날 죽음(`_deadTot` 틱 앞뒤 차 · lib-day-deaths) · 빚 죽음 누계(`_fdDeadTot`) · 보호막이 막은 빚 죽음 누계(`_fdShield`) ·
//     빚 평균 · 빚 최대 · 빚 > 14 인 사람 수(`foodDebtOf` — 읽는 함수 하나) · 적응 평균(`_fdA`) · 곳간 식량 환산 · 징발 중 수 · 마을 해체 표지(`_dissolved`)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.env.T1074_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1074.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = { names: null, rows: [], cols: ['pop', 'deathsToday', 'deadTot', 'fdDead', 'fdShield', 'debtMean', 'debtMax', 'starving', 'adaptMean', 'tfe', 'drafted', 'dissolved'] };
const r3 = (x) => Math.round((+x || 0) * 1000) / 1000;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t1074] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, V.map((v) => {
    const fd = V1.foodDebtOf ? V1.foodDebtOf(v) : { mean: 0, max: 0, starving: 0 };
    let a = 0, dr = 0; for (const n of (v.npcs || [])) { a += n._fdA || 0; if (n._warDraft) dr++; }
    const N = (v.npcs || []).length;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    return [N, DD.deathsToday(v), v._deadTot || 0, v._fdDeadTot || 0, v._fdShield || 0, r3(fd.mean), r3(fd.max), fd.starving, r3(N ? a / N : 0), r3(tfe), dr, v._dissolved ? 1 : 0];
  })]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
