// (@regress 없음 — 러너 밖 · T1197 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1197-observe.js — 식사 · 굶어 죽음(T1197) 판 자 곁 프리로드 ===
//   쓰는 법(서버): NODE_OPTIONS="-r $PWD/scripts/t1197-observe.js" node scripts/t577-server-run.js 800 1020,7,42
//                  (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1197.json`)
//          (랩)  : NODE_OPTIONS="-r $PWD/scripts/t1197-observe.js" T1197_OUT=/tmp/x.json node scripts/t17-metrics.js 800 1020
//   장부 `scanDay`(econ 하루 끝)에서 날마다 마을마다 한 줄 — econ 이 그날 적어 둔 칸을 읽기만 한다(사본 0 · 새 수 0):
//     인구 · 죽음 누계(`_deadTot`) · 굶어 죽음 누계(`_fdDeadTot` — T1074 빚 죽음 · T1197 몸 게이지 죽음 같은 칸) · 보호막이 막은 수(`_fdShield`) ·
//     굶는 사람(`foodDebtOf().starving` — 끔 = 빚 > 14 · 켬 = 허기 극단) · 곳간 식량 환산(`totalFoodEquivalent`)
//   + 새 사람(어제 명부에 없던 id — 출생 + 들어옴) · 그날 철(`calendar.seasonOf` 정본) · 서버 판이면 호스트 몸 끼니 · 몸 죽음 수(`villages.__t1197.stat` — 켬 판만).
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.env.T1197_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1197.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const rec = { cols: ['pop', 'deadTot', 'fdDead', 'fdShield', 'starving', 'tfe', 'newIds'], names: null, rows: [], host: null, us: { batchMs: 0, days: 0 } };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
// 날 경계 econ 셈의 시간(마을 틱 전체 — 켬 · 끔 같은 자리)
if (typeof V1.tickVillage === 'function') {
  const tv = V1.tickVillage;
  // v2 는 `v1.tickVillage` 를 모듈 칸으로 부른다 — 칸을 감싸면 잰다(값 무변)
  V1.tickVillage = function () { const t0 = process.hrtime.bigint(); try { return tv.apply(this, arguments); } finally { rec.us.batchMs += Number(process.hrtime.bigint() - t0) / 1e6; } };
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t1197] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
const _seen = new Map();   // 마을 → 어제 명부 id(새 사람 = 출생 + 들어옴 · 랩은 들어옴 0)
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.us.days++;
  rec.rows.push([day, Cal.seasonOf(day), V.map((v) => {
    const fd = V1.foodDebtOf ? V1.foodDebtOf(v) : { starving: 0 };
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const ids = new Set((v.npcs || []).map((p) => p.id)), prev = _seen.get(v);
    let nw = 0; if (prev) for (const id of ids) if (!prev.has(id)) nw++;
    _seen.set(v, ids);
    return [(v.npcs || []).length, v._deadTot || 0, v._fdDeadTot || 0, v._fdShield || 0, fd.starving, r2(tfe), nw];
  })]);
}
process.on('exit', () => {
  try { const Vh = require.cache[require.resolve(path.join(ROOT, 'server', 'villages'))]; if (Vh && Vh.exports.__t1197) rec.host = Object.assign({}, Vh.exports.__t1197.stat); if (Vh && Vh.exports.__t1198) rec.host98 = Object.assign({}, Vh.exports.__t1198.stat); } catch (e) { /* 랩 */ }
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
