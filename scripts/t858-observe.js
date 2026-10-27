'use strict';
// (@regress 없음 — 러너 밖 · T858 관찰기 · 제품 무변 · 읽기만)
// === scripts/t858-observe.js — 보호막 걷기 × 도적 켬/끔 판의 하루 장부 — 랩 자 둘(`t17-metrics.js` · `t176-ab.js`)과 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:
//     랩:   T858_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t858-observe.js" node scripts/t17-metrics.js 800 1020      (`t176-ab.js` 도 같은 줄)
//     서버: NODE_OPTIONS="-r $PWD/scripts/t858-observe.js" node scripts/t577-server-run.js 400 1020,7,42             (아이 존만 · 판 JSON 곁 `<판>-<시드>.t858.json`)
//   손잡이(`T858_NO_SHIELD`)와 도적 끔 갈래(`scripts/t796-observe.js` · `scripts/diverge-ctl.js` 의 env)는 부르는 쪽 env 그대로 간다 — 이 파일은 아무것도 안 바꾼다.
//   장부 `scanDay`(econ 하루 끝 — 랩 자 둘 · 서버 훅이 다 같은 문)에서 날마다 마을마다 한 줄(econ 이 이미 가진 칸을 읽기만 · 사본 0):
//     [인구 · 곳간 식량 환산(`totalFoodEquivalent`) · 그날 굶어 죽음(`_deathsToday`) · 그날 보호막이 지운 압력(`_shieldAte`) · 징발(`_warDraft`) · 자유민(N − 징발 · T815 잣대)]
//   표 기계는 `scripts/t858-table.js` — 굶는 마을-날(인구 > 0 이고 곳간 식량 환산 < 인구 · T837 `diverge-table` 과 같은 잣대) · 묶임 · 몰사(T815 잣대)를 거기서 센다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T858_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t858.json' : '') : process.env.T858_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = { where: SERVER ? 'server' : path.basename(A1), knob: { T858_NO_SHIELD: process.env.T858_NO_SHIELD || null }, names: null, rows: [],
  cols: ['pop', 'tfe', 'deathsToday', 'shieldAte', 'drafted', 'free'] };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const r4 = (x) => Math.round((+x || 0) * 1e4) / 1e4;
let last = -1;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if ((day | 0) !== last) { last = day | 0; snap(world, day | 0); } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, V.map((v) => {
    const N = (v.npcs || []).length;
    let dr = 0; for (const n of (v.npcs || [])) if (n && n._warDraft) dr++;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    return [N, r2(tfe), DD.deathsToday(v), r4(v._shieldAte), dr, N - dr];
  })]);
}
process.on('exit', () => { try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
